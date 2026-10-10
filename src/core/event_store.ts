import { EventEmitter } from 'node:events';
import type { TaskEvent, TaskSummary } from './types.ts';
import { globalSqlite, SqliteStore } from './sqlite_store.ts';

export interface EventStoreOptions {
  maxEvents?: number;
  sqliteStore?: SqliteStore;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export class EventStore extends EventEmitter {
  private maxEvents: number;
  private sqliteStore: SqliteStore;
  private events: TaskEvent[] = [];
  private tasks: Map<string, TaskSummary> = new Map();
  private sessionToTask: Map<string, string> = new Map();
  private seenEventIds: Set<string> = new Set();

  constructor(options: EventStoreOptions = {}) {
    super();
    this.maxEvents = options.maxEvents || 10000;
    this.sqliteStore = options.sqliteStore || globalSqlite;
  }

  recordEvent(event: TaskEvent, pid?: number): void {
    if (!event || !event.taskId) return;

    // Persist to cross-process SQLite
    try {
      this.sqliteStore.recordEvent(event, pid);
    } catch (err: any) {
      console.error(`[Observatory] SQLite record error: ${err.message}`);
    }

    // Deduplication check by unique event ID (NOT by content hashing, which drops consecutive identical deltas)
    if (this.seenEventIds.has(event.id)) {
      return;
    }
    this.seenEventIds.add(event.id);
    if (this.seenEventIds.size > this.maxEvents * 2) {
      this.seenEventIds.clear();
    }

    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Update Task Aggregation
    let task = this.tasks.get(event.taskId);
    if (!task) {
      task = {
        taskId: event.taskId,
        sessionId: event.sessionId,
        agent: event.agent,
        status: 'pending',
        prompt: '',
        model: '',
        startTime: event.timestamp,
        endTime: null,
        durationMs: 0,
        toolsUsed: [],
        assistantText: '',
        usage: {
          inputTokens: 0,
          cachedTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0
        },
        error: null
      };
      this.tasks.set(event.taskId, task);
    }

    if (event.sessionId) {
      task.sessionId = event.sessionId;
      this.sessionToTask.set(event.sessionId, event.taskId);
    }

    const isAlreadyTerminal = TERMINAL_STATUSES.has(task.status);

    switch (event.type) {
      case 'task.started':
        if (!isAlreadyTerminal) {
          task.status = 'running';
        }
        task.prompt = event.data.prompt || task.prompt;
        task.model = event.data.model || task.model;
        break;

      case 'tool.invoked':
        task.toolsUsed.push({
          id: event.data.id,
          name: event.data.name || 'tool',
          input: event.data.input || {},
          timestamp: event.timestamp
        });
        break;

      case 'message.delta':
        task.assistantText += (event.data.text || '');
        break;

      case 'usage.updated':
        if (event.data.usage) {
          const u = event.data.usage;
          task.usage.inputTokens = u.inputTokens || task.usage.inputTokens;
          task.usage.cachedTokens = u.cachedTokens || task.usage.cachedTokens;
          task.usage.outputTokens = u.outputTokens || task.usage.outputTokens;
          task.usage.reasoningTokens = u.reasoningTokens || task.usage.reasoningTokens;
          task.usage.totalTokens = (task.usage.inputTokens + task.usage.outputTokens);
        }
        break;

      case 'task.completed':
        if (!isAlreadyTerminal) {
          task.status = 'completed';
          task.endTime = event.timestamp;
          task.durationMs = task.endTime - task.startTime;
          if (event.data.result && !task.assistantText) {
            task.assistantText = event.data.result;
          }
        }
        break;

      case 'task.failed':
        if (!isAlreadyTerminal) {
          task.status = 'failed';
          task.endTime = event.timestamp;
          task.durationMs = task.endTime - task.startTime;
          task.error = event.data.error || 'Bilinmeyen hata';
        }
        break;

      case 'task.cancelled':
        if (!isAlreadyTerminal) {
          task.status = 'cancelled';
          task.endTime = event.timestamp;
          task.durationMs = task.endTime - task.startTime;
          task.error = event.data.reason || 'İptal edildi';
        }
        break;
    }

    this.emit('event', event);
    this.emit(`task:${event.taskId}`, event);
  }

  getTask(taskId: string): TaskSummary | null {
    return this.tasks.get(taskId) || this.sqliteStore.getTask(taskId);
  }

  getTaskBySession(sessionId: string): TaskSummary | null {
    const taskId = this.sessionToTask.get(sessionId);
    return taskId ? this.getTask(taskId) : null;
  }

  getRecentTasks(limit: number = 10): TaskSummary[] {
    const memTasks = Array.from(this.tasks.values());
    if (memTasks.length > 0) {
      return memTasks.sort((a, b) => b.startTime - a.startTime).slice(0, limit);
    }
    return this.sqliteStore.getRecentTasks(limit);
  }

  getEvents(taskId: string): TaskEvent[] {
    const memEvents = this.events.filter((e) => e.taskId === taskId);
    if (memEvents.length > 0) return memEvents;
    return this.sqliteStore.getEvents(taskId);
  }

  cancelTask(taskId: string, reason: string = 'Kullanıcı tarafından iptal edildi'): boolean {
    return this.sqliteStore.cancelTask(taskId, reason);
  }
}

export const globalStore = new EventStore();
