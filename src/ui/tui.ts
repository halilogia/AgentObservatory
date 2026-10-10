import { EventStore, globalStore } from '../core/event_store.ts';
import { globalSqlite } from '../core/sqlite_store.ts';
import type { TaskEvent } from '../core/types.ts';

export const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

export function paint(color: keyof typeof COLORS, text: string): string {
  return `${COLORS[color] || ''}${text}${COLORS.reset}`;
}

export function hms(date: Date | number = new Date()): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toTimeString().split(' ')[0];
}

const MAX_PENDING_TOOLS = 500;

type ToolKind = 'read' | 'edit' | 'write' | 'bash' | 'grep' | 'glob' | 'agent' | 'other';

export interface ToolInfo {
  name: string;
  kind: ToolKind;
  target: string;
}

// JSON kaçışlarını okunur hale getirir ve boşlukları sıkıştırır.
export function cleanText(text: unknown): string {
  return String(text ?? '')
    .replace(/\\\\/g, '/')
    .replace(/\\[nrt]/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text;
}

// Absolute yolları cwd'ye göre rölatifleştirir; proje dışı uzun yolları kısaltır.
export function shortPath(p: unknown): string {
  const norm = String(p ?? '').replace(/\\+/g, '/').replace(/\s+/g, ' ').trim();
  if (!norm) return '';
  const cwd = process.cwd().replace(/\\/g, '/').replace(/\/+$/, '');
  if (norm.toLowerCase() === cwd.toLowerCase()) return '.';
  if (norm.toLowerCase().startsWith(cwd.toLowerCase() + '/')) {
    return truncate(norm.slice(cwd.length + 1), 70);
  }
  const parts = norm.split('/').filter(Boolean);
  if (parts.length > 3) return '.../' + parts.slice(-3).join('/');
  return truncate(norm, 70);
}

export function describeTool(name: string, input: any): ToolInfo {
  const n = String(name || 'tool');
  const inp = input && typeof input === 'object' ? input : {};
  const file = inp.file_path ?? inp.path ?? inp.filePath ?? inp.notebook_path;
  const lower = n.toLowerCase();
  if (lower === 'read') return { name: n, kind: 'read', target: shortPath(file) };
  if (lower === 'edit' || lower === 'multiedit') return { name: n, kind: 'edit', target: shortPath(file) };
  if (lower === 'write') return { name: n, kind: 'write', target: shortPath(file) };
  if (/bash|powershell|shell|command|exec/.test(lower)) {
    const cmd = inp.command ?? inp.cmd ?? '';
    return { name: n, kind: 'bash', target: truncate(cleanText(Array.isArray(cmd) ? cmd.join(' ') : cmd), 80) };
  }
  if (lower === 'grep') {
    const where = inp.path ? ` (${shortPath(inp.path)})` : '';
    return { name: n, kind: 'grep', target: `"${truncate(cleanText(inp.pattern), 50)}"${where}` };
  }
  if (lower === 'glob') return { name: n, kind: 'glob', target: truncate(cleanText(inp.pattern), 70) };
  if (lower === 'agent' || lower === 'task') {
    const desc = truncate(cleanText(inp.description || inp.prompt), 80);
    const type = inp.subagent_type ? ` (${cleanText(inp.subagent_type)})` : '';
    return { name: n, kind: 'agent', target: desc + type };
  }
  const preview = Object.keys(inp).length ? truncate(cleanText(JSON.stringify(inp)).replace(/[{}"]/g, ''), 70) : '';
  return { name: n, kind: 'other', target: preview };
}

export function formatToolCall(name: string, input: any): string {
  const info = describeTool(name, input);
  switch (info.kind) {
    case 'read': return `${paint('yellow', '📖 OKUYOR')}: ${paint('gray', info.target)}`;
    case 'edit': return `${paint('yellow', '✏️ DÜZENLİYOR')}: ${paint('gray', info.target)}`;
    case 'write': return `${paint('yellow', '📝 YAZIYOR')}: ${paint('gray', info.target)}`;
    case 'bash': return `${paint('yellow', '💻 KOMUT')}: ${paint('gray', info.target)}`;
    case 'grep': return `${paint('yellow', '🔎 KOD ARAMA')}: ${paint('gray', info.target)}`;
    case 'glob': return `${paint('yellow', '📁 DOSYA LİSTELEME')}: ${paint('gray', info.target)}`;
    case 'agent':
      return paint('magenta', `${COLORS.bold}🤖 [ALT AJAN (SUBAGENT) BAŞLATILDI]: ${info.target}`);
    default:
      return `${paint('yellow', '⚡ ARAÇ')} ${paint('bold', info.name)}${info.target ? ': ' + paint('gray', info.target) : ''}`;
  }
}

export function formatToolCompleted(
  info: ToolInfo | undefined,
  output: unknown,
  isError: boolean,
  exitCode?: number
): string {
  const out = truncate(cleanText(output), 80);
  const code = exitCode !== undefined && exitCode !== null ? ` [kod: ${exitCode}]` : '';
  const kind = info?.kind ?? 'other';
  const target = info?.target || '';

  if (kind === 'agent') {
    const summary = out || '(tamamlandı)';
    return isError
      ? `${paint('red', '✖ ALT AJAN HATASI')}: ${paint('gray', summary)}`
      : paint('magenta', `${COLORS.bold}🤖 [ALT AJAN GÖREVİ BİTİRDİ]: ${summary}`);
  }
  if (isError) {
    const label = info ? `${info.name}${target ? ' ' + target : ''}` : 'araç';
    return `${paint('red', '✖ ARAÇ HATASI')} ▶ ${paint('bold', label)}${code}: ${paint('gray', out || '(hata)')}`;
  }

  const done: Record<ToolKind, string> = {
    read: 'OKUNDU', edit: 'DÜZENLENDİ', write: 'YAZILDI', bash: 'KOMUT TAMAMLANDI',
    grep: 'ARAMA BİTTİ', glob: 'LİSTELEME BİTTİ', agent: '', other: 'ARAÇ BİTTİ'
  };
  const label = done[kind];
  if (kind === 'read' || kind === 'edit' || kind === 'write') {
    return `${paint('green', `✔ ${label}`)}: ${paint('bold', target)}`;
  }
  const head = info && kind === 'other' ? `${label} ▶ ${paint('bold', info.name)}` : label;
  const detail = kind === 'bash' || kind === 'other' ? out : target;
  return `${paint('green', `✔ ${head}`)}${code}${detail ? ': ' + paint('gray', detail) : ''}`;
}

export class TerminalUI {
  private store: EventStore;
  private pendingTools: Map<string, ToolInfo> = new Map();
  private boundOnEvent: (evt: TaskEvent) => void;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastSeq: number = 0;
  private seenEventIds: Set<string> = new Set();
  private keyListener: ((chunk: Buffer | string) => void) | null = null;

  constructor(store: EventStore = globalStore) {
    this.store = store;
    this.boundOnEvent = this.onEvent.bind(this);
  }

  start(): void {
    this.renderHeader();
    this.store.on('event', this.boundOnEvent);
  }

  startWatchMode(intervalMs: number = 300, clean: boolean = true): void {
    try {
      console.clear();
    } catch {}
    this.renderHeader();
    this.store.on('event', this.boundOnEvent);

    this.lastSeq = clean ? globalSqlite.getMaxSeq() : 0;
    if (!clean) {
      this.pollSqlite();
    }

    this.pollInterval = setInterval(() => {
      this.pollSqlite();
    }, intervalMs);

    this.setupKeyboard();
  }

  private loadHistory(): void {
    console.log(paint('yellow', '\n📜 [GEÇMİŞ] Tüm geçmiş olaylar veritabanından yükleniyor...\n'));
    this.seenEventIds.clear();
    this.lastSeq = 0;
    this.pollSqlite();
  }

  private setupKeyboard(): void {
    const stdin = process.stdin;
    if (!stdin.isTTY || this.keyListener) return;
    try {
      stdin.setRawMode(true);
    } catch {
      return;
    }
    stdin.resume();
    this.keyListener = (chunk: Buffer | string) => {
      const key = chunk.toString();
      if (key === '\u0003' || key === 'q' || key === 'Q') {
        this.stop();
        process.exit(0);
      } else if (key === 'h' || key === 'H') {
        this.loadHistory();
      } else if (key === 'c' || key === 'C') {
        try {
          console.clear();
        } catch {}
        this.renderHeader();
      }
    };
    stdin.on('data', this.keyListener);
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.store.off('event', this.boundOnEvent);
    if (this.keyListener) {
      process.stdin.off('data', this.keyListener);
      this.keyListener = null;
      try {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
      } catch {}
      process.stdin.pause();
    }
  }

  private pollSqlite(): void {
    try {
      const newEvents = globalSqlite.getEventsSinceSeq(this.lastSeq);
      for (const evt of newEvents) {
        if (!this.seenEventIds.has(evt.id)) {
          this.seenEventIds.add(evt.id);
          this.lastSeq = Math.max(this.lastSeq, evt.seq);
          this.renderEvent(evt);
        }
      }
    } catch {
      // Ignore concurrent file lock reads in SQLite WAL
    }
  }

  renderHeader(): void {
    console.log(paint('cyan', '═'.repeat(80)));
    console.log(` ${paint('bold', '🔭 AGENT OBSERVATORY')} · ${paint('green', 'Canlı Olay Akışı')} · ${paint('gray', hms())}`);
    console.log(` ${paint('gray', 'Kısayollar: [H] Geçmişi Yükle · [C] Ekranı Temizle · [Q] Çıkış')}`);
    console.log(paint('cyan', '═'.repeat(80)));
  }

  onEvent(evt: TaskEvent): void {
    if (this.seenEventIds.has(evt.id)) return;
    this.seenEventIds.add(evt.id);
    this.renderEvent(evt);
  }

  private renderEvent(evt: TaskEvent): void {
    const parentId = evt.data?.parentTaskId || evt.parentTaskId;
    const childPrefix = parentId ? paint('yellow', '   └─ ') : '';
    const time = childPrefix + paint('gray', hms(evt.timestamp));
    const agent = paint('cyan', `[${evt.agent.toUpperCase()}]`);

    switch (evt.type) {
      case 'task.started':
        console.log(`\n${time} ${agent} ${paint('green', '▶ GÖREV BAŞLADI')}: ${paint('bold', evt.data.prompt || '')}`);
        if (evt.sessionId) {
          console.log(`         ${paint('gray', '│')} Oturum ID: ${paint('yellow', evt.sessionId)}`);
        }
        if (evt.data.model) {
          console.log(`         ${paint('gray', '│')} Model: ${evt.data.model}`);
        }
        break;

      case 'tool.invoked': {
        const toolName = evt.data.name || 'tool';
        const toolId = evt.data.id || evt.data.toolUseId;
        if (toolId) {
          this.pendingTools.set(String(toolId), describeTool(toolName, evt.data.input));
          if (this.pendingTools.size > MAX_PENDING_TOOLS) {
            const oldest = this.pendingTools.keys().next().value;
            if (oldest !== undefined) this.pendingTools.delete(oldest);
          }
        }
        console.log(`${time} ${agent} ${formatToolCall(toolName, evt.data.input)}`);
        break;
      }

      case 'tool.completed': {
        const toolId = evt.data.toolUseId || evt.data.id;
        let info = toolId ? this.pendingTools.get(String(toolId)) : undefined;
        if (toolId) this.pendingTools.delete(String(toolId));
        if (!info && evt.data.name) info = describeTool(evt.data.name, {});
        console.log(`${time} ${agent} ${formatToolCompleted(info, evt.data.output, !!evt.data.isError, evt.data.exitCode)}`);
        break;
      }

      case 'message.delta': {
        const delta = evt.data.text || '';
        const lines = delta.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim()) {
            console.log(`${time} ${agent} ${paint('white', lines[i])}`);
          }
        }
        break;
      }

      case 'usage.updated': {
        const u = evt.data.usage || {};
        console.log(`${time} ${agent} ${paint('magenta', '📊 TOKEN')}: Girdi: ${u.inputTokens || 0} · Önbellek: ${u.cachedTokens || 0} · Çıktı: ${u.outputTokens || 0}`);
        break;
      }

      case 'task.completed':
        console.log(`${time} ${agent} ${paint('green', '✔ GÖREV TAMAMLANDI')}`);
        console.log(paint('gray', '─'.repeat(80)));
        break;

      case 'task.failed':
        console.log(`${time} ${agent} ${paint('red', '✖ GÖREV BAŞARISIZ')}: ${evt.data.error}`);
        console.log(paint('gray', '─'.repeat(80)));
        break;

      case 'task.cancelled':
        console.log(`${time} ${agent} ${paint('yellow', '⏹ GÖREV İPTAL EDİLDİ')}: ${evt.data.reason}`);
        console.log(paint('gray', '─'.repeat(80)));
        break;
    }
  }
}
