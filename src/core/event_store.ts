import { EventEmitter } from 'node:events';
import type { TaskEvent, TaskSummary } from './types.ts';
import { globalSqlite } from './sqlite_store.ts';

export interface EventStoreOptions {
  maxEvents?: number;
}

export class EventStore extends EventEmitter {
  private maxEvents: number;
  private events: TaskEvent[] = [];
  private tasks: Map<string, TaskSummary> = new Map();
  private sessionToTask: Map<string, string> = new Map();
  private seenSignatures: Set<string> = new Set();

  constructor(options: EventStoreOptions = {}) {
    super();
    this.maxEvents = options.maxEvents || 10000;
  }

  recordEvent(event: TaskEvent, pid?: number): void {
    if (!event || !event.taskId) return;

    // Persist to cross-process SQLite
    try {
      globalSqlite.recordEvent(event, pid);
    } catch {
      // Non-blocking fallback
    }

    // Deduplication check
    const sig = `${event.taskId}:${event.type}:${event.tier}:${JSON.stringify(event.data)}`;
    if (this.seenSignatures.has(sig)) {
      return;
    }
    this.seenSignatures.add(sig);
    if (this.seenSignatures.size > this.maxEvents * 2) {
      this.seenSignatures.clear();
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

    switch (event.type) {
      case 'task.started':
        task.status = 'running';
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
        task.status = 'completed';
        task.endTime = event.timestamp;
        task.durationMs = task.endTime - task.startTime;
        if (event.data.result) task.assistantText = event.data.result;
        break;

      case 'task.failed':
        task.status = 'failed';
        task.endTime = event.timestamp;
        task.durationMs = task.endTime - task.startTime;
        task.error = event.data.error || 'Bilinmeyen hata';
        break;

      case 'task.cancelled':
        task.status = 'cancelled';
        task.endTime = event.timestamp;
        task.durationMs = task.endTime - task.startTime;
        break;
    }

    this.emit('event', event);
    this.emit(`task:${event.taskId}`, event);
  }

  getTask(taskId: string): TaskSummary | null {
    return this.tasks.get(taskId) || globalSqlite.getTask(taskId);
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
    return globalSqlite.getRecentTasks(limit);
  }

  getEvents(taskId: string): TaskEvent[] {
    const memEvents = this.events.filter((e) => e.taskId === taskId);
    if (memEvents.length > 0) return memEvents;
    return globalSqlite.getEvents(taskId);
  }

  cancelTask(taskId: string, reason: string = 'Kullanıcı tarafından iptal edildi'): boolean {
    return globalSqlite.cancelTask(taskId, reason);
  }
}

export const globalStore = new EventStore();
