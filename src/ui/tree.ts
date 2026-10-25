import { globalSqlite } from '../core/sqlite_store.ts';
import type { TaskSummary } from '../core/types.ts';
import { paint, cleanText, truncate, describeTool, hms } from './tui.ts';

// Ağaç görünümü: aynı anda çalışan birçok ajanı tek akışa karıştırmadan, ajan başına 2 satırla gösterir.
// Mevcut `watch` / `chat` görünümlerine dokunmaz; yalnızca SQLite'taki görev kayıtlarını okur.
//   node --experimental-strip-types src/cli.ts tree [--once] [--all]
// Tuşlar: A = yalnızca çalışanlar / son görevler, Q = çıkış.

const RECENT_WINDOW_MS = 30 * 60 * 1000;
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

const STALE_MS = 60 * 60 * 1000;   // bir saatten uzun "çalışıyor" görünen kayıtlar büyük olasılıkla bitmemiş eski oturumlardır

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

function lastActivity(t: TaskSummary, width: number): string {
  if (t.error) return paint('red', 'hata: ' + truncate(cleanText(t.error), width));
  const tool = t.toolsUsed[t.toolsUsed.length - 1];
  if (t.status === 'running' && tool) {
    const info = describeTool(tool.name, tool.input);
    return paint('gray', '› ' + truncate(`${info.name} ${info.target}`.trim(), width));
  }
  const text = cleanText(t.assistantText);
  if (text) {
    // son söz: kelime ortasından başlamasın
    const tail = text.length > width ? text.slice(-width).replace(/^\S*\s/, '') : text;
    return paint('gray', '“' + truncate(tail, width) + '”');
  }
  if (tool) {
    const info = describeTool(tool.name, tool.input);
    return paint('gray', '› ' + truncate(`${info.name} ${info.target}`.trim(), width));
  }
  return paint('gray', truncate(cleanText(t.prompt), width));
}

function nodeLines(t: TaskSummary, prefix: string, childPrefix: string, cols: number, now: number): string[] {
  const dur = fmtDuration(isLive(t, now) ? now - t.startTime : t.durationMs);
  const tag = paint(AGENT_COLOR[t.agent] || 'white', paint('bold', t.agent));
  const tokens = t.usage?.totalTokens ? paint('gray', ' · ' + fmtTokens(t.usage.totalTokens) + ' tok') : '';
  const head = `${prefix}${statusGlyph(t, now)} ${tag} ${modelName(t)} ${paint('gray', t.taskId.slice(-8))} ${paint('gray', dur)}${tokens}`;
  return [head, `${childPrefix}${lastActivity(t, Math.max(20, cols - childPrefix.length - 4))}`];
}

export function renderTree(tasks: TaskSummary[], opts: { onlyRunning: boolean; cols: number; rows: number; now: number }): string {
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
  // çalışanlar üstte, sonra yeniden eskiye
  const order = (a: TaskSummary, b: TaskSummary) => Number(running(b)) - Number(running(a)) || b.startTime - a.startTime;
  roots.sort(order);

  const counts = { run: 0, ok: 0, fail: 0 };
  for (const t of shown) {
    if (running(t)) counts.run++;
    else if (t.status === 'completed') counts.ok++;
    else counts.fail++;
  }
  const out: string[] = [];
  out.push(`${paint('bold', 'Observatory · Ağaç')}  ${paint('gray', hms(now))}   ${paint('yellow', '● ' + counts.run + ' çalışıyor')}  ${paint('green', '✔ ' + counts.ok)}  ${paint('red', '✖ ' + counts.fail)}   ${paint('gray', opts.onlyRunning ? '[A] son görevler' : '[A] yalnız çalışanlar')}  ${paint('gray', '[Q] çıkış')}`);
  out.push(paint('gray', '─'.repeat(Math.max(20, Math.min(cols, 120)))));
  if (roots.length === 0) out.push(paint('gray', '(gösterilecek görev yok)'));

  const walk = (t: TaskSummary, prefix: string, childPrefix: string) => {
    out.push(...nodeLines(t, prefix, childPrefix + (children.has(t.taskId) ? '│ ' : '  '), cols, now));
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
  // ekrana sığmayan kısmı kes (üstteki çalışanlar kalır)
  const max = Math.max(8, opts.rows - 1);
  if (out.length > max) {
    const hidden = out.length - max + 1;
    return out.slice(0, max - 1).join('\n') + '\n' + paint('gray', `… ${hidden} satır daha (ekranı büyütün veya [A] ile süzün)`);
  }
  return out.join('\n');
}

export function runTree(args: string[]): void {
  const once = args.includes('--once');
  let onlyRunning = false;
  const frame = () => {
    const tasks = globalSqlite.getRecentTasks(TASK_LIMIT);
    return renderTree(tasks, { onlyRunning, cols: process.stdout.columns || 120, rows: process.stdout.rows || 40, now: Date.now() });
  };
  if (once || !process.stdin.isTTY) {
    console.log(frame());
    process.exit(0);
  }
  const draw = () => process.stdout.write('\x1b[H' + frame().split('\n').map((l) => l + '\x1b[K').join('\n') + '\n\x1b[J');
  process.stdout.write('\x1b[2J');
  draw();
  const timer = setInterval(draw, 800);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (buf) => {
    const k = buf.toString();
    if (k === 'q' || k === 'Q' || k === '\x03' || k === '\x1b') {
      clearInterval(timer);
      process.stdout.write('\x1b[2J\x1b[H');
      process.exit(0);
    }
    if (k === 'a' || k === 'A') {
      onlyRunning = !onlyRunning;
      process.stdout.write('\x1b[2J');
      draw();
    }
  });
}
