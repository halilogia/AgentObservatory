import type { TaskSummary } from '../core/types.ts';
import { paint, cleanText, truncate, describeTool, hms } from './tui.ts';

// Yerleşik Ofis / İstasyon Yönetimi: ağaç görünümünün içinde açılır, harici pencere yoktur.
// Her ajan ailesi için bir istasyon kartı; veriler yalnızca verilen görev listesinden hesaplanır.

type Color = Parameters<typeof paint>[0];

const STALE_MS = 60 * 60 * 1000; // ağaç görünümündeki "bitmemiş eski kayıt" eşiğiyle aynı
const WIDE_COLS = 100;           // bu genişlikten itibaren 2x2 grid
const MAX_WIDTH = 160;

const isLive = (t: TaskSummary, now: number): boolean =>
  (t.status === 'running' || t.status === 'pending') && now - t.startTime < STALE_MS;

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return String(n);
}

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** Görünür hücre genişliği: ANSI sayılmaz, emoji 2 hücre. */
function visLen(s: string): number {
  let n = 0;
  for (const ch of s.replace(ANSI, '')) {
    const cp = ch.codePointAt(0)!;
    n += cp >= 0x1f300 || cp === 0x26aa || cp === 0x26ab ? 2 : 1;
  }
  return n;
}

/** ANSI kaçışlarını koruyarak satırı görünür `width` hücreye kırpar / boşlukla doldurur. */
function fit(s: string, width: number): string {
  let out = '';
  let vis = 0;
  let cut = false;
  for (let i = 0; i < s.length && !cut; i++) {
    if (s[i] === '\x1b') {
      const m = /^\x1b\[[0-9;?]*[A-Za-z]/.exec(s.slice(i));
      if (m) { out += m[0]; i += m[0].length - 1; continue; }
    }
    const ch = String.fromCodePoint(s.codePointAt(i)!);
    const w = visLen(ch);
    if (vis + w > width) { cut = true; break; }
    out += ch;
    vis += w;
    i += ch.length - 1;
  }
  return out + (cut ? '\x1b[0m' : '') + ' '.repeat(Math.max(0, width - vis));
}

interface Station {
  emoji: string;
  title: string;
  model: string;
  color: Color;
  role: string;
  agents: string[];
  idle: string;
  busy: string;
}

const STATIONS: Station[] = [
  { emoji: '🔵', title: 'MİMAR İSTASYONU', model: 'Antigravity', color: 'blue', role: 'Orkestrasyon & Sistem Mimarisi', agents: ['agy', 'antigravity'], idle: 'Boşta', busy: 'Aktif' },
  { emoji: '🟠', title: 'GELİŞTİRİCİ MASASI', model: 'Claude Code Sonnet 5.5', color: 'yellow', role: 'Ağır Kodlama, Test & Refactoring', agents: ['claude'], idle: 'Boşta', busy: 'Kodluyor' },
  { emoji: '🔴', title: 'DENETİM & GÜVENLİK', model: 'Codex CLI', color: 'magenta', role: 'Red-Team Denetimi & Kod Güvenliği', agents: ['codex'], idle: 'Boşta', busy: 'Denetliyor' },
  { emoji: '⚫', title: 'VERİ & AMELE TEZGAHI', model: 'OpenCode', color: 'gray', role: 'Toplu Veri Dönüşümü & Amele İşleri', agents: ['opencode'], idle: 'Boşta', busy: 'İşliyor' }
];

function lastToolText(t: TaskSummary): string {
  const tool = t.toolsUsed[t.toolsUsed.length - 1];
  if (!tool) return '—';
  const info = describeTool(tool.name, tool.input);
  return `${info.name} ${info.target}`.trim();
}

function lastSummary(t: TaskSummary | undefined, width: number): string {
  if (!t) return paint('gray', '—');
  if (t.error) return paint('red', truncate(cleanText(t.error), width));
  const text = cleanText(t.assistantText) || cleanText(t.prompt);
  return paint('gray', truncate(text, width) || '—');
}

function tokenSum(ts: TaskSummary[], key: 'inputTokens' | 'outputTokens' | 'totalTokens'): number {
  return ts.reduce((a, t) => a + (t.usage?.[key] || 0), 0);
}

/** Bir istasyonun kart içeriği (kutu çerçevesiz, renkli satırlar). */
function stationRows(st: Station, tasks: TaskSummary[], now: number, inner: number): string[] {
  const mine = tasks.filter((t) => st.agents.includes(t.agent));
  const live = mine.filter((t) => isLive(t, now));
  const done = mine.filter((t) => t.status === 'completed');
  const failed = mine.filter((t) => t.status === 'failed');
  const last = [...mine].sort((a, b) => b.startTime - a.startTime)[0];
  const badge = live.length > 0 ? paint('yellow', '● ' + st.busy) : paint('gray', '○ ' + st.idle);
  const label = (s: string) => paint('gray', s.padEnd(11));
  const room = Math.max(10, inner - 12);
  const rows = [
    `${label('Rol')}${st.role}`,
    `${label('Durum')}${badge}`
  ];
  const counts = `${paint('yellow', live.length + ' çalışan')} · ${paint('green', done.length + ' biten')}` + (failed.length ? ` · ${paint('red', failed.length + ' hatalı')}` : '');
  const total = tokenSum(mine, 'totalTokens');

  switch (st.agents[0]) {
    case 'agy': {
      const ids = new Set(mine.map((t) => t.taskId));
      const subs = tasks.filter((t) => t.parentTaskId && ids.has(t.parentTaskId)).length;
      rows.push(`${label('Görev')}${counts}`, `${label('Alt görev')}${subs} dağıtıldı`, `${label('Token')}${fmtTokens(total)} toplam`);
      break;
    }
    case 'claude':
      rows.push(
        `${label('Son görev')}${last ? truncate(cleanText(last.prompt), room) : '—'}`,
        `${label('Son araç')}${truncate(last ? lastToolText(last) : '—', room)}`,
        `${label('Token')}${fmtTokens(tokenSum(mine, 'inputTokens'))} giriş · ${fmtTokens(tokenSum(mine, 'outputTokens'))} çıkış · ${fmtTokens(total)} toplam`
      );
      break;
    case 'codex': {
      const security = failed.length ? paint('red', `✖ ${failed.length} hatalı denetim`) : live.length ? paint('yellow', 'İnceleniyor') : paint('green', '✔ Temiz');
      rows.push(`${label('Güvenlik')}${security}`, `${label('Son özet')}${lastSummary(last, room)}`, `${label('Token')}${fmtTokens(total)} toplam`);
      break;
    }
    default:
      rows.push(`${label('Biten')}${done.length} toplu görev`, `${label('Son iş')}${lastSummary(last, room)}`, `${label('Token')}${fmtTokens(total)} toplam`);
  }
  return rows;
}

/** Başlıklı kart: ┌─┐ / │ başlık │ / ├─┤ / │ satırlar │ / └─┘. `height` içerik satırı sayısıdır. */
function card(st: Station, rows: string[], width: number, height: number): string[] {
  const inner = width - 4; // "│ " + içerik + " │"
  const b = (s: string) => paint(st.color, s);
  const head = `${st.emoji} ${paint('bold', paint(st.color, st.title))} ${paint('gray', '· ' + st.model)}`;
  const body = [...rows];
  while (body.length < height) body.push('');
  return [
    b('┌' + '─'.repeat(width - 2) + '┐'),
    `${b('│')} ${fit(head, inner)} ${b('│')}`,
    b('├' + '─'.repeat(width - 2) + '┤'),
    ...body.map((r) => `${b('│')} ${fit(r, inner)} ${b('│')}`),
    b('└' + '─'.repeat(width - 2) + '┘')
  ];
}

export function renderOfficeView(opts: { cols: number; rows: number; now: number; tasks: TaskSummary[]; statusBanner?: string | null }): string {
  const { now, tasks } = opts;
  const total = Math.max(40, Math.min(opts.cols - 1, MAX_WIDTH));
  const wide = opts.cols >= WIDE_COLS;
  const rule = paint('gray', '─'.repeat(total));

  const live = tasks.filter((t) => isLive(t, now)).length;
  const ok = tasks.filter((t) => t.status === 'completed').length;
  const bad = tasks.filter((t) => t.status === 'failed').length;
  const tokens = tokenSum(tasks, 'totalTokens');

  const out: string[] = [
    `🏢 ${paint('bold', paint('cyan', 'NEXUS AGENT OBSERVATORY'))} ${paint('gray', '· OFİS & İSTASYON YÖNETİMİ')}  ${paint('gray', hms(now))}`,
    `${paint('yellow', '● ' + live + ' çalışıyor')}  ${paint('green', '✔ ' + ok + ' biten')}  ${paint('red', '✖ ' + bad + ' hatalı')}  ${paint('gray', fmtTokens(tokens) + ' tok · ' + tasks.length + ' görev')}`,
    rule
  ];
  if (opts.statusBanner) out.push(opts.statusBanner, rule);

  const gap = 2;
  const cardW = wide ? Math.floor((total - gap) / 2) : total;
  const cards = STATIONS.map((st) => ({ st, rows: stationRows(st, tasks, now, cardW - 4) }));
  if (wide) {
    for (let i = 0; i < cards.length; i += 2) {
      const pair = cards.slice(i, i + 2);
      const h = Math.max(...pair.map((c) => c.rows.length));
      const built = pair.map((c) => card(c.st, c.rows, cardW, h));
      for (let l = 0; l < built[0].length; l++) out.push(built.map((c) => c[l]).join(' '.repeat(gap)));
    }
  } else {
    for (const c of cards) out.push(...card(c.st, c.rows, cardW, c.rows.length));
  }

  out.push(rule, paint('gray', '[O / Esc] Ağaca Dön  ·  [W] Web Paneli  ·  [Q] Çıkış'));
  return out.join('\n');
}
