import test from 'node:test';
import assert from 'node:assert';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import type { MissionContract, TaskNode, AgentRun } from '../src/core/mission_types.ts';

test('Mission Domain: In-memory SQLite persistence and lifecycle', () => {
  const store = new SqliteStore(':memory:');

  // 1. Mission Creation & Listing
  const missionId = 'mission_test_001';
  store.createMission({
    id: missionId,
    title: 'Auth Modülü Refactor & Güvenlik Denetimi',
    mode: 'verified',
    repoPath: '/workspace/project',
    status: 'draft'
  });

  const m1 = store.getMission(missionId);
  assert.ok(m1, 'Mission should exist');
  assert.strictEqual(m1.title, 'Auth Modülü Refactor & Güvenlik Denetimi');
  assert.strictEqual(m1.mode, 'verified');
  assert.strictEqual(m1.status, 'draft');
  assert.strictEqual(m1.tasks.length, 0);

  // 2. Mission Contract Creation
  const contract: MissionContract = {
    id: 'contract_001',
    missionId: missionId,
    title: 'Auth Refactor Contract',
    objective: 'Kimlik doğrulama zafiyetlerini kapat ve birim testleri ekle',
    mode: 'verified',
    workspace: {
      repoPath: '/workspace/project',
      branch: 'feature/auth-hardening'
    },
    scope: {
      includePaths: ['src/auth/**', 'test/auth/**'],
      excludePaths: ['.env', 'secrets/**']
    },
    acceptance: {
      testCommands: ['npm test'],
      requireCleanGit: true,
      requireRedTeamAudit: true
    },
    constraints: {
      maxAttempts: 3,
      timeoutMinutes: 30,
      allowedCapabilities: ['code.read', 'code.write', 'terminal.execute', 'review.readonly']
    },
    policy: {
      requireApprovalForTerminal: true,
      requireApprovalForWrites: true
    },
    createdAt: Date.now()
  };

  store.createMissionContract(contract);
  const fetchedContract = store.getMissionContract(missionId);
  assert.ok(fetchedContract, 'Contract should be saved');
  assert.strictEqual(fetchedContract.objective, contract.objective);
  assert.deepStrictEqual(fetchedContract.acceptance.testCommands, ['npm test']);

  // 3. Task DAG Creation
  const t1: TaskNode = {
    id: 'task_001',
    missionId,
    title: 'Auth Kodunu Refactor Et',
    description: 'JWT doğrulama zafiyetini gider',
    status: 'pending',
    dependencies: [],
    requiredCapabilities: ['code.read', 'code.write'],
    assignedAgent: 'claude',
    assignedModel: 'claude-sonnet-5-5',
    outputArtifacts: ['src/auth/jwt.ts'],
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now()
  };

  const t2: TaskNode = {
    id: 'task_002',
    missionId,
    title: 'Birim Testleri Çalıştır',
    description: 'JWT test senaryolarını doğrula',
    status: 'pending',
    dependencies: ['task_001'],
    requiredCapabilities: ['terminal.execute'],
    assignedAgent: 'antigravity',
    outputArtifacts: [],
    retryCount: 0,
    maxRetries: 2,
    createdAt: Date.now() + 10
  };

  store.createMissionTask(t1);
  store.createMissionTask(t2);

  const tasks = store.listMissionTasks(missionId);
  assert.strictEqual(tasks.length, 2, 'Mission should have 2 tasks');
  assert.strictEqual(tasks[0].id, 'task_001');
  assert.strictEqual(tasks[1].dependencies[0], 'task_001');

  // 4. Task State Progression
  store.updateMissionTaskStatus('task_001', 'running', { startedAt: Date.now() });
  let updatedT1 = store.getMissionTask('task_001');
  assert.strictEqual(updatedT1?.status, 'running');
  assert.ok(updatedT1?.startedAt);

  store.updateMissionTaskStatus('task_001', 'completed');
  updatedT1 = store.getMissionTask('task_001');
  assert.strictEqual(updatedT1?.status, 'completed');

  // 5. Agent Run Lease & Heartbeat
  const run: AgentRun = {
    id: 'run_001',
    taskId: 'task_001',
    missionId,
    agent: 'claude',
    model: 'claude-sonnet-5-5',
    pid: 1234,
    leaseToken: 'lease_abc123',
    leaseExpiresAt: Date.now() + 60000,
    status: 'active',
    startedAt: Date.now(),
    heartbeatAt: Date.now()
  };

  store.createAgentRun(run);
  store.heartbeatAgentRun('run_001', Date.now() + 1000);
  store.completeAgentRun('run_001', 'completed', 0);

  // 6. Mission Complete Lifecycle
  store.updateMissionStatus(missionId, 'completed', Date.now());
  const finalMission = store.getMission(missionId);
  assert.strictEqual(finalMission?.status, 'completed');
  assert.ok(finalMission?.contract);
  assert.strictEqual(finalMission?.tasks.length, 2);

  console.log('✔ Mission Domain & SQLite persistence tests passed successfully!');
});
