import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import type { TaskEvent, TaskSummary } from './types.ts';

export class SqliteStore {
  private db: DatabaseSync;

  constructor(dbPath?: string) {
    const targetPath = dbPath || path.join(os.homedir(), '.observatory', 'observatory.sqlite');
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(targetPath);
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
  }

  recordEvent(event: TaskEvent, pid?: number): void {
    if (!event || !event.taskId) return;

    // 1. Insert event
    const insertEvt = this.db.prepare(`
      INSERT OR IGNORE INTO events (id, task_id, session_id, agent, tier, type, data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertEvt.run(
      event.id,
      event.taskId,
      event.sessionId,
      event.agent,
      event.tier,
      event.type,
      JSON.stringify(event.data || {}),
      event.timestamp
    );

    // 2. Upsert task summary
    const existing = this.db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(event.taskId) as any;

    if (!existing) {
      const insertTask = this.db.prepare(`
        INSERT INTO tasks (
          task_id, session_id, agent, status, prompt, model, pid,
          start_time, end_time, duration_ms, assistant_text,
          input_tokens, cached_tokens, output_tokens, reasoning_tokens,
          tools_json, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        null
      );
    } else {
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

      switch (event.type) {
        case 'task.started':
          status = 'running';
          if (event.data.prompt) prompt = event.data.prompt;
          if (event.data.model) model = event.data.model;
          break;

        case 'tool.invoked':
          tools.push({
            name: event.data.name || 'tool',
            input: event.data.input || {},
            timestamp: event.timestamp
          });
          break;

        case 'message.delta':
          assistantText += (event.data.text || '');
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
          status = 'completed';
          endTime = event.timestamp;
          durationMs = endTime - existing.start_time;
          if (event.data.result) assistantText = event.data.result;
          break;

        case 'task.failed':
          status = 'failed';
          endTime = event.timestamp;
          durationMs = endTime - existing.start_time;
          error = event.data.error || 'Bilinmeyen hata';
          break;

        case 'task.cancelled':
          status = 'cancelled';
          endTime = event.timestamp;
          durationMs = endTime - existing.start_time;
          error = event.data.reason || 'İptal edildi';
          break;
      }

      const updateTask = this.db.prepare(`
        UPDATE tasks SET
          session_id = ?, status = ?, prompt = ?, model = ?, pid = ?,
          end_time = ?, duration_ms = ?, assistant_text = ?,
          input_tokens = ?, cached_tokens = ?, output_tokens = ?, reasoning_tokens = ?,
          tools_json = ?, error = ?
        WHERE task_id = ?
      `);
      updateTask.run(
        sessionId, status, prompt, model, taskPid,
        endTime, durationMs, assistantText,
        inputTokens, cachedTokens, outputTokens, reasoningTokens,
        JSON.stringify(tools), error,
        event.taskId
      );
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
    const rows = this.db.prepare('SELECT * FROM events WHERE task_id = ? ORDER BY timestamp ASC').all(taskId) as any[];
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      sessionId: r.session_id,
      agent: r.agent,
      tier: r.tier,
      type: r.type,
      data: JSON.parse(r.data || '{}'),
      timestamp: r.timestamp
    }));
  }

  getEventsSince(lastTimestamp: number): TaskEvent[] {
    const rows = this.db.prepare('SELECT * FROM events WHERE timestamp > ? ORDER BY timestamp ASC').all(lastTimestamp) as any[];
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      sessionId: r.session_id,
      agent: r.agent,
      tier: r.tier,
      type: r.type,
      data: JSON.parse(r.data || '{}'),
      timestamp: r.timestamp
    }));
  }

  cancelTask(taskId: string, reason: string = 'Kullanıcı tarafından iptal edildi'): boolean {
    const row = this.db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as any;
    if (!row) return false;

    // Terminate process tree via Windows taskkill
    if (row.pid) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(row.pid), '/T', '/F'], { stdio: 'ignore' });
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
      error: row.error || null
    };
  }

  close(): void {
    this.db.close();
  }
}

export const globalSqlite = new SqliteStore();
