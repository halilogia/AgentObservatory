import type { TaskSummary } from '../core/types.ts';
import { paint, cleanText, truncate, describeTool, hms } from './tui.ts';

// Canlı Görev & Ajan Operasyon Panosu (Mission Board): ağaç görünümünün içinde açılır, harici pencere yoktur.
// Her ajan ailesi için bir kart; veriler yalnızca verilen görev listesinden hesaplanır.

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
  role: string;
  color: Color;
  agents: string[];
}

const STATIONS: Station[] = [
  { emoji: '🔵', title: 'Antigravity', role: 'Sistem Mimarisi & Koordinasyon', color: 'blue', agents: ['agy', 'antigravity'] },
  { emoji: '🟠', title: 'Claude Code', role: 'Ağır Kodlama, Test & Refactor', color: 'yellow', agents: ['claude'] },
  { emoji: '🔴', title: 'Codex CLI', role: 'Statik Güvenlik & Red-Team Denetimi', color: 'magenta', agents: ['codex'] },
  { emoji: '⚫', title: 'OpenCode / Command Code', role: 'Toplu Veri Motoru & ETL', color: 'gray', agents: ['opencode', 'commandcode'] }
];

function lastToolText(t: TaskSummary): string {
  const tool = t.toolsUsed[t.toolsUsed.length - 1];
  if (!tool) return '';
  const info = describeTool(tool.name, tool.input);
  return `${info.name} ${info.target}`.trim();
}

function tokenSum(ts: TaskSummary[], key: 'inputTokens' | 'outputTokens' | 'totalTokens'): number {
  return ts.reduce((a, t) => a + (t.usage?.[key] || 0), 0);
}

/** Hedef klasör: görev alanlarından varsa cwd, yoksa istemdeki yol / repo adı. */
function targetOf(t: TaskSummary | undefined): string {
  if (!t) return '—';
  const cwd = (t as { cwd?: string }).cwd;
  if (cwd) return cwd;
  const m = /([A-Za-z]:[\\/][^\s"']+|(?:\.{0,2}[\\/])?[\w.-]+(?:[\\/][\w.-]+)+)/.exec(cleanText(t.prompt));
  return m ? m[1] : '—';
}

/** Bir ajan kartının içeriği (kutu çerçevesiz, renkli satırlar). */
function stationRows(st: Station, tasks: TaskSummary[], now: number, inner: number): string[] {
  const mine = tasks.filter((t) => st.agents.includes(t.agent));
  const live = mine.filter((t) => isLive(t, now));
  const last = [...mine].sort((a, b) => b.startTime - a.startTime)[0];
  const label = (s: string) => paint('gray', s.padEnd(13));
  const room = Math.max(10, inner - 14);
  const status = live.length > 0 ? paint('green', '🟢 Aktif') : last && last.status === 'failed' ? paint('red', '🔴 Hatalı') : paint('gray', '⚪ Beklemede');
  const action = last ? (lastToolText(last) || cleanText(last.prompt)) : '';
  return [
    paint('gray', st.role),
    `${label('Durum')}${status}`,
    `${label('Son Görev')}${truncate(action, room) || '—'}`,
    `${label('Hedef Proje')}${truncate(targetOf(last), room)}`,
    `${label('Token')}${fmtTokens(tokenSum(mine, 'inputTokens'))} giriş · ${fmtTokens(tokenSum(mine, 'outputTokens'))} çıkış · ${fmtTokens(tokenSum(mine, 'totalTokens'))} toplam`
  ];
}

/** Başlıklı kart: ┌─┐ / │ başlık │ / ├─┤ / │ satırlar │ / └─┘. `height` içerik satırı sayısıdır. */
function card(st: Station, rows: string[], width: number, height: number): string[] {
  const inner = width - 4; // "│ " + içerik + " │"
  const b = (s: string) => paint(st.color, s);
  const head = `${st.emoji} ${paint('bold', paint(st.color, st.title))}`;
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
    `🏢 ${paint('bold', paint('cyan', 'NEXUS AGENT OBSERVATORY'))} ${paint('gray', '· Mission Board')}  ${paint('gray', hms(now))}`,
    paint('gray', 'Canlı Görev & Ajan Operasyon Panosu'),
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
