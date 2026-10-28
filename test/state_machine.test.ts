import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { StateMachine } from '../src/core/state_machine.ts';
import type { TaskNode } from '../src/core/mission_types.ts';

test('StateMachine applies atomic task transitions, leases, heartbeats and crash recovery', () => {
  const store = new SqliteStore(':memory:');
  try {
    store.createMission({ id: 'm1', title: 'mission', mode: 'planned', repoPath: process.cwd() });
    const task: TaskNode = {
      id: 't1', missionId: 'm1', title: 'task', description: '', status: 'pending', dependencies: [],
      requiredCapabilities: [], outputArtifacts: [], retryCount: 0, maxRetries: 1, createdAt: 1
    };
    store.createMissionTask(task);
    const machine = new StateMachine(store);

    assert.throws(() => machine.transition('t1', 'completed'), /Geçersiz/);
    const run = machine.startRun({ taskId: 't1', agent: 'codex', model: 'test', now: 1_000, leaseDurationMs: 100 });
    assert.equal(store.getMissionTask('t1')?.status, 'running');
    assert.ok(run.leaseToken.length >= 32);
    assert.equal(machine.heartbeat(run.id, 'wrong-token', 100, 1_050), false);
    assert.equal(machine.heartbeat(run.id, run.leaseToken, 100, 1_050), true);
    assert.deepEqual(machine.recoverExpired(500, 1_549), []);
    assert.deepEqual(machine.recoverExpired(500, 1_550), ['t1']);
    assert.equal(store.getMissionTask('t1')?.status, 'interrupted');
    assert.deepEqual(machine.recoverExpired(500, 2_000), []);
    const retry = machine.startRun({ taskId: 't1', agent: 'codex', now: 2_001 });
    machine.transition('t1', 'completed', 2_010);
    assert.equal(store.getMissionTask('t1')?.status, 'completed');
    assert.notEqual(run.leaseToken, retry.leaseToken);
  } finally {
    store.close();
  }
});
