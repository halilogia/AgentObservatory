import { globalSqlite } from '../core/sqlite_store.ts';
import type { TaskEvent, TaskSummary } from '../core/types.ts';
import { TranscriptRenderer } from './transcript.ts';
import { paint, cleanText, truncate, describeTool, hms } from './tui.ts';
import { openWebPanel } from '../commands/web_opener.ts';
import { renderOfficeView } from './office_view.ts';
import { startIngest } from '../ingest/index.ts';

// Ağaç görünümü: aynı anda çalışan birçok ajanı tek akışa karıştırmadan, ajan başına 2 satırla gösterir.
// Mevcut `watch` / `chat` görünümlerine dokunmaz; yalnızca SQLite'taki görev kayıtlarını okur.
//   node --experimental-strip-types src/cli.ts tree [--once]
// Ağaç:   ↑/↓ (veya J/K) seç · Enter ayrıntı · A sadece çalışanlar/hepsi · Q çıkış
// Ayrıntı: ajanın kendi sohbet görünümü (canlı); ↑/↓ kaydır · Esc/Backspace geri · Q çıkış

const STALE_MS = 60 * 60 * 1000;   // bir saatten uzun "çalışıyor" görünen kayıtlar büyük olasılıkla bitmemiş eski oturumlardır
const TASK_LIMIT = 80;

type Color = Parameters<typeof paint>[0];
const AGENT_COLOR: Record<string, Color> = {
  claude: 'magenta', codex: 'cyan', agy: 'blue', opencode: 'yellow', commandcode: 'gray', hermes: 'green', ollama: 'white', freebuff: 'white'
};

function fmtDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}d${String(sec % 60).padStart(2, '0')}s`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return String(n);
}

function isLive(t: TaskSummary, now: number): boolean {
  return (t.status === 'running' || t.status === 'pending') && now - t.startTime < STALE_MS;
}

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
const ANSI_AT = /\x1b\[[0-9;?]*[A-Za-z]/y;

/** ANSI kaçış dizilerini saymadan görünür karakter uzunluğu. */
export function visibleLen(s: string): number {
  return s.replace(ANSI_RE, '').length;
}

/** ANSI kodlarını koruyarak satırı görünür genişliğe göre keser; renk taşmasını sıfırlar. */
function clipAnsi(s: string, max: number): string {
  if (max <= 0) return '';
  if (visibleLen(s) <= max) return s;
  const limit = Math.max(1, max - 1);
  let out = '';
  let vis = 0;
  for (let i = 0; i < s.length;) {
    // yapışkan (y) regex: her karakterde s.slice(i) kopyası yok (eski hali uzun satırda O(n²) idi)
    ANSI_AT.lastIndex = i;
    const m = s.charCodeAt(i) === 27 ? ANSI_AT.exec(s) : null;
    if (m) { out += m[0]; i += m[0].length; continue; }
    if (vis >= limit) break;
    out += s[i];
    vis++;
    i++;
  }
  return out + '…' + '\x1b[0m';
}

/**
 * Yalnızca bugün etkin olan görevler (bitiş veya başlangıç zamanı bugüne ait) ya da şu an çalışanlar.
 * Bugün hiç görev yoksa geçmişi tamamen gizlemek yerine listedeki en yeni görevleri (TASK_LIMIT'e kadar) göster.
 */
function todayOrLatest(tasks: TaskSummary[], now: number): TaskSummary[] {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const today = tasks.filter((t) => isLive(t, now) || t.startTime >= startOfToday || (t.endTime ?? t.startTime) >= startOfToday);
  return (today.length > 0 ? today : tasks).slice(0, TASK_LIMIT);
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const spinFrame = (now: number): string => SPINNER[Math.floor(now / 200) % SPINNER.length];

/** Ekranda çalışan bir görev var mı: animasyon zamanlayıcısı yalnızca o zaman sık çizer (son çizimden). */
let hasLive = false;

/** Ayrıntı sayfası durum satırı: dönen ikon · son araç · süre · araç sayısı çubuğu (çalışırken kısa ışık hareketi). */
function liveBar(t: TaskSummary, now: number, width: number): string {
  const n = t.toolsUsed.length;
  const tool = t.toolsUsed[n - 1];
  const label = tool ? toolLine(tool.name, tool.input) : 'başlıyor…';
  const SEG = 12;
  const filled = Math.min(n, SEG);
  const pulse = Math.floor(now / 250) % 2 === 0;
  const bar = '▰'.repeat(Math.max(0, filled - 1)) + (filled > 0 ? (pulse ? '▰' : '▱') : '') + '▱'.repeat(SEG - filled);
  const tail = ` ${fmtDuration(now - t.startTime)} ${paint('yellow', bar)} ${paint('gray', n + ' araç')}`;
  return `${paint('yellow', spinFrame(now))} ${truncate(label, Math.max(10, width - 32))}${tail}`;
}

function statusGlyph(t: TaskSummary, now: number): string {
  if (isLive(t, now)) return paint('yellow', spinFrame(now));
  if (t.status === 'running' || t.status === 'pending') return paint('gray', '◌');
  if (t.status === 'completed') return paint('green', '✔');
  if (t.status === 'cancelled') return paint('gray', '■');
  return paint('red', '✖');
}

export const DEFAULT_AGENT_MODEL: Record<string, string> = {
  codex: 'gpt-6-astra',
  claude: 'claude-sonnet-5-5',
  agy: 'gemini-3.8-flash',
  opencode: 'opencode/big-pickle',
  commandcode: 'commandcode'
};

/** Kullanılan model adı; model belirtilmemişse veya ajan adıyla aynıysa ajanın varsayılan modeli. */
export function modelName(t: TaskSummary): string {
  if (t.model && t.model !== t.agent) return t.model;
  return DEFAULT_AGENT_MODEL[t.agent] || t.model || t.agent;
}

function toolLine(name: string, input: any): string {
  const info = describeTool(name, input);
  return `${info.name} ${info.target}`.trim();
}

/** assistantText 50 KB'a kadar büyür: temizlenmiş hali görev nesnesi başına bir kez hesaplanır (animasyon her 200 ms'de çizer). */
const cleanedText = new WeakMap<TaskSummary, string>();
function cleanAssistant(t: TaskSummary): string {
  let v = cleanedText.get(t);
  if (v === undefined) { v = cleanText(t.assistantText); cleanedText.set(t, v); }
  return v;
}

function lastActivity(t: TaskSummary, width: number): string {
  if (t.error) return paint('red', 'hata: ' + truncate(cleanText(t.error), width));
  const tool = t.toolsUsed[t.toolsUsed.length - 1];
  if (t.status === 'running' && tool) return paint('gray', '› ' + truncate(toolLine(tool.name, tool.input), width));
  const text = cleanAssistant(t);
  if (text) {
    // son söz: kelime ortasından başlamasın
    const tail = text.length > width ? text.slice(-width).replace(/^\S*\s/, '') : text;
    return paint('gray', '“' + truncate(tail, width) + '”');
  }
  if (tool) return paint('gray', '› ' + truncate(toolLine(tool.name, tool.input), width));
  return paint('gray', truncate(cleanText(t.prompt), width));
}

/** Alt ajan rozeti: `[N alt ajan]` (dal kapalıysa önünde ▸). */
function subBadge(n: number, folded = false): string {
  return n > 0 ? ' ' + paint('magenta', (folded ? '▸ ' : '') + `[${n} alt ajan]`) : '';
}

function nodeLines(t: TaskSummary, prefix: string, childPrefix: string, cols: number, now: number, selected: boolean, label?: string, badge = ''): string[] {
  const contentWidth = Math.max(30, cols - 3);
  const dur = fmtDuration(isLive(t, now) ? now - t.startTime : t.durationMs);
  const tag = (label ? paint('gray', label + ' ') : '') + (teamBadge(t.agent) ? teamBadge(t.agent) + ' ' : '') + paint(AGENT_COLOR[t.agent] || 'white', paint('bold', modelName(t)));
  const tokens = t.usage?.totalTokens ? paint('gray', ' · ' + fmtTokens(t.usage.totalTokens) + ' tok') : '';
  const mark = selected ? paint('cyan', '▸') : ' ';
  const head = `${mark}${prefix}${statusGlyph(t, now)} ${tag} ${paint('gray', t.taskId.slice(-8))} ${paint('gray', 'başladı ' + hms(t.startTime) + ' · ' + (isLive(t, now) ? 'sürüyor ' : 'sürdü ') + dur)}${tokens}${badge}`;
  const act = lastActivity(t, Math.max(20, contentWidth - childPrefix.length - 5));
  return [clipAnsi(head, contentWidth), clipAnsi(` ${childPrefix}${act}`, contentWidth)];
}

/** Takım rozeti: renkli nokta + takım adı (emoji değil). Takımlar: turuncu=claude, mavi=agy, kırmızı=codex, siyah=opencode. */
const AGENT_TEAM: Record<string, { name: string; color: Color }> = {
  claude: { name: 'turuncu', color: 'orange' }, agy: { name: 'mavi', color: 'blue' }, codex: { name: 'kırmızı', color: 'red' }, opencode: { name: 'siyah', color: 'gray' }, commandcode: { name: 'siyah', color: 'gray' }
};
export function teamBadge(agent: string): string {
  const tm = AGENT_TEAM[agent];
  return tm ? paint(tm.color, '●') : '';
}

/** Oturum satırı süresi: dk/sa biçimi ("12dk"). */
function fmtSpan(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return min < 60 ? `${min}dk` : `${Math.floor(min / 60)}sa${String(min % 60).padStart(2, '0')}dk`;
}

export const sessionKey = (sessionId: string) => `session:${sessionId}`;

/** Aynı oturumun turları (eskiden yeniye) tek satırda: durum · ajan/model · oturum · mesaj sayısı · süre · token › son etkinlik. */
function sessionLine(turns: TaskSummary[], cols: number, now: number, selected: boolean, expanded: boolean, subs = 0): string {
  const contentWidth = Math.max(30, cols - 3);
  const last = turns[turns.length - 1];
  const live = turns.some((t) => isLive(t, now));
  const span = live ? now - turns[0].startTime : turns.reduce((a, t) => a + t.durationMs, 0);
  const tokens = turns.reduce((a, t) => a + (t.usage?.totalTokens || 0), 0);
  const name = modelName(last);
  const emoji = teamBadge(last.agent) ? teamBadge(last.agent) + ' ' : '';
  const glyph = live ? paint('yellow', spinFrame(now)) : statusGlyph(last, now);
  const fold = paint('gray', expanded ? '▾' : '▸');
  const mark = selected ? paint('cyan', '▸') : ' ';
  const startStr = turns[0]?.startTime ? `başladı ${hms(turns[0].startTime)} · ` : '';
  const head = `${mark}${fold} ${glyph} ${emoji}${paint(AGENT_COLOR[last.agent] || 'white', paint('bold', name))} ${paint('gray', String(last.sessionId).slice(0, 8) + ' ' + startStr + turns.length + ' mesaj · ' + (live ? 'sürüyor ' : 'sürdü ') + fmtSpan(span) + (tokens ? ' · ' + fmtTokens(tokens) + ' tok' : ''))}${subBadge(subs)}`;
  const room = Math.max(8, contentWidth - visibleLen(head) - 1);
  return clipAnsi(head + ' ' + lastActivity(last, room), contentWidth);
}

/** `foldable`: alt ajanı olan (dalı açılıp kapanabilen) görevler. */
export interface TreeFrame { text: string; order: string[]; foldable: string[] }

/** Son çizilen ağacın gövde satırı -> görev kimliği eşlemesi (fare tıklamasında seçim için). */
export let treeLineMap: (string | null)[] = [];

/** Son çizilen ağaç gövdesinin dikey kaydırma ofseti (fare tıklamasında satır eşlemesi için). */
let treeScroll = 0;

/** Ağaç: metin + ekrandaki görev sırası (seçim için). */
export function renderTree(tasks: TaskSummary[], opts: { onlyRunning: boolean; cols: number; rows: number; now: number; selectedId?: string | null; expanded?: Set<string>; collapsed?: Set<string>; statusBanner?: string | null }): TreeFrame {
  const { cols, now } = opts;
  const running = (t: TaskSummary) => isLive(t, now);
  // [A]: yalnızca çalışanlar <-> bugünün görevleri (yoksa kayıtlı en yeni görevler, TASK_LIMIT'e kadar)
  const shown = opts.onlyRunning ? tasks.filter(running).slice(0, TASK_LIMIT) : todayOrLatest(tasks, now);
  const byId = new Map(shown.map((t) => [t.taskId, t]));
  const children = new Map<string, TaskSummary[]>();
  const roots: TaskSummary[] = [];
  for (const t of shown) {
    if (t.parentTaskId && byId.has(t.parentTaskId)) {
      const list = children.get(t.parentTaskId) ?? [];
      list.push(t);
      children.set(t.parentTaskId, list);
    } else {
      roots.push(t);
    }
  }
  // en yeni etkinlik üstte: çalışanlar şu an, biten görevler bitiş (yoksa başlangıç) zamanıyla
  const lastActive = (t: TaskSummary) => (running(t) ? now : t.endTime ?? t.startTime);
  const order = (a: TaskSummary, b: TaskSummary) => lastActive(b) - lastActive(a) || b.startTime - a.startTime;
  roots.sort(order);
  // alt ajan sayısı tüm alt dalları kapsar (alt ajanın alt ajanı da sayılır)
  const descendants = (id: string, depth = 0): number =>
    depth > 16 ? 0 : (children.get(id) ?? []).reduce((n, k) => n + 1 + descendants(k.taskId, depth + 1), 0);

  const counts = { run: 0, ok: 0, fail: 0 };
  hasLive = false;
  for (const t of shown) {
    if (running(t)) { counts.run++; hasLive = true; }
    else if (t.status === 'completed') counts.ok++;
    else counts.fail++;
  }
  const header: string[] = [];
  // Dar terminallerde kısa kısayol metni: başlık ikinci satıra sarılıp kaydırma çubuğunu bozmasın.
  const shortcuts = cols < 130
    ? '[↑↓] seç  [Space] aç  [Enter] detay  [A] filtre  [O] Ofis  [W] Web  [Q] çıkış'
    : '[↑↓] seç  [Space/→/←] aç/kapat  [Enter] ayrıntı  [A] ' + (opts.onlyRunning ? 'hepsini göster' : 'sadece çalışanları göster') + '  [O] Ofis Yönetimi  [W] Web paneli  [Q] çıkış';
  const headLine = `${paint('bold', 'Observatory · Ağaç')}  ${paint('gray', hms(now))}   ${paint('yellow', '● ' + counts.run + ' çalışıyor')}  ${paint('green', '✔ ' + counts.ok)}  ${paint('red', '✖ ' + counts.fail)}   ${paint('gray', shortcuts)}`;
  header.push(clipAnsi(headLine, Math.max(20, cols - 1)));
  header.push(paint('gray', '─'.repeat(Math.max(20, Math.min(cols, 120)))));
  if (opts.statusBanner) {
    header.push(opts.statusBanner);
    header.push(paint('gray', '─'.repeat(Math.max(20, Math.min(cols, 120)))));
  }

  const body: string[] = [];
  const ids: string[] = [];
  const lineToId: (string | null)[] = [];
  let selectedLine = -1;
  if (roots.length === 0) {
    body.push(paint('gray', '(gösterilecek görev yok)'));
    lineToId.push(null);
  }

  const walk = (t: TaskSummary, prefix: string, childPrefix: string, label?: string, inSession = false) => {
    ids.push(t.taskId);
    if (t.taskId === opts.selectedId) selectedLine = body.length;
    const folded = !!opts.collapsed?.has(t.taskId);
    const open = children.has(t.taskId) && !folded;
    body.push(...nodeLines(t, prefix, childPrefix + (open ? '│ ' : '  '), cols, now, t.taskId === opts.selectedId, label, subBadge(descendants(t.taskId), folded)));
    lineToId.push(t.taskId, t.taskId);
    const kids = open ? (children.get(t.taskId) ?? []).sort(order) : [];
    kids.forEach((k, i) => {
      const last = i === kids.length - 1;
      walk(k, childPrefix + (last ? '└─ ' : '├─ '), childPrefix + (last ? '   ' : '│  '), '[ALT AJAN]', inSession);
    });
  };
  // aynı oturumun (≥2) kök turları tek satırda toplanır; sessionId'siz / tekil görevler olduğu gibi kalır
  const bySession = new Map<string, TaskSummary[]>();
  for (const r of roots) {
    if (!r.sessionId) continue;
    const list = bySession.get(r.sessionId) ?? [];
    list.push(r);
    bySession.set(r.sessionId, list);
  }
  const done = new Set<string>();
  for (const r of roots) {
    const turns = r.sessionId ? bySession.get(r.sessionId) : undefined;
    if (!turns || turns.length < 2) {
      walk(r, '', '');
      body.push('');
      lineToId.push(null);
      continue;
    }
    if (done.has(r.sessionId!)) continue;
    done.add(r.sessionId!);
    turns.sort((a, b) => a.startTime - b.startTime);
    const key = sessionKey(r.sessionId!);
    const open = !!opts.expanded?.has(r.sessionId!);
    ids.push(key);
    if (key === opts.selectedId) selectedLine = body.length;
    body.push(sessionLine(turns, cols, now, key === opts.selectedId, open, turns.reduce((n, t) => n + descendants(t.taskId), 0)));
    lineToId.push(key);
    if (open) {
      turns.forEach((t, i) => {
        const lastTurn = i === turns.length - 1;
        walk(t, lastTurn ? ' └─ ' : ' ├─ ', lastTurn ? '    ' : ' │  ', `Turn ${i + 1}`, true);
      });
    }
    body.push('');
    lineToId.push(null);
  }

  // Görünüm penceresi: başlık sabit kalır, yalnızca gövde kayar. Seçili görev pencere içinde ortalanır.
  // Alt satır (taşma bilgisi) ve terminalin son satırı için pay bırakılır; başlık asla yukarı kaymaz.
  let overflow = body.length > Math.max(4, opts.rows - header.length - 2);
  let bodyRoom = Math.max(4, opts.rows - header.length - (overflow ? 1 : 0) - 2);
  overflow = body.length > bodyRoom;
  const scrollOffset = overflow && selectedLine >= 0
    ? Math.min(Math.max(0, selectedLine - Math.floor(bodyRoom / 2)), body.length - bodyRoom)
    : 0;
  treeLineMap = lineToId;
  treeScroll = scrollOffset;
  treeGeom = { top: header.length, room: bodyRoom, total: body.length };
  const view = body.slice(scrollOffset, scrollOffset + bodyRoom);
  // sağ kenarda dikey kaydırma çubuğu: yalnızca gövde ekrana sığmıyorsa (iz: gri, tutamaç: parlak)
  if (overflow) {
    const thumb = Math.max(1, Math.round((bodyRoom * bodyRoom) / body.length));
    const top = Math.round((scrollOffset / (body.length - bodyRoom)) * (bodyRoom - thumb));
    const barCol = Math.max(2, cols - 1);
    view.forEach((l, i) => {
      const on = i >= top && i < top + thumb;
      // satır cols - 3'ü geçmesin: kaydırma çubuğu sütununa sarılmadan yerleşsin
      view[i] = clipAnsi(l, Math.max(1, cols - 3)) + '\x1b[0m\x1b[K' + `\x1b[${barCol}G` + (on ? paint('white', '█') : paint('gray', '│'));
    });
  }
  const out = [...header, ...view];
  if (overflow) {
    const hiddenAbove = scrollOffset;
    const hiddenBelow = body.length - scrollOffset - view.length;
    out.push(paint('gray', `… ${hiddenAbove} yukarıda · ${hiddenBelow} aşağıda (↑↓ ile kaydır)`));
  }
  return { text: out.join('\n'), order: ids, foldable: [...children.keys()].filter((id) => ids.includes(id)) };
}

/** Görünür genişliğe göre (ANSI kaçışlarını saymadan) satırı böler; kare yüksekliği doğru kalsın diye. */
function wrapAnsi(line: string, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  let vis = 0;
  let active = ''; // açık renk/stil kodları: bölünen satırın devamı aynı renkte kalsın
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\x1b') {
      ANSI_AT.lastIndex = i;
      const m = ANSI_AT.exec(line);
      if (m) {
        if (m[0].endsWith('m')) active = m[0] === '\x1b[0m' || m[0] === '\x1b[m' ? '' : active + m[0];
        cur += m[0]; i += m[0].length - 1; continue;
      }
    }
    if (vis >= width) { out.push(cur + '\x1b[0m'); cur = active; vis = 0; }
    cur += line[i];
    vis++;
  }
  out.push(cur);
  return out;
}

/** Son çizilen ağaç görünümünün kaydırma çubuğu geometrisi (fare sürükleme için): üst satır (0 tabanlı), görünür satır, toplam satır. */
export let treeGeom = { top: 2, room: 0, total: 0 };

/** Son çizilen ayrıntı sayfasının kaydırma çubuğu geometrisi (fare sürükleme için): üst satır (0 tabanlı), görünür satır, toplam satır. */
let detailGeom = { top: 3, room: 0, total: 0 };

/** Çubuk üzerindeki fare satırından (1 tabanlı terminal satırı) kaydırma değerini hesaplar; sığan içerikte null. */
export function scrollFromBarRow(y: number, g: { top: number; room: number; total: number } = detailGeom): number | null {
  if (g.total <= g.room) return null;
  const thumb = Math.max(1, Math.round((g.room * g.room) / g.total));
  const y0 = Math.min(g.room - 1, Math.max(0, y - 1 - g.top));
  const ratio = g.room === thumb ? 0 : Math.min(1, Math.max(0, (y0 - thumb / 2) / (g.room - thumb)));
  const start = Math.round(ratio * (g.total - g.room));
  return g.total - g.room - start;
}

/** Tek ajanın ayrıntı sayfası: görevi başlatan CLI'ın kendi sohbet görünümü (skin), en altı canlı izlenir; ↑/↓ ile kaydırılır. */
/** Oturumun alt ajanları: ana akışın altında girintili, etiketli blok (görev, durum, süre, araçlar, son yanıt). */
export function subagentLines(subs: TaskSummary[], width: number, now: number): string[] {
  const out: string[] = [];
  for (const s of subs) {
    const dur = fmtDuration(isLive(s, now) ? now - s.startTime : s.durationMs);
    out.push('');
    out.push(`  ${statusGlyph(s, now)} ${paint('bold', paint('magenta', 'alt ajan'))} ${paint('gray', modelName(s) + ' · ' + dur + ' · ' + s.toolsUsed.length + ' araç')}`);
    out.push(`  │ ${paint('gray', 'görev:')} ${truncate(cleanText(s.prompt), Math.max(10, width - 14))}`);
    const names = [...new Set(s.toolsUsed.map((x) => x.name))].slice(0, 8).join(', ');
    if (names) out.push(`  │ ${paint('gray', 'araçlar: ' + truncate(names, Math.max(10, width - 16)))}`);
    const last = cleanText(s.assistantText);
    if (s.error) out.push(`  └ ${paint('red', 'hata: ' + truncate(cleanText(s.error), Math.max(10, width - 14)))}`);
    else if (last) out.push(`  └ ${truncate(last, Math.max(10, width - 8))}`);
  }
  return out;
}

/**
 * Ayrıntı sayfasının sohbet metni, artımlı: olaylar bir kez işlenir, tamamlanan satırlar genişlik başına bir kez sarılır.
 * Eskiden her kare (çalışırken 200 ms'de bir) tüm olaylar baştan çiziliyordu: 958 turluk oturumda kare başına ~2 sn.
 */
export class TranscriptView {
  private raw = '';
  private tail = '';            // son '\n'den sonraki yarım satır (henüz sarılmadı)
  private wrapped: string[] = [];
  private width = 0;
  private readonly r: TranscriptRenderer;
  private readonly model: string;

  constructor(model?: string, omitted = 0) {
    this.model = model || '';
    this.r = new TranscriptRenderer((x) => this.append(x), { color: true, fullPrompt: true });
    if (omitted > 0) this.append(paint('gray', `… önceki ${omitted} olay gösterilmiyor (yalnızca en yeni ${DETAIL_EVENT_LIMIT} olay)`) + '\n\n');
  }

  push(events: TaskEvent[]): void {
    for (const e of events) {
      if (e.type === 'task.started' && !e.data?.model && this.model) e.data = { ...e.data, model: this.model };
      this.r.push(e);
    }
  }

  private append(x: string): void {
    this.raw += x;
    this.tail += x;
    if (!this.width || !x.includes('\n')) return;
    const parts = this.tail.split('\n');
    this.tail = parts.pop() ?? '';
    for (const p of parts) for (const w of wrapAnsi(p, this.width)) this.wrapped.push(w);
  }

  /** Sarılmış satırlar; sondaki boşluk/boş satırlar atılır (tam çizimdeki trimEnd ile aynı görünüm). */
  lines(width: number): string[] {
    if (width !== this.width) {
      this.width = width;
      const parts = this.raw.split('\n');
      this.tail = parts.pop() ?? '';
      this.wrapped = [];
      for (const p of parts) for (const w of wrapAnsi(p, width)) this.wrapped.push(w);
    }
    const out = this.wrapped.slice();
    const tail = this.tail.replace(/\s+$/, '');
    if (tail) {
      out.push(...wrapAnsi(tail, width));
    } else {
      while (out.length && !out[out.length - 1].trim()) out.pop();
      if (out.length) out[out.length - 1] = out[out.length - 1].replace(/\s+$/, '');
    }
    return out;
  }
}

export function renderDetail(t: TaskSummary, events: TaskEvent[], opts: { cols: number; rows: number; now: number; scroll?: number; subs?: TaskSummary[]; view?: TranscriptView }): string {
  const { cols, rows, now } = opts;
  const width = Math.max(40, cols - 2); // son iki sütun: boşluk + kaydırma çubuğu
  const live = isLive(t, now);
  const out: string[] = [];
  const tag = paint(AGENT_COLOR[t.agent] || 'white', paint('bold', modelName(t)));
  out.push(`${paint('bold', 'Sohbet')}  ${paint('gray', hms(now))}   ${paint('gray', '[Esc] geri  [↑↓] kaydır  [O] Ofis Yönetimi  [W] Web paneli  [Q] çıkış')}`);
  out.push(`${statusGlyph(t, now)} ${tag}   ${paint('gray', t.taskId + ' · ' + fmtDuration(live ? now - t.startTime : t.durationMs))}`);
  hasLive = live;
  if (live) out.push(liveBar(t, now, width));
  out.push(paint('gray', '─'.repeat(Math.min(width, 120))));

  let tv = opts.view;
  if (!tv) { tv = new TranscriptView(t.model); tv.push(events); }
  const lines = tv.lines(width);
  if (opts.subs?.length) for (const l of subagentLines(opts.subs, width, now)) lines.push(...wrapAnsi(l, width));
  const room = Math.max(4, rows - out.length - 1);
  detailGeom = { top: out.length, room, total: lines.length };
  const maxScroll = Math.max(0, lines.length - room);
  const scroll = Math.min(Math.max(0, opts.scroll ?? 0), maxScroll);
  const end = lines.length - scroll;
  const view = lines.slice(Math.max(0, end - room), end);
  if (scroll > 0 && view.length) view[view.length - 1] = paint('gray', `… ${scroll} satır aşağıda (↓ ile in)`);
  // sağ kenarda kaydırma çubuğu: yalnızca içerik ekrana sığmıyorsa (iz: gri, tutamaç: parlak)
  if (lines.length > room) {
    const start = Math.max(0, end - room);
    const thumb = Math.max(1, Math.round((room * room) / lines.length));
    const top = Math.round((start / (lines.length - room)) * (room - thumb));
    view.forEach((l, i) => {
      const on = i >= top && i < top + thumb;
      // önce satır sonunu sil, sonra çubuğu sondan bir önceki sütuna koy (son sütunda yazma sonrası silme çubuğu da silerdi)
      view[i] = l + '\x1b[0m\x1b[K' + `\x1b[${cols - 1}G` + (on ? paint('white', '┃') : paint('gray', '│'));
    });
  }
  out.push(...view);
  return out.join('\n');
}

/** Oturumun tüm turlarını tek sohbet akışına birleştirir; alt ajan olayları ve sahte "Interrupted for 0s" kayıtları çıkarılır. */
export function sessionTranscript(sessionId: string): { task: TaskSummary; events: TaskEvent[]; subs: TaskSummary[] } | null {
  const meta = sessionMeta(sessionId);
  if (!meta) return null;
  return { task: meta.task, events: globalSqlite.getEventsForSession(sessionId).filter(meta.keep), subs: meta.subs };
}

/** Oturumun özet görevi + olay süzgeci (ana tur olayları; "Interrupted for 0s" iptalleri hariç). */
function sessionMeta(sessionId: string): { task: TaskSummary; subs: TaskSummary[]; turnKey: string; keep: (e: TaskEvent) => boolean } | null {
  // yüzlerce turlu oturumda tüm görev satırlarını (araç listesi + yanıt metni) okumak revizyon başına ~250 ms sürüyordu:
  // tur yapısı hafif dökümden, tam özet yalnızca son tur ve alt ajanlar için okunur
  const index = globalSqlite.getSessionTaskIndex(sessionId);
  const turns = index.filter((t) => !t.parentTaskId);
  if (turns.length === 0) return null;
  const lastTurn = globalSqlite.getTask(turns[turns.length - 1].taskId);
  if (!lastTurn) return null;
  const subs = index.filter((t) => !!t.parentTaskId).map((t) => globalSqlite.getTask(t.taskId)).filter((t): t is TaskSummary => !!t);
  const started = new Map(turns.map((t) => [t.taskId, t.startTime]));
  const keep = (e: TaskEvent) => {
    if (e.parentTaskId || !started.has(e.taskId)) return false;
    if (e.type === 'task.cancelled') return e.taskId === lastTurn.taskId && e.timestamp - (started.get(e.taskId) ?? 0) >= 1000;
    return true;
  };
  const task: TaskSummary = {
    ...lastTurn,
    taskId: `${sessionId.slice(0, 8)} · ${turns.length} mesaj`,
    startTime: turns[0].startTime,
    durationMs: turns.reduce((a, t) => a + t.durationMs, 0)
  };
  return { task, subs, turnKey: `${turns.length}:${lastTurn.taskId}`, keep };
}

/** Ayrıntı sayfasında en fazla bu kadar en yeni olay yüklenir (yüz binlerce olaylı oturumda açılış saniyeler sürmesin). */
export const DETAIL_EVENT_LIMIT = 5000;

/** Açık ayrıntı sayfasının durumu: veritabanı revizyonu değişince yalnızca son okunan seq'ten sonraki olaylar eklenir. */
export interface DetailState { id: string; task: TaskSummary; subs: TaskSummary[]; view: TranscriptView; lastSeq: number; turnKey: string }

export function loadDetail(id: string): DetailState | null {
  const bySession = id.startsWith('session:');
  const key = bySession ? id.slice(8) : id;
  const meta = bySession ? sessionMeta(key) : null;
  const task = bySession ? meta?.task : globalSqlite.getTask(key);
  if (!task) return null;
  const by = bySession ? 'session' : 'task';
  const events = globalSqlite.getEventsTail(by, key, DETAIL_EVENT_LIMIT);
  const omitted = events.length >= DETAIL_EVENT_LIMIT ? Math.max(0, globalSqlite.countEvents(by, key) - events.length) : 0;
  const view = new TranscriptView(task.model, omitted);
  view.push(meta ? events.filter(meta.keep) : events);
  return { id, task, subs: meta?.subs ?? [], view, lastSeq: events.length ? events[events.length - 1].seq : 0, turnKey: meta?.turnKey ?? '' };
}

/** Yeni olayları mevcut görünüme ekler; oturumda yeni tur başladıysa (süzgeç değişir) baştan yükler. */
export function refreshDetail(d: DetailState): DetailState | null {
  if (!d.id.startsWith('session:')) {
    const task = globalSqlite.getTask(d.id);
    if (!task) return null;
    const events = globalSqlite.getEventsTail('task', d.id, DETAIL_EVENT_LIMIT, d.lastSeq);
    d.view.push(events);
    if (events.length) d.lastSeq = events[events.length - 1].seq;
    d.task = task;
    return d;
  }
  const meta = sessionMeta(d.id.slice(8));
  if (!meta) return null;
  if (meta.turnKey !== d.turnKey) return loadDetail(d.id);
  const events = globalSqlite.getEventsTail('session', d.id.slice(8), DETAIL_EVENT_LIMIT, d.lastSeq);
  d.view.push(events.filter(meta.keep));
  if (events.length) d.lastSeq = events[events.length - 1].seq;
  d.task = meta.task;
  d.subs = meta.subs;
  return d;
}

/** Cursor-addressed updates also erase rows removed from a shorter frame. */
export function diffTreeLines(previous: string[], next: string[]): string {
  let output = '';
  for (let i = 0; i < Math.max(previous.length, next.length); i++) {
    if (previous[i] === next[i]) continue;
    output += `\x1b[${i + 1};1H\x1b[2K${next[i] ?? ''}\x1b[0m`;
  }
  return output;
}

export function runTree(args: string[]): void {
  globalSqlite.reapStaleTasks();
  const once = args.includes('--once');
  const autoWeb = args.includes('--web');
  let onlyRunning = false;
  let selectedId: string | null = null;
  let detailId: string | null = null;
  let detailScroll = 0;
  let lastOrder: string[] = [];
  const expanded = new Set<string>();
  const collapsed = new Set<string>(); // alt ajan dalı kapatılmış görevler (varsayılan: açık)
  let lastFoldable: string[] = [];
  let statusBanner: string | null = null;
  let statusTimer: NodeJS.Timeout | null = null;
  let officeActive = false;
  let ingest: { stop: () => void } | null = null;

  // Animation reads only cached data; poll SQLite revisions every 800 ms.
  let cachedTasks: TaskSummary[] = [];
  let cacheAt = 0;
  let revision = '';
  let animationOnly = false;
  let detail: DetailState | null = null;
  let detailStale = false;
  const refreshTasks = (force = false): TaskSummary[] => {
    const now = Date.now();
    if (force || (!animationOnly && now - cacheAt >= 800)) {
      const nextRevision = globalSqlite.getTaskRevision();
      if (force || revision !== nextRevision) {
        cachedTasks = globalSqlite.getRecentTasks(TASK_LIMIT);
        detailStale = true;
        revision = nextRevision;
      }
      cacheAt = now;
    }
    return cachedTasks;
  };

  const setStatus = (msg: string) => {
    statusBanner = paint('cyan', '🌐 ' + msg);
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusBanner = null;
      redraw();
    }, 5000);
    redraw();
  };

  // Otomatik web acilisi kaldirildi; kullanici [W] ile acar.
  const sessionOf = (id: string | null): string | null =>
    !id ? null : id.startsWith('session:') ? id.slice(8) : globalSqlite.getTask(id)?.sessionId ?? null;

  const frame = (): string => {
    const cols = process.stdout.columns || 120;
    const rows = process.stdout.rows || 40;
    const now = Date.now();
    refreshTasks();
    if (officeActive) return renderOfficeView({ cols, rows, now, tasks: refreshTasks(), statusBanner });
    if (detailId) {
      // açılışta son DETAIL_EVENT_LIMIT olay yüklenir; sonra yalnızca revizyon değişince yeni olaylar eklenir
      if (!detail || detail.id !== detailId) detail = loadDetail(detailId);
      else if (detailStale) detail = refreshDetail(detail);
      detailStale = false;
      if (detail) return renderDetail(detail.task, [], { cols, rows, now, scroll: detailScroll, subs: detail.subs, view: detail.view });
      detailId = null;
    }
    detail = null;
    const tasks = refreshTasks();
    const f = renderTree(tasks, { onlyRunning, cols, rows, now, selectedId, expanded, collapsed, statusBanner });
    lastOrder = f.order;
    lastFoldable = f.foldable;
    if (!selectedId || !f.order.includes(selectedId)) {
      selectedId = f.order[0] ?? null;
      if (selectedId && !once) return renderTree(tasks, { onlyRunning, cols, rows, now, selectedId, expanded, collapsed, statusBanner }).text;
    }
    return f.text;
  };
  if (once || !process.stdin.isTTY) {
    console.log(frame());
    process.exit(0);
  }
  // Canlı TUI açıkken harici oturumlar (Antigravity/agy, Claude, Codex, OpenCode) SQLite'a aksın.
  if (!once && process.env.NODE_ENV !== 'test') {
    try {
      ingest = startIngest({ sources: ['claude', 'codex', 'opencode', 'agy'], activeMinutes: 60, backfill: true, follow: true });
    } catch (err) {
      statusBanner = paint('red', 'otomatik ingest başlatılamadı: ' + (err as Error).message);
    }
  }
  process.on('exit', () => ingest?.stop());
  // Kare terminal yüksekliğine kırpılır, sona satır sonu basılmaz: aksi halde her çizimde ekran bir satır kayar ve başlık alta yığılır.
  // Kirli kontrolü: içerik değişmediyse terminale hiç yazılmaz (kare üretimi ucuz, yazım+flush pahalı).
  let lastDrawn: string[] = [];
  const draw = () => {
    const content = frame();
    const lines = content.split('\n').slice(0, Math.max(4, (process.stdout.rows || 40) - 1));
    const payload = diffTreeLines(lastDrawn, lines);
    lastDrawn = lines;
    if (payload) process.stdout.write(payload);
  };
  process.stdout.write('\x1b[?1049h');
  // fare: tekerlek + çubuğu sürükleme (SGR kipi). Bu kipte metin seçmek için Shift+sürükle gerekir.
  process.stdout.write('\x1b[?1000h\x1b[?1002h\x1b[?1006h');
  process.on('exit', () => process.stdout.write('\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?1049l'));
  const redraw = () => { process.stdout.write('\x1b[2J\x1b[H'); lastDrawn = []; draw(); };
  // Terminal yeniden boyutlandırıldığında (büyütme/küçültme) çerçeveyi tazele: aksi halde eski boyutla
  // çizilen satırlar kayar ve başlık ekrandan silinir.
  const handleResize = () => redraw();
  process.stdout.on('resize', handleResize);
  process.on('exit', () => process.stdout.off('resize', handleResize));
  redraw();
  const timer = setInterval(draw, 800);
  // animasyon: çalışan görev varken dönen ikon / ışık çubuğu için daha sık çiz (yoksa 800 ms'lik çizim yeter)
  const animTimer = setInterval(() => {
    if (!hasLive || officeActive) return;
    animationOnly = true;
    try { draw(); } finally { animationOnly = false; }
  }, 200);
  process.on('exit', () => clearInterval(animTimer));
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const move = (d: number) => {
    if (lastOrder.length === 0) return;
    const i = Math.max(0, Math.min(lastOrder.length - 1, (selectedId ? lastOrder.indexOf(selectedId) : 0) + d));
    selectedId = lastOrder[i];
    draw();
  };
  process.stdin.on('data', (buf) => {
    const k = buf.toString();
    if (k.includes('\x1b[<')) {
      const cols = process.stdout.columns || 120;
      for (const m of k.matchAll(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/g)) {
        const b = Number(m[1]), x = Number(m[2]), y = Number(m[3]);
        const wheel = b === 64 ? -1 : b === 65 ? 1 : 0; // -1 yukarı, 1 aşağı
        if (wheel) {
          if (detailId) detailScroll = Math.max(0, detailScroll - wheel * 3);
          else if (!officeActive) move(wheel * 3);
        } else if (detailId && !officeActive && m[4] === 'M' && (b === 0 || b === 32) && x >= cols - 2) {
          const s = scrollFromBarRow(y);
          if (s !== null) detailScroll = s;
        } else if (!detailId && !officeActive && m[4] === 'M' && (b === 0 || b === 32) && x >= cols - 2) {
          // ağaç modunda çubuğa tıklama/sürükleme: imleç satırını gövde indeksine çevir, seçimi taşı
          const y0 = Math.min(treeGeom.room - 1, Math.max(0, y - 1 - treeGeom.top));
          const ratio = treeGeom.room <= 1 ? 0 : Math.min(1, Math.max(0, y0 / (treeGeom.room - 1)));
          const targetIdx = Math.min(lastOrder.length - 1, Math.max(0, Math.round(ratio * (lastOrder.length - 1))));
          if (lastOrder[targetIdx]) selectedId = lastOrder[targetIdx];
        } else if (!detailId && !officeActive && m[4] === 'M' && b === 0 && x < cols - 2) {
          // ağaç gövdesine tıklama: tıklanan satırın görevini seç
          const clickedId = treeLineMap[treeScroll + (y - 1 - treeGeom.top)];
          if (clickedId) selectedId = clickedId;
        }
      }
      draw();
      return;
    }
    if (k === 'q'|| k === 'Q' || k === '\x03') {
      clearInterval(timer);
      ingest?.stop();
      process.stdout.write('\x1b[2J\x1b[H');
      process.exit(0);
    }
    if (officeActive) {
      if (k === 'o' || k === 'O' || k === '' || k === '' || k === '') { officeActive = false; redraw(); return; }
      if (k === 'w' || k === 'W') {
        setStatus('Web paneli açılıyor (http://127.0.0.1:8788)...');
        openWebPanel(8788, setStatus);
      }
      return;
    }
    if (detailId) {
      if (k === 'o' || k === 'O') { officeActive = true; detailId = null; redraw(); return; }
      if (k === 'w' || k === 'W') {
        setStatus('Web paneli açılıyor (http://127.0.0.1:8788)...');
        openWebPanel(8788, setStatus);
        return;
      }
      if (k === '\x1b' || k === '\x7f' || k === '\b') { detailId = null; redraw(); }
      else if (k === '\x1b[A' || k === 'k' || k === 'K') { detailScroll += 1; draw(); }
      else if (k === '\x1b[B' || k === 'j' || k === 'J') { detailScroll = Math.max(0, detailScroll - 1); draw(); }
      else if (k === '\x1b[5~') { detailScroll += 10; draw(); }
      else if (k === '\x1b[6~') { detailScroll = Math.max(0, detailScroll - 10); draw(); }
      else if (k === '\x1b[F' || k === 'G') { detailScroll = 0; draw(); }
      return;
    }
    if (k === '\x1b') { clearInterval(timer); ingest?.stop(); process.stdout.write('\x1b[2J\x1b[H'); process.exit(0); }
    if (k === 'r' || k === 'R') { refreshTasks(true); redraw(); return; }
    else if (k === '\x1b[A' || k === 'k' || k === 'K') move(-1);
    else if (k === '\x1b[B' || k === 'j' || k === 'J') move(1);
    else if (k === '\x1b[5~') move(-10);
    else if (k === '\x1b[6~') move(10);
    else if (k === '\r' || k === '\n') { if (selectedId) { detailId = selectedId; detailScroll = 0; redraw(); } }
    else if (k === ' ' || k === '[C' || k === '[D') {
      const sid = sessionOf(selectedId);
      // alt ajanı olan görev: kendi dalı açılır/kapanır (oturum turu olsa bile önce görev dalı)
      if (selectedId && lastFoldable.includes(selectedId)) {
        const shut = collapsed.has(selectedId);
        if (k === '[D' ? !shut : k === '[C' ? shut : true) {
          if (shut) collapsed.delete(selectedId); else collapsed.add(selectedId);
          redraw();
        }
      } else if (sid && lastOrder.includes(sessionKey(sid))) {
        const open = expanded.has(sid);
        if (k === '[D' ? open : k === '[C' ? !open : true) {
          if (open) expanded.delete(sid); else expanded.add(sid);
          if (!expanded.has(sid)) selectedId = sessionKey(sid);
          redraw();
        }
      }
    }
    else if (k === 'a' || k === 'A') { onlyRunning = !onlyRunning; redraw(); }
    else if (k === 'o' || k === 'O') { officeActive = true; redraw(); return; }
    else if (k === 'w' || k === 'W') {
      setStatus('Web paneli açılıyor (http://127.0.0.1:8788)...');
      openWebPanel(8788, setStatus);
    }
  });
}
