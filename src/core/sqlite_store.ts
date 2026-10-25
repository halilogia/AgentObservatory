import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { TaskEvent, TaskSummary } from './types.ts';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

/** Max bytes kept per string field (tool input/output values, etc.) to prevent WAL bloat. */
export const MAX_FIELD_BYTES = 50 * 1024;
/** Max bytes kept for a whole serialized event payload. */
export const MAX_EVENT_PAYLOAD_BYTES = 64 * 1024;
/** Max bytes accumulated in a task's assistant_text. */
export const MAX_ASSISTANT_TEXT_BYTES = 50 * 1024;

const TRUNC_MARKER_RE = /\.\.\.\[truncated \d+ bytes\]$/;

export function truncateText(text: string, maxBytes: number = MAX_FIELD_BYTES): string {
  const total = Buffer.byteLength(text, 'utf8');
  if (total <= maxBytes) return text;
  const kept = Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8');
  const keptBytes = Buffer.byteLength(kept, 'utf8');
  return `${kept}...[truncated ${total - keptBytes} bytes]`;
}

/** Recursively truncates oversized string values inside arbitrary JSON-like data. */
function boundValue(value: any, maxBytes: number = MAX_FIELD_BYTES, depth: number = 0): any {
  if (typeof value === 'string') return truncateText(value, maxBytes);
  if (value === null || typeof value !== 'object' || depth > 20) return value;
  if (Array.isArray(value)) return value.map((v) => boundValue(v, maxBytes, depth + 1));
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) out[k] = boundValue(v, maxBytes, depth + 1);
  return out;
}

function boundPayload(data: any): string {
  const json = JSON.stringify(boundValue(data || {}));
  if (Buffer.byteLength(json, 'utf8') <= MAX_EVENT_PAYLOAD_BYTES) return json;
  return JSON.stringify({ _truncated: truncateText(json, MAX_EVENT_PAYLOAD_BYTES) });
}

export class SqliteStore {
  private db: DatabaseSync;

  constructor(dbPath?: string) {
    if (dbPath === ':memory:') {
      this.db = new DatabaseSync(':memory:');
    } else {
      const targetPath = dbPath || path.join(os.homedir(), '.observatory', 'observatory.sqlite');
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.db = new DatabaseSync(targetPath);
    }
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        session_id TEXT,
        agent TEXT NOT NULL,
        tier INTEGER NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_task ON events(task_id);
      CREATE INDEX IF NOT EXISTS idx_events_ts ON events(timestamp);

      CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        session_id TEXT,
        agent TEXT NOT NULL,
        status TEXT NOT NULL,
        prompt TEXT,
        model TEXT,
        pid INTEGER,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration_ms INTEGER DEFAULT 0,
        assistant_text TEXT DEFAULT '',
        input_tokens INTEGER DEFAULT 0,
        cached_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        reasoning_tokens INTEGER DEFAULT 0,
        tools_json TEXT DEFAULT '[]',
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    `);

    // Safe migrations: parent_task_id on tasks and events
    for (const table of ['tasks', 'events']) {
      const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as any[];
      if (!cols.some((c) => c.name === 'parent_task_id')) {
        try {
          this.db.exec(`ALTER TABLE ${table} ADD COLUMN parent_task_id TEXT`);
        } catch {
          // Column may have been added concurrently by another process
        }
      }
    }
  }

  recordEvent(event: TaskEvent, pid?: number): void {
    if (!event || !event.taskId) return;

    this.db.exec('BEGIN IMMEDIATE;');
    try {
      // 1. Event Insert
      const insertEvt = this.db.prepare(`
        INSERT OR IGNORE INTO events (id, task_id, session_id, agent, tier, type, data, timestamp, parent_task_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      let parentTaskId: string | null = event.parentTaskId || event.data?.parentTaskId || null;
      if (!parentTaskId) {
        const parentRow = this.db.prepare('SELECT parent_task_id FROM tasks WHERE task_id = ?').get(event.taskId) as any;
        parentTaskId = parentRow?.parent_task_id || null;
      }
      const insertResult = insertEvt.run(
        event.id,
        event.taskId,
        event.sessionId,
        event.agent,
        event.tier,
        event.type,
        boundPayload(event.data),
        event.timestamp,
        parentTaskId
      );
      const wasInserted = Number(insertResult.changes) > 0;

      // 2. Task Summary Upsert
      const existing = this.db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(event.taskId) as any;

      if (existing && !wasInserted) {
        // Aynı olayı eski sürüm modelsiz yazmış olabilir: yeni sürüm modeli getiriyorsa boş alanı doldur (metrikler yine tekrar sayılmaz)
        if (!existing.model && event.data?.model) this.db.prepare('UPDATE tasks SET model = ? WHERE task_id = ?').run(String(event.data.model), event.taskId);
        // Duplicate event: do not accumulate metrics a second time
        this.db.exec('COMMIT;');
        return;
      }

      if (!existing) {
        const insertTask = this.db.prepare(`
          INSERT INTO tasks (
            task_id, session_id, agent, status, prompt, model, pid,
            start_time, end_time, duration_ms, assistant_text,
            input_tokens, cached_tokens, output_tokens, reasoning_tokens,
            tools_json, error, parent_task_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertTask.run(
          event.taskId,
          event.sessionId || null,
          event.agent,
          'running',
          event.data.prompt || '',
          event.data.model || '',
          pid || null,
          event.timestamp,
          null,
          0,
          '',
          0, 0, 0, 0,
          '[]',
          null,
          parentTaskId
        );
      } else {
        const isAlreadyTerminal = TERMINAL_STATUSES.has(existing.status);
        let status = existing.status;
        let prompt = existing.prompt || event.data.prompt || '';
        let model = existing.model || event.data.model || '';
        let sessionId = existing.session_id || event.sessionId || null;
        let taskPid = existing.pid || pid || null;
        let endTime = existing.end_time;
        let durationMs = existing.duration_ms;
        let assistantText = existing.assistant_text || '';
        let inputTokens = existing.input_tokens || 0;
        let cachedTokens = existing.cached_tokens || 0;
        let outputTokens = existing.output_tokens || 0;
        let reasoningTokens = existing.reasoning_tokens || 0;
        let tools: any[] = [];
        try { tools = JSON.parse(existing.tools_json || '[]'); } catch {}
        let error = existing.error;
        const taskParentId = existing.parent_task_id || parentTaskId || null;

        switch (event.type) {
          case 'task.started':
            if (!isAlreadyTerminal) status = 'running';
            if (event.data.prompt) prompt = event.data.prompt;
            if (event.data.model) model = event.data.model;
            break;

          case 'tool.invoked':
            tools.push({
              name: event.data.name || 'tool',
              input: boundValue(event.data.input || {}),
              timestamp: event.timestamp
            });
            break;

          case 'message.delta':
            if (!TRUNC_MARKER_RE.test(assistantText)) {
              assistantText = truncateText(assistantText + (event.data.text || ''), MAX_ASSISTANT_TEXT_BYTES);
            }
            break;

          case 'usage.updated':
            if (event.data.usage) {
              const u = event.data.usage;
              inputTokens = u.inputTokens || inputTokens;
              cachedTokens = u.cachedTokens || cachedTokens;
              outputTokens = u.outputTokens || outputTokens;
              reasoningTokens = u.reasoningTokens || reasoningTokens;
            }
            break;

          case 'task.completed':
            if (!isAlreadyTerminal) {
              status = 'completed';
              endTime = event.timestamp;
              durationMs = endTime - existing.start_time;
              if (event.data.result && !assistantText) assistantText = truncateText(String(event.data.result), MAX_ASSISTANT_TEXT_BYTES);
            }
            break;

          case 'task.failed':
            if (!isAlreadyTerminal) {
              status = 'failed';
              endTime = event.timestamp;
              durationMs = endTime - existing.start_time;
              error = event.data.error || 'Bilinmeyen hata';
            }
            break;

          case 'task.cancelled':
            if (!isAlreadyTerminal) {
              status = 'cancelled';
              endTime = event.timestamp;
              durationMs = endTime - existing.start_time;
              error = event.data.reason || 'İptal edildi';
            }
            break;
        }

        const updateTask = this.db.prepare(`
          UPDATE tasks SET
            session_id = ?, status = ?, prompt = ?, model = ?, pid = ?,
            end_time = ?, duration_ms = ?, assistant_text = ?,
            input_tokens = ?, cached_tokens = ?, output_tokens = ?, reasoning_tokens = ?,
            tools_json = ?, error = ?, parent_task_id = ?
          WHERE task_id = ?
        `);
        updateTask.run(
          sessionId, status, prompt, model, taskPid,
          endTime, durationMs, assistantText,
          inputTokens, cachedTokens, outputTokens, reasoningTokens,
          JSON.stringify(tools), error, taskParentId,
          event.taskId
        );
      }

      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  getTask(taskId: string): TaskSummary | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as any;
    if (!row) return null;
    return this.mapTaskSummary(row);
  }

  getRecentTasks(limit: number = 10): TaskSummary[] {
    const rows = this.db.prepare('SELECT * FROM tasks ORDER BY start_time DESC LIMIT ?').all(limit) as any[];
    return rows.map((r) => this.mapTaskSummary(r));
  }

  getEvents(taskId: string): TaskEvent[] {
    const rows = this.db.prepare('SELECT rowid AS seq, id, task_id, session_id, agent, tier, type, data, timestamp, parent_task_id FROM events WHERE task_id = ? ORDER BY rowid ASC').all(taskId) as any[];
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      sessionId: r.session_id,
      agent: r.agent,
      tier: r.tier,
      type: r.type,
      data: JSON.parse(r.data || '{}'),
      timestamp: r.timestamp,
      ...(r.parent_task_id ? { parentTaskId: r.parent_task_id } : {})
    }));
  }

  /** Bir oturumun tüm görevleri, kronolojik (eskiden yeniye). */
  getTasksForSession(sessionId: string): TaskSummary[] {
    const rows = this.db.prepare('SELECT * FROM tasks WHERE session_id = ? ORDER BY start_time ASC, rowid ASC').all(sessionId) as any[];
    return rows.map((r) => this.mapTaskSummary(r));
  }

  /** Bir oturumun tüm görevlerinin olayları tek kronolojik akışta (rowid sırası). */
  getEventsForSession(sessionId: string): TaskEvent[] {
    const rows = this.db.prepare('SELECT rowid AS seq, id, task_id, session_id, agent, tier, type, data, timestamp, parent_task_id FROM events WHERE session_id = ? ORDER BY rowid ASC').all(sessionId) as any[];
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      sessionId: r.session_id,
      agent: r.agent,
      tier: r.tier,
      type: r.type,
      data: JSON.parse(r.data || '{}'),
      timestamp: r.timestamp,
      ...(r.parent_task_id ? { parentTaskId: r.parent_task_id } : {})
    }));
  }

  getMaxSeq(): number {
    try {
      const row = this.db.prepare('SELECT COALESCE(MAX(rowid), 0) AS maxSeq FROM events').get() as any;
      return row ? Number(row.maxSeq) : 0;
    } catch {
      return 0;
    }
  }

  getEventsSinceSeq(lastSeq: number): Array<TaskEvent & { seq: number }> {
    const rows = this.db.prepare('SELECT rowid AS seq, id, task_id, session_id, agent, tier, type, data, timestamp, parent_task_id FROM events WHERE rowid > ? ORDER BY rowid ASC').all(lastSeq) as any[];
    return rows.map((r) => ({
      seq: r.seq,
      id: r.id,
      taskId: r.task_id,
      sessionId: r.session_id,
      agent: r.agent,
      tier: r.tier,
      type: r.type,
      data: JSON.parse(r.data || '{}'),
      timestamp: r.timestamp,
      ...(r.parent_task_id ? { parentTaskId: r.parent_task_id } : {})
    }));
  }

  getEventsSince(lastTimestamp: number): TaskEvent[] {
    const rows = this.db.prepare('SELECT rowid AS seq, id, task_id, session_id, agent, tier, type, data, timestamp, parent_task_id FROM events WHERE timestamp > ? ORDER BY rowid ASC').all(lastTimestamp) as any[];
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      sessionId: r.session_id,
      agent: r.agent,
      tier: r.tier,
      type: r.type,
      data: JSON.parse(r.data || '{}'),
      timestamp: r.timestamp,
      ...(r.parent_task_id ? { parentTaskId: r.parent_task_id } : {})
    }));
  }

  cancelTask(taskId: string, reason: string = 'Kullanıcı tarafından iptal edildi'): boolean {
    const row = this.db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as any;
    if (!row) return false;
    if (TERMINAL_STATUSES.has(row.status)) return false; // Already finished or cancelled

    // Synchronously terminate process tree via Windows taskkill
    if (row.pid) {
      try {
        if (process.platform === 'win32') {
          execFileSync('taskkill', ['/pid', String(row.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          process.kill(row.pid, 'SIGTERM');
        }
      } catch {
        // Process might already be dead
      }
    }

    const now = Date.now();
    this.recordEvent({
      id: `evt_cancel_${taskId}_${now}`,
      taskId,
      sessionId: row.session_id,
      agent: row.agent,
      tier: 1,
      type: 'task.cancelled',
      data: { reason },
      timestamp: now
    });

    return true;
  }

  private mapTaskSummary(row: any): TaskSummary {
    let tools: any[] = [];
    try { tools = JSON.parse(row.tools_json || '[]'); } catch {}

    const inTok = row.input_tokens || 0;
    const outTok = row.output_tokens || 0;

    return {
      taskId: row.task_id,
      sessionId: row.session_id,
      agent: row.agent,
      status: row.status,
      prompt: row.prompt || '',
      model: row.model || '',
      startTime: row.start_time,
      endTime: row.end_time,
      durationMs: row.duration_ms || 0,
      toolsUsed: tools,
      assistantText: row.assistant_text || '',
      usage: {
        inputTokens: inTok,
        cachedTokens: row.cached_tokens || 0,
        outputTokens: outTok,
        reasoningTokens: row.reasoning_tokens || 0,
        totalTokens: inTok + outTok
      },
      error: row.error || null,
      ...(row.parent_task_id ? { parentTaskId: row.parent_task_id } : {})
    };
  }

  close(): void {
    this.db.close();
  }
}

export const globalSqlite = new SqliteStore();
