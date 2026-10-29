import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { TaskEvent, TaskSummary } from './types.ts';
import type { Mission, MissionContract, TaskNode, AgentRun, TaskStatus } from './mission_types.ts';

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

/** JSON dizisi metninin sonuna öğe ekler; geçerli dizi değilse bozuk kaydı atıp yeni diziyle başlar (eski davranışla aynı). */
function appendJsonArray(json: string, item: unknown): string {
  const s = json.trim();
  const itemJson = JSON.stringify(item);
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    return inner ? `[${inner},${itemJson}]` : `[${itemJson}]`;
  }
  return `[${itemJson}]`;
}

export class SqliteStore {
  private db: DatabaseSync;
  private stmtInsertEvt: any = null;
  private stmtGetParent: any = null;
  private stmtGetTask: any = null;
  private stmtInsertTask: any = null;
  private stmtUpdateTask: any = null;
  private stmtUpdateModel: any = null;
  /** SQL metni -> hazır ifade: TUI/ingest her tick'te aynı sorguları çalıştırır, her seferinde yeniden derlenmesin. */
  private stmts = new Map<string, StatementSync>();

  private prep(sql: string): StatementSync {
    let s = this.stmts.get(sql);
    if (!s) { s = this.db.prepare(sql); this.stmts.set(sql, s); }
    return s;
  }

  private getStmtInsertEvt() {
    return (this.stmtInsertEvt ??= this.prep(`
      INSERT OR IGNORE INTO events (id, task_id, session_id, agent, tier, type, data, timestamp, parent_task_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `));
  }
  private getStmtGetParent() {
    return (this.stmtGetParent ??= this.prep('SELECT parent_task_id FROM tasks WHERE task_id = ?'));
  }
  private getStmtGetTask() {
    return (this.stmtGetTask ??= this.prep('SELECT * FROM tasks WHERE task_id = ?'));
  }
  private getStmtInsertTask() {
    return (this.stmtInsertTask ??= this.prep(`
      INSERT INTO tasks (
        task_id, session_id, agent, status, prompt, model, pid,
        start_time, end_time, duration_ms, assistant_text,
        input_tokens, cached_tokens, output_tokens, reasoning_tokens,
        tools_json, error, parent_task_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `));
  }
  private getStmtUpdateTask() {
    return (this.stmtUpdateTask ??= this.prep(`
      UPDATE tasks SET
        session_id = ?, status = ?, prompt = ?, model = ?, pid = ?,
        end_time = ?, duration_ms = ?, assistant_text = ?,
        input_tokens = ?, cached_tokens = ?, output_tokens = ?, reasoning_tokens = ?,
        tools_json = ?, error = ?, parent_task_id = ?
      WHERE task_id = ?
    `));
  }
  private getStmtUpdateModel() {
    return (this.stmtUpdateModel ??= this.prep('UPDATE tasks SET model = ? WHERE task_id = ?'));
  }

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
      -- oturum sohbeti (ağaç ayrıntısı) ve reapStaleTasks'taki MAX(timestamp) tam tablo taraması yapmasın
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
      CREATE INDEX IF NOT EXISTS idx_events_task_ts ON events(task_id, timestamp);

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
      CREATE INDEX IF NOT EXISTS idx_tasks_start_time ON tasks(start_time DESC);
      CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);

      CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        mode TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);

      CREATE TABLE IF NOT EXISTS mission_contracts (
        id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL,
        contract_json TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_contracts_mission ON mission_contracts(mission_id);

      CREATE TABLE IF NOT EXISTS mission_tasks (
        id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        dependencies_json TEXT DEFAULT '[]',
        required_capabilities_json TEXT DEFAULT '[]',
        assigned_agent TEXT,
        assigned_model TEXT,
        workspace_path TEXT,
        output_artifacts_json TEXT DEFAULT '[]',
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mtasks_mission ON mission_tasks(mission_id);
      CREATE INDEX IF NOT EXISTS idx_mtasks_status ON mission_tasks(status);

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        model TEXT NOT NULL,
        pid INTEGER,
        lease_token TEXT NOT NULL,
        lease_expires_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        heartbeat_at INTEGER NOT NULL,
        completed_at INTEGER,
        exit_code INTEGER,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(task_id);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
    `);

    // Safe migrations: parent_task_id on tasks and events
    for (const table of ['tasks', 'events']) {
      const cols = this.prep(`PRAGMA table_info(${table})`).all() as any[];
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
      this.recordEventTx(event, pid);
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /** Toplu kayıt: tüm olaylar tek bir BEGIN IMMEDIATE ... COMMIT işlemi altında yazılır (kilitlenme ve fsync fırtınası önlenir). */
  recordEvents(events: TaskEvent[], pid?: number): void {
    const valid = (events || []).filter((e) => e && e.taskId);
    if (valid.length === 0) return;

    this.db.exec('BEGIN IMMEDIATE;');
    try {
      for (const event of valid) this.recordEventTx(event, pid);
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /** Tek olayın yazımı; çağıran tarafın açtığı işlem içinde çalışır. */
  private recordEventTx(event: TaskEvent, pid?: number): void {
    let parentTaskId: string | null = event.parentTaskId || event.data?.parentTaskId || null;
    if (!parentTaskId) {
      const parentRow = this.getStmtGetParent().get(event.taskId) as any;
      parentTaskId = parentRow?.parent_task_id || null;
    }
    const insertResult = this.getStmtInsertEvt().run(
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

    // Tekrarlanan olay ve model güncellemesi yoksa doğrudan dön (SELECT * yapma)
    if (!wasInserted && !event.data?.model) return;

    // 2. Task Summary Upsert
    const existing = this.getStmtGetTask().get(event.taskId) as any;

    if (existing && !wasInserted) {
      if (!existing.model && event.data?.model) this.getStmtUpdateModel().run(String(event.data.model), event.taskId);
      return;
    }

    if (!existing) {
      this.getStmtInsertTask().run(
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
      // tools_json yüzlerce KB olabilir: yalnızca tool.invoked'da dokunulur, o da parse etmeden sona eklenerek
      let toolsJson: string = existing.tools_json || '[]';
      let error = existing.error;
      const taskParentId = existing.parent_task_id || parentTaskId || null;

      switch (event.type) {
        case 'task.started':
          if (!isAlreadyTerminal) status = 'running';
          if (event.data.prompt) prompt = event.data.prompt;
          if (event.data.model) model = event.data.model;
          break;

        case 'tool.invoked':
          toolsJson = appendJsonArray(toolsJson, {
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

      this.getStmtUpdateTask().run(
        sessionId, status, prompt, model, taskPid,
        endTime, durationMs, assistantText,
        inputTokens, cachedTokens, outputTokens, reasoningTokens,
        toolsJson, error, taskParentId,
        event.taskId
      );
    }
  }

  getTask(taskId: string): TaskSummary | null {
    const row = this.prep('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as any;
    if (!row) return null;
    return this.mapTaskSummary(row);
  }

  /** Includes writes by this connection and other SQLite connections. */
  getTaskRevision(): string {
    const external = this.prep('PRAGMA data_version').get() as any;
    const local = this.prep('SELECT total_changes() AS n').get() as any;
    return `${external.data_version}:${local.n}`;
  }

  /** Reconcile missing terminal events without terminating any OS process. */
  reapStaleTasks(maxAgeMs = 300000): number {
    if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) throw new RangeError('Invalid task age');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const now = Date.now();
      const rows = this.prep(`
        SELECT t.task_id, t.session_id, t.agent, t.pid,
          COALESCE((SELECT MAX(timestamp) FROM events WHERE task_id = t.task_id), t.start_time) AS last_event
        FROM tasks t WHERE status = 'running'
      `).all() as any[];
      let count = 0;
      for (const row of rows) {
        // Antigravity (agy) oturumları masaüstü IDE üzerinden yürütülen etkileşimli kullanıcı
        // sohbetleridir; arka planda insan düşünme/bekleme süresi olabileceğinden zaman aşımıyla reaped edilmez.
        if (row.agent === 'agy' || row.agent === 'antigravity') {
          continue;
        }
        let exited = false;
        if (Number.isSafeInteger(row.pid) && row.pid > 0) {
          try { process.kill(row.pid, 0); }
          catch (err) { exited = (err as NodeJS.ErrnoException).code === 'ESRCH'; }
        }
        if (!exited && now - row.last_event <= maxAgeMs) continue;
        this.recordEventTx({
          id: `evt_reap_${row.task_id}_${now}`, taskId: row.task_id,
          sessionId: row.session_id, agent: row.agent, tier: 1,
          type: 'task.cancelled', timestamp: now,
          data: { reason: 'Oturum sonlandı / zaman aşımı' }
        });
        count++;
      }
      this.db.exec('COMMIT');
      return count;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  getRecentTasks(limit: number = 10): TaskSummary[] {
    const rows = this.prep('SELECT * FROM tasks ORDER BY start_time DESC LIMIT ?').all(limit) as any[];
    return rows.map((r) => this.mapTaskSummary(r));
  }

  getEvents(taskId: string): TaskEvent[] {
    const rows = this.prep('SELECT rowid AS seq, id, task_id, session_id, agent, tier, type, data, timestamp, parent_task_id FROM events WHERE task_id = ? ORDER BY rowid ASC').all(taskId) as any[];
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
    const rows = this.prep('SELECT * FROM tasks WHERE session_id = ? ORDER BY start_time ASC, rowid ASC').all(sessionId) as any[];
    return rows.map((r) => this.mapTaskSummary(r));
  }

  /** Oturum görevlerinin hafif dökümü (büyük tools_json/assistant_text sütunları okunmaz), kronolojik. */
  getSessionTaskIndex(sessionId: string): Array<{ taskId: string; startTime: number; durationMs: number; parentTaskId: string | null }> {
    const rows = this.prep('SELECT task_id, start_time, duration_ms, parent_task_id FROM tasks WHERE session_id = ? ORDER BY start_time ASC, rowid ASC').all(sessionId) as any[];
    return rows.map((r) => ({ taskId: r.task_id, startTime: r.start_time, durationMs: r.duration_ms || 0, parentTaskId: r.parent_task_id || null }));
  }

  /** Bir oturumun tüm görevlerinin olayları tek kronolojik akışta (rowid sırası). */
  getEventsForSession(sessionId: string): TaskEvent[] {
    const rows = this.prep('SELECT rowid AS seq, id, task_id, session_id, agent, tier, type, data, timestamp, parent_task_id FROM events WHERE session_id = ? ORDER BY rowid ASC').all(sessionId) as any[];
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

  /**
   * Görev/oturum olaylarının en yeni `limit` tanesi (kronolojik, seq'li); afterSeq verilirse yalnızca ondan sonrakiler.
   * Ayrıntı ekranı yüz binlerce olaylı oturumda tüm geçmişi parse etmesin, canlı güncellemede yalnızca yenileri okusun diye.
   */
  getEventsTail(by: 'task' | 'session', id: string, limit: number, afterSeq = 0): Array<TaskEvent & { seq: number }> {
    const col = by === 'task' ? 'task_id' : 'session_id';
    const rows = this.prep(`SELECT rowid AS seq, id, task_id, session_id, agent, tier, type, data, timestamp, parent_task_id FROM events WHERE ${col} = ? AND rowid > ? ORDER BY rowid DESC LIMIT ?`).all(id, afterSeq, limit) as any[];
    return rows.reverse().map((r) => ({
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

  countEvents(by: 'task' | 'session', id: string): number {
    const col = by === 'task' ? 'task_id' : 'session_id';
    return Number((this.prep(`SELECT COUNT(*) AS n FROM events WHERE ${col} = ?`).get(id) as any).n);
  }

  getMaxSeq(): number {
    try {
      const row = this.prep('SELECT COALESCE(MAX(rowid), 0) AS maxSeq FROM events').get() as any;
      return row ? Number(row.maxSeq) : 0;
    } catch {
      return 0;
    }
  }

  getEventsSinceSeq(lastSeq: number): Array<TaskEvent & { seq: number }> {
    const rows = this.prep('SELECT rowid AS seq, id, task_id, session_id, agent, tier, type, data, timestamp, parent_task_id FROM events WHERE rowid > ? ORDER BY rowid ASC').all(lastSeq) as any[];
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
    const rows = this.prep('SELECT rowid AS seq, id, task_id, session_id, agent, tier, type, data, timestamp, parent_task_id FROM events WHERE timestamp > ? ORDER BY rowid ASC').all(lastTimestamp) as any[];
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
    const row = this.prep('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as any;
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

  /** task_id -> son parse edilen tools_json: ağaç her revizyonda 80 görevi okur, değişmeyen araç listesi yeniden parse edilmesin. */
  private toolsCache = new Map<string, { raw: string; tools: any[] }>();

  private parseTools(taskId: string, raw: string): any[] {
    const hit = this.toolsCache.get(taskId);
    if (hit && hit.raw === raw) return hit.tools;
    let tools: any[] = [];
    try { tools = JSON.parse(raw); } catch { tools = []; }
    if (this.toolsCache.size > 2000) this.toolsCache.clear();
    this.toolsCache.set(taskId, { raw, tools });
    return tools;
  }

  private mapTaskSummary(row: any): TaskSummary {
    const tools = this.parseTools(row.task_id, row.tools_json || '[]');

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

  /** Runs a callback inside an immediate SQLite transaction. */
  withTransaction<T>(operation: (db: DatabaseSync) => T): T {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = operation(this.db);
      this.db.exec('COMMIT;');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  // --- Mission Control & Adaptive Orchestrator Domain Methods ---

  createMission(m: { id: string; title: string; status?: Mission['status']; mode: Mission['mode']; repoPath: string; createdAt?: number }): void {
    const stmt = this.prep(`
      INSERT INTO missions (id, title, status, mode, repo_path, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
    `);
    stmt.run(m.id, m.title, m.status || 'draft', m.mode, m.repoPath, m.createdAt || Date.now());
  }

  getMission(id: string): Mission | null {
    const row = this.prep('SELECT * FROM missions WHERE id = ?').get(id) as any;
    if (!row) return null;
    const contract = this.getMissionContract(id);
    const tasks = this.listMissionTasks(id);
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      mode: row.mode,
      repoPath: row.repo_path,
      contract: contract || undefined,
      tasks,
      createdAt: row.created_at,
      completedAt: row.completed_at || undefined
    };
  }

  updateMissionStatus(id: string, status: Mission['status'], completedAt?: number): void {
    this.prep('UPDATE missions SET status = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?').run(status, completedAt || null, id);
  }

  listMissions(limit = 50): Mission[] {
    const rows = this.prep('SELECT * FROM missions ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
    return rows.map((r) => this.getMission(r.id)!).filter(Boolean);
  }

  createMissionContract(c: MissionContract): void {
    const stmt = this.prep(`
      INSERT OR REPLACE INTO mission_contracts (id, mission_id, contract_json, version, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(c.id, c.missionId, JSON.stringify(c), 1, c.createdAt || Date.now());
  }

  getMissionContract(missionId: string): MissionContract | null {
    const row = this.prep('SELECT contract_json FROM mission_contracts WHERE mission_id = ? ORDER BY version DESC LIMIT 1').get(missionId) as any;
    if (!row) return null;
    try { return JSON.parse(row.contract_json); } catch { return null; }
  }

  createMissionTask(t: TaskNode): void {
    const stmt = this.prep(`
      INSERT INTO mission_tasks (
        id, mission_id, title, description, status,
        dependencies_json, required_capabilities_json,
        assigned_agent, assigned_model, workspace_path,
        output_artifacts_json, retry_count, max_retries,
        created_at, started_at, completed_at, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      t.id, t.missionId, t.title, t.description, t.status,
      JSON.stringify(t.dependencies || []), JSON.stringify(t.requiredCapabilities || []),
      t.assignedAgent || null, t.assignedModel || null, t.workspacePath || null,
      JSON.stringify(t.outputArtifacts || []), t.retryCount || 0, t.maxRetries ?? 3,
      t.createdAt || Date.now(), t.startedAt || null, t.completedAt || null, t.error || null
    );
  }

  getMissionTask(id: string): TaskNode | null {
    const row = this.prep('SELECT * FROM mission_tasks WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      missionId: row.mission_id,
      title: row.title,
      description: row.description,
      status: row.status,
      dependencies: JSON.parse(row.dependencies_json || '[]'),
      requiredCapabilities: JSON.parse(row.required_capabilities_json || '[]'),
      assignedAgent: row.assigned_agent || undefined,
      assignedModel: row.assigned_model || undefined,
      workspacePath: row.workspace_path || undefined,
      outputArtifacts: JSON.parse(row.output_artifacts_json || '[]'),
      retryCount: row.retry_count || 0,
      maxRetries: row.max_retries || 3,
      createdAt: row.created_at,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
      error: row.error || undefined
    };
  }

  updateMissionTaskStatus(id: string, status: TaskStatus, updates: Partial<TaskNode> = {}): void {
    const existing = this.getMissionTask(id);
    if (!existing) return;
    const stmt = this.prep(`
      UPDATE mission_tasks SET
        status = ?,
        assigned_agent = COALESCE(?, assigned_agent),
        assigned_model = COALESCE(?, assigned_model),
        workspace_path = COALESCE(?, workspace_path),
        started_at = COALESCE(?, started_at),
        completed_at = COALESCE(?, completed_at),
        error = COALESCE(?, error),
        retry_count = COALESCE(?, retry_count)
      WHERE id = ?
    `);
    stmt.run(
      status,
      updates.assignedAgent || null,
      updates.assignedModel || null,
      updates.workspacePath || null,
      updates.startedAt || (status === 'running' ? Date.now() : null),
      updates.completedAt || (['completed', 'failed'].includes(status) ? Date.now() : null),
      updates.error || null,
      updates.retryCount !== undefined ? updates.retryCount : null,
      id
    );
  }

  listMissionTasks(missionId: string): TaskNode[] {
    const rows = this.prep('SELECT id FROM mission_tasks WHERE mission_id = ? ORDER BY created_at ASC').all(missionId) as any[];
    return rows.map((r) => this.getMissionTask(r.id)!).filter(Boolean);
  }

  createAgentRun(r: AgentRun): void {
    const stmt = this.prep(`
      INSERT INTO agent_runs (
        id, task_id, mission_id, agent, model, pid,
        lease_token, lease_expires_at, status,
        started_at, heartbeat_at, completed_at, exit_code, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      r.id, r.taskId, r.missionId, r.agent, r.model, r.pid || null,
      r.leaseToken, r.leaseExpiresAt, r.status,
      r.startedAt || Date.now(), r.heartbeatAt || Date.now(),
      r.completedAt || null, r.exitCode ?? null, r.error || null
    );
  }

  heartbeatAgentRun(id: string, now = Date.now()): void {
    this.prep('UPDATE agent_runs SET heartbeat_at = ? WHERE id = ?').run(now, id);
  }

  completeAgentRun(id: string, status: AgentRun['status'], exitCode?: number, error?: string): void {
    this.prep(`
      UPDATE agent_runs SET status = ?, completed_at = ?, exit_code = ?, error = ?
      WHERE id = ?
    `).run(status, Date.now(), exitCode ?? null, error || null, id);
  }
}

export const globalSqlite = new SqliteStore();
