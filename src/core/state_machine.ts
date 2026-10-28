import crypto from 'node:crypto';
import { globalSqlite, SqliteStore } from './sqlite_store.ts';
import type { AgentRun, TaskStatus } from './mission_types.ts';

const statuses = (...values: TaskStatus[]): ReadonlySet<TaskStatus> => new Set(values);
const TRANSITIONS: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
  pending: statuses('ready', 'running', 'blocked'),
  ready: statuses('running', 'blocked'),
  running: statuses('verifying', 'waiting_approval', 'completed', 'failed', 'interrupted'),
  verifying: statuses('completed', 'failed', 'waiting_approval', 'interrupted'),
  waiting_approval: statuses('ready', 'running', 'failed'),
  blocked: statuses('pending', 'ready'),
  interrupted: statuses('pending', 'ready', 'running'),
  completed: statuses(),
  failed: statuses('pending', 'ready'),
};

export interface StartTaskRun {
  taskId: string;
  agent: string;
  model?: string;
  pid?: number;
  leaseDurationMs?: number;
  now?: number;
}

export class StateMachine {
  private readonly store: SqliteStore;

  constructor(store: SqliteStore = globalSqlite) {
    this.store = store;
  }

  transition(taskId: string, next: TaskStatus, now = Date.now()): void {
    this.store.withTransaction((db) => {
      const row = db.prepare('SELECT status FROM mission_tasks WHERE id = ?').get(taskId) as { status: TaskStatus } | undefined;
      if (!row) throw new Error(`Görev bulunamadı: ${taskId}`);
      if (row.status === next) return;
      if (!TRANSITIONS[row.status]?.has(next)) {
        throw new Error(`Geçersiz görev durumu geçişi: ${row.status} -> ${next}`);
      }
      db.prepare(`UPDATE mission_tasks SET status = ?, started_at = CASE WHEN ? = 'running' THEN COALESCE(started_at, ?) ELSE started_at END,
        completed_at = CASE WHEN ? IN ('completed', 'failed', 'interrupted') THEN ? ELSE completed_at END WHERE id = ?`)
        .run(next, next, now, next, now, taskId);
      if (['completed', 'failed', 'interrupted'].includes(next)) {
        const runStatus = next === 'completed' ? 'completed' : next === 'interrupted' ? 'expired' : 'failed';
        db.prepare("UPDATE agent_runs SET status = ?, completed_at = ? WHERE task_id = ? AND status = 'active'")
          .run(runStatus, now, taskId);
      }
    });
  }

  startRun(input: StartTaskRun): AgentRun {
    const now = input.now ?? Date.now();
    const runId = crypto.randomUUID();
    const leaseToken = crypto.randomBytes(32).toString('hex');
    const leaseDurationMs = input.leaseDurationMs ?? 30_000;
    return this.store.withTransaction((db) => {
      const task = db.prepare('SELECT mission_id, status FROM mission_tasks WHERE id = ?').get(input.taskId) as
        { mission_id: string; status: TaskStatus } | undefined;
      if (!task) throw new Error(`Görev bulunamadı: ${input.taskId}`);
      if (!['pending', 'ready', 'interrupted'].includes(task.status)) {
        throw new Error(`Görev çalıştırılamaz (${task.status}): ${input.taskId}`);
      }
      db.prepare("UPDATE mission_tasks SET status = 'running', started_at = ?, completed_at = NULL, error = NULL WHERE id = ?")
        .run(now, input.taskId);
      db.prepare(`INSERT INTO agent_runs (id, task_id, mission_id, agent, model, pid, lease_token, lease_expires_at,
        status, started_at, heartbeat_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`)
        .run(runId, input.taskId, task.mission_id, input.agent, input.model ?? '', input.pid ?? null,
          leaseToken, now + leaseDurationMs, now, now);
      return {
        id: runId, taskId: input.taskId, missionId: task.mission_id, agent: input.agent,
        model: input.model ?? '', pid: input.pid, leaseToken, leaseExpiresAt: now + leaseDurationMs,
        status: 'active', startedAt: now, heartbeatAt: now
      };
    });
  }

  heartbeat(runId: string, leaseToken: string, leaseDurationMs = 30_000, now = Date.now()): boolean {
    return this.store.withTransaction((db) => {
      const result = db.prepare(`UPDATE agent_runs SET heartbeat_at = ?, lease_expires_at = ?
        WHERE id = ? AND lease_token = ? AND status = 'active'`).run(now, now + leaseDurationMs, runId, leaseToken);
      return Number(result.changes) === 1;
    });
  }

  recoverExpired(heartbeatTimeoutMs: number, now = Date.now()): string[] {
    if (!Number.isFinite(heartbeatTimeoutMs) || heartbeatTimeoutMs < 0) {
      throw new Error('heartbeatTimeoutMs negatif olmayan bir sayı olmalı.');
    }
    return this.store.withTransaction((db) => {
      const stale = db.prepare(`SELECT id, task_id FROM agent_runs WHERE status = 'active' AND heartbeat_at <= ?`)
        .all(now - heartbeatTimeoutMs) as Array<{ id: string; task_id: string }>;
      const updateRun = db.prepare("UPDATE agent_runs SET status = 'expired', completed_at = ?, error = 'heartbeat timeout' WHERE id = ? AND status = 'active'");
      const updateTask = db.prepare("UPDATE mission_tasks SET status = 'interrupted', completed_at = ?, error = 'Agent heartbeat expired' WHERE id = ? AND status = 'running'");
      const interrupted: string[] = [];
      for (const run of stale) {
        updateRun.run(now, run.id);
        const result = updateTask.run(now, run.task_id);
        if (Number(result.changes) === 1) interrupted.push(run.task_id);
      }
      return interrupted;
    });
  }
}

export const globalStateMachine = new StateMachine();
