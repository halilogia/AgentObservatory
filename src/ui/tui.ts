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

export class TerminalUI {
  private store: EventStore;
  private boundOnEvent: (evt: TaskEvent) => void;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastSeq: number = 0;
  private seenEventIds: Set<string> = new Set();

  constructor(store: EventStore = globalStore) {
    this.store = store;
    this.boundOnEvent = this.onEvent.bind(this);
  }

  start(): void {
    this.renderHeader();
    this.store.on('event', this.boundOnEvent);
  }

  startWatchMode(intervalMs: number = 300): void {
    this.renderHeader();
    this.store.on('event', this.boundOnEvent);

    this.lastSeq = 0;
    this.pollSqlite();

    this.pollInterval = setInterval(() => {
      this.pollSqlite();
    }, intervalMs);
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.store.off('event', this.boundOnEvent);
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
    console.log(` ${paint('gray', 'Mod: Event-First Hybrid (TS) · SQLite WAL Cross-Process · Çıkış: Ctrl+C')}`);
    console.log(paint('cyan', '═'.repeat(80)));
  }

  onEvent(evt: TaskEvent): void {
    if (this.seenEventIds.has(evt.id)) return;
    this.seenEventIds.add(evt.id);
    this.renderEvent(evt);
  }

  private renderEvent(evt: TaskEvent): void {
    const time = paint('gray', hms(evt.timestamp));
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
        const inputStr = JSON.stringify(evt.data.input || {});
        const preview = inputStr.length > 80 ? inputStr.slice(0, 77) + '...' : inputStr;
        console.log(`${time} ${agent} ${paint('yellow', '⚡ ARAÇ BAŞLADI')} ▶ ${paint('bold', toolName)}: ${paint('gray', preview)}`);
        break;
      }

      case 'tool.completed': {
        const toolName = evt.data.name || evt.data.toolUseId || 'araç';
        const isError = evt.data.isError;
        const exitCode = evt.data.exitCode !== undefined ? ` [kod: ${evt.data.exitCode}]` : '';
        const output = (evt.data.output || '').replace(/\s+/g, ' ').slice(0, 80);
        const icon = isError ? paint('red', '✖ ARAÇ HATASI') : paint('green', '✔ ARAÇ BİTTİ');
        console.log(`${time} ${agent} ${icon} ▶ ${paint('bold', toolName)}${exitCode}: ${paint('gray', output || '(tamamlandı)')}`);
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
