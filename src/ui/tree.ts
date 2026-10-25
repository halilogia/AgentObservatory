import { globalSqlite } from '../core/sqlite_store.ts';
import type { TaskEvent, TaskSummary } from '../core/types.ts';
import { TranscriptRenderer } from './transcript.ts';
import { paint, cleanText, truncate, describeTool, hms } from './tui.ts';

// Ağaç görünümü: aynı anda çalışan birçok ajanı tek akışa karıştırmadan, ajan başına 2 satırla gösterir.
// Mevcut `watch` / `chat` görünümlerine dokunmaz; yalnızca SQLite'taki görev kayıtlarını okur.
//   node --experimental-strip-types src/cli.ts tree [--once]
// Ağaç:   ↑/↓ (veya J/K) seç · Enter ayrıntı · A sadece çalışanlar/hepsi · Q çıkış
// Ayrıntı: ajanın kendi sohbet görünümü (canlı); ↑/↓ kaydır · Esc/Backspace geri · Q çıkış

const RECENT_WINDOW_MS = 30 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;   // bir saatten uzun "çalışıyor" görünen kayıtlar büyük olasılıkla bitmemiş eski oturumlardır
const TASK_LIMIT = 80;

type Color = Parameters<typeof paint>[0];
const AGENT_COLOR: Record<string, Color> = {
  claude: 'magenta', codex: 'cyan', agy: 'blue', opencode: 'yellow', hermes: 'green', ollama: 'white', freebuff: 'white'
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

function statusGlyph(t: TaskSummary, now: number): string {
  if (isLive(t, now)) return paint('yellow', '●');
  if (t.status === 'running' || t.status === 'pending') return paint('gray', '◌');
  if (t.status === 'completed') return paint('green', '✔');
  if (t.status === 'cancelled') return paint('gray', '■');
  return paint('red', '✖');
}

/** Tam model adı; kayıtta yoksa ajan adı. */
function modelName(t: TaskSummary): string {
  return t.model && t.model !== t.agent ? t.model : t.agent;
}

function toolLine(name: string, input: any): string {
  const info = describeTool(name, input);
  return `${info.name} ${info.target}`.trim();
}

function lastActivity(t: TaskSummary, width: number): string {
  if (t.error) return paint('red', 'hata: ' + truncate(cleanText(t.error), width));
  const tool = t.toolsUsed[t.toolsUsed.length - 1];
  if (t.status === 'running' && tool) return paint('gray', '› ' + truncate(toolLine(tool.name, tool.input), width));
  const text = cleanText(t.assistantText);
  if (text) {
    // son söz: kelime ortasından başlamasın
    const tail = text.length > width ? text.slice(-width).replace(/^\S*\s/, '') : text;
    return paint('gray', '“' + truncate(tail, width) + '”');
  }
  if (tool) return paint('gray', '› ' + truncate(toolLine(tool.name, tool.input), width));
  return paint('gray', truncate(cleanText(t.prompt), width));
}

function nodeLines(t: TaskSummary, prefix: string, childPrefix: string, cols: number, now: number, selected: boolean): string[] {
  const dur = fmtDuration(isLive(t, now) ? now - t.startTime : t.durationMs);
  const tag = paint(AGENT_COLOR[t.agent] || 'white', paint('bold', t.agent));
  const tokens = t.usage?.totalTokens ? paint('gray', ' · ' + fmtTokens(t.usage.totalTokens) + ' tok') : '';
  const mark = selected ? paint('cyan', '▸') : ' ';
  const head = `${mark}${prefix}${statusGlyph(t, now)} ${tag} ${modelName(t)} ${paint('gray', t.taskId.slice(-8))} ${paint('gray', dur)}${tokens}`;
  return [head, ` ${childPrefix}${lastActivity(t, Math.max(20, cols - childPrefix.length - 5))}`];
}

export interface TreeFrame { text: string; order: string[] }

/** Ağaç: metin + ekrandaki görev sırası (seçim için). */
export function renderTree(tasks: TaskSummary[], opts: { onlyRunning: boolean; cols: number; rows: number; now: number; selectedId?: string | null }): TreeFrame {
  const { cols, now } = opts;
  const running = (t: TaskSummary) => isLive(t, now);
  const recent = tasks.filter((t) => running(t) || now - (t.endTime ?? t.startTime) < RECENT_WINDOW_MS);
  const shown = opts.onlyRunning ? tasks.filter(running) : recent;
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

  const counts = { run: 0, ok: 0, fail: 0 };
  for (const t of shown) {
    if (running(t)) counts.run++;
    else if (t.status === 'completed') counts.ok++;
    else counts.fail++;
  }
  const out: string[] = [];
  const ids: string[] = [];
  out.push(`${paint('bold', 'Observatory · Ağaç')}  ${paint('gray', hms(now))}   ${paint('yellow', '● ' + counts.run + ' çalışıyor')}  ${paint('green', '✔ ' + counts.ok)}  ${paint('red', '✖ ' + counts.fail)}   ${paint('gray', '[↑↓] seç  [Enter] ayrıntı  [A] ' + (opts.onlyRunning ? 'hepsini göster' : 'sadece çalışanları göster') + '  [Q] çıkış')}`);
  out.push(paint('gray', '─'.repeat(Math.max(20, Math.min(cols, 120)))));
  if (roots.length === 0) out.push(paint('gray', '(gösterilecek görev yok)'));

  const walk = (t: TaskSummary, prefix: string, childPrefix: string) => {
    ids.push(t.taskId);
    out.push(...nodeLines(t, prefix, childPrefix + (children.has(t.taskId) ? '│ ' : '  '), cols, now, t.taskId === opts.selectedId));
    const kids = (children.get(t.taskId) ?? []).sort(order);
    kids.forEach((k, i) => {
      const last = i === kids.length - 1;
      walk(k, childPrefix + (last ? '└─ ' : '├─ '), childPrefix + (last ? '   ' : '│  '));
    });
  };
  for (const r of roots) {
    walk(r, '', '');
    out.push('');
  }
  // ekrana sığmayan kısmı kes (üstteki çalışanlar kalır; seçili satır görünürse kaydır)
  const max = Math.max(8, opts.rows - 1);
  if (out.length > max) {
    const selLine = out.findIndex((l) => l.includes('▸'));
    const start = selLine >= max - 1 ? Math.min(selLine - Math.floor(max / 2), out.length - max + 1) : 0;
    const body = out.slice(Math.max(0, start), Math.max(0, start) + max - 1);
    const hidden = out.length - body.length;
    return { text: body.join('\n') + '\n' + paint('gray', `… ${hidden} satır daha`), order: ids };
  }
  return { text: out.join('\n'), order: ids };
}

/** Görünür genişliğe göre (ANSI kaçışlarını saymadan) satırı böler; kare yüksekliği doğru kalsın diye. */
function wrapAnsi(line: string, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  let vis = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\x1b') {
      const m = /^\x1b\[[0-9;?]*[A-Za-z]/.exec(line.slice(i));
      if (m) { cur += m[0]; i += m[0].length - 1; continue; }
    }
    if (vis >= width) { out.push(cur + '\x1b[0m'); cur = ''; vis = 0; }
    cur += line[i];
    vis++;
  }
  out.push(cur);
  return out;
}

/** Tek ajanın ayrıntı sayfası: görevi başlatan CLI'ın kendi sohbet görünümü (skin), en altı canlı izlenir; ↑/↓ ile kaydırılır. */
export function renderDetail(t: TaskSummary, events: TaskEvent[], opts: { cols: number; rows: number; now: number; scroll?: number }): string {
  const { cols, rows, now } = opts;
  const width = Math.max(40, cols - 1);
  const live = isLive(t, now);
  const out: string[] = [];
  const tag = paint(AGENT_COLOR[t.agent] || 'white', paint('bold', t.agent));
  out.push(`${paint('bold', 'Sohbet')}  ${paint('gray', hms(now))}   ${paint('gray', '[Esc] geri  [↑↓] kaydır  [Q] çıkış')}`);
  out.push(`${statusGlyph(t, now)} ${tag} ${paint('bold', modelName(t))}   ${paint('gray', t.taskId + ' · ' + fmtDuration(live ? now - t.startTime : t.durationMs))}`);
  out.push(paint('gray', '─'.repeat(Math.min(width, 120))));

  let buf = '';
  const r = new TranscriptRenderer((x) => { buf += x; }, { color: true });
  for (const e of events) {
    if (e.type === 'task.started' && !e.data?.model && t.model) e.data = { ...e.data, model: t.model };
    r.push(e);
  }
  r.end();
  const lines = buf.replace(/\s+$/, '').split('\n').flatMap((l) => wrapAnsi(l, width));
  const room = Math.max(4, rows - out.length - 1);
  const maxScroll = Math.max(0, lines.length - room);
  const scroll = Math.min(Math.max(0, opts.scroll ?? 0), maxScroll);
  const end = lines.length - scroll;
  const view = lines.slice(Math.max(0, end - room), end);
  out.push(...view);
  if (scroll > 0) out[out.length - 1] = paint('gray', `… ${scroll} satır aşağıda (↓ ile in)`);
  return out.join('\n');
}

export function runTree(args: string[]): void {
  const once = args.includes('--once');
  let onlyRunning = false;
  let selectedId: string | null = null;
  let detailId: string | null = null;
  let detailScroll = 0;
  let lastOrder: string[] = [];

  const frame = (): string => {
    const cols = process.stdout.columns || 120;
    const rows = process.stdout.rows || 40;
    const now = Date.now();
    if (detailId) {
      const t = globalSqlite.getTask(detailId);
      if (t) return renderDetail(t, globalSqlite.getEvents(detailId), { cols, rows, now, scroll: detailScroll });
      detailId = null;
    }
    const tasks = globalSqlite.getRecentTasks(TASK_LIMIT);
    const f = renderTree(tasks, { onlyRunning, cols, rows, now, selectedId });
    lastOrder = f.order;
    if (!selectedId || !f.order.includes(selectedId)) {
      selectedId = f.order[0] ?? null;
      if (selectedId && !once) return renderTree(tasks, { onlyRunning, cols, rows, now, selectedId }).text;
    }
    return f.text;
  };
  if (once || !process.stdin.isTTY) {
    console.log(frame());
    process.exit(0);
  }
  // Kare terminal yüksekliğine kırpılır, sona satır sonu basılmaz: aksi halde her çizimde ekran bir satır kayar ve başlık alta yığılır.
  const draw = () => {
    const lines = frame().split('\n').slice(0, process.stdout.rows || 40);
    process.stdout.write('\x1b[H' + lines.map((l) => l + '\x1b[K').join('\n') + '\x1b[J');
  };
  process.stdout.write('\x1b[?1049h');
  process.on('exit', () => process.stdout.write('\x1b[?1049l'));
  const redraw = () => { process.stdout.write('\x1b[2J'); draw(); };
  redraw();
  const timer = setInterval(draw, 800);
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
    if (k === 'q' || k === 'Q' || k === '\x03') {
      clearInterval(timer);
      process.stdout.write('\x1b[2J\x1b[H');
      process.exit(0);
    }
    if (detailId) {
      if (k === '\x1b' || k === '\x7f' || k === '\b') { detailId = null; redraw(); }
      else if (k === '\x1b[A' || k === 'k' || k === 'K') { detailScroll += 1; draw(); }
      else if (k === '\x1b[B' || k === 'j' || k === 'J') { detailScroll = Math.max(0, detailScroll - 1); draw(); }
      else if (k === '\x1b[5~') { detailScroll += 10; draw(); }
      else if (k === '\x1b[6~') { detailScroll = Math.max(0, detailScroll - 10); draw(); }
      else if (k === '\x1b[F' || k === 'G') { detailScroll = 0; draw(); }
      return;
    }
    if (k === '\x1b') { clearInterval(timer); process.stdout.write('\x1b[2J\x1b[H'); process.exit(0); }
    if (k === '\x1b[A' || k === 'k' || k === 'K') move(-1);
    else if (k === '\x1b[B' || k === 'j' || k === 'J') move(1);
    else if (k === '\r' || k === '\n') { if (selectedId) { detailId = selectedId; detailScroll = 0; redraw(); } }
    else if (k === 'a' || k === 'A') { onlyRunning = !onlyRunning; redraw(); }
  });
}
