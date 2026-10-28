import test from 'node:test';
import assert from 'node:assert';
import { buildMissionContract } from '../src/core/mission_contract.ts';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { runDirect, selectAgent, requiredCapabilities, buildDirectPrompt, QuotaTracker } from '../src/runtime/direct_runner.ts';
import type { DirectRunnerLike } from '../src/runtime/direct_runner.ts';
import type { AgentCapability } from '../src/core/mission_types.ts';
import type { TaskSummary } from '../src/core/types.ts';

const FULL: AgentCapability[] = ['code.read', 'code.write', 'terminal.execute'];

function fakeRunner(agents: Record<string, { available?: boolean; caps: AgentCapability[]; result?: Partial<TaskSummary> }>) {
  const started: any[] = [];
  const runner: DirectRunnerLike = {
    getAdapter(name) {
      const a = agents[name];
      if (!a) return null;
      return {
        name,
        probe: async () => ({ agent: name, displayName: name, isAvailable: a.available !== false, capabilities: a.caps, supportedControls: {} as any, probedAt: 0 })
      };
    },
    startTask(opts) {
      started.push(opts);
      const r = agents[opts.agent].result ?? {};
      const summary = { taskId: 't1', agent: opts.agent, status: 'completed', error: null, ...r } as TaskSummary;
      return { taskId: 't1', promise: Promise.resolve(summary) };
    }
  };
  return { runner, started };
}

test('Direct Runner: yetenek ve kota ile ajan seçimi', async () => {
  const c = buildMissionContract({ objective: 'iş', repoPath: '/r' });
  assert.deepStrictEqual(requiredCapabilities(c), ['code.write', 'terminal.execute']);
  const ro = buildMissionContract({ objective: 'oku', repoPath: '/r', allowedCapabilities: ['code.read'] });
  assert.deepStrictEqual(requiredCapabilities(ro), ['code.read']);

  const { runner } = fakeRunner({
    claude: { caps: FULL },
    codex: { caps: FULL },
    opencode: { caps: ['code.read'] },
    agy: { caps: FULL, available: false }
  });
  const quota = new QuotaTracker();

  assert.strictEqual((await selectAgent(c, runner, quota, ['opencode', 'agy', 'claude', 'codex'])).agent, 'claude');

  quota.markExhausted('claude', 60_000);
  const choice = await selectAgent(c, runner, quota, ['opencode', 'agy', 'claude', 'codex']);
  assert.strictEqual(choice.agent, 'codex');
  const reasons = Object.fromEntries(choice.skipped.map((s) => [s.agent, s.reason]));
  assert.match(reasons.opencode, /eksik yetenek/);
  assert.match(reasons.agy, /kurulu değil/);
  assert.match(reasons.claude, /kota/);

  assert.strictEqual((await selectAgent(c, runner, quota, ['claude', 'codex'], 'codex')).agent, 'codex', 'tercih edilen öne alınır');
});

test('Direct Runner: kota bekleme süresi dolunca ajan geri gelir', () => {
  let t = 1000;
  const q = new QuotaTracker(() => t);
  q.markExhausted('claude', 500);
  assert.strictEqual(q.isAvailable('claude'), false);
  assert.strictEqual(q.remainingMs('claude'), 500);
  t = 1600;
  assert.strictEqual(q.isAvailable('claude'), true);
});

test('Direct Runner: başarılı çalıştırma SQLite kaydı bırakır', async () => {
  const store = new SqliteStore(':memory:');
  const c = buildMissionContract({ objective: 'Hedef\nikinci satır', repoPath: '/r', includePaths: ['src'], testCommands: ['npm test'], timeoutMinutes: 2 });
  const { runner, started } = fakeRunner({ claude: { caps: FULL } });

  const res = await runDirect(c, { runner, store, candidates: ['claude'] }, new QuotaTracker());
  assert.strictEqual(res.status, 'completed');
  assert.strictEqual(res.agent, 'claude');
  assert.strictEqual(started[0].timeoutSeconds, 120);
  assert.strictEqual(started[0].dangerouslySkipPermissions, true);
  assert.match(started[0].prompt, /Yalnızca şu yollarda çalış: src/);
  assert.match(started[0].prompt, /npm test/);

  const m = store.getMission(c.missionId)!;
  assert.strictEqual(m.status, 'completed');
  assert.strictEqual(m.tasks.length, 1);
  assert.strictEqual(m.tasks[0].status, 'completed');
  assert.strictEqual(m.tasks[0].assignedAgent, 'claude');
  store.close();
});

test('Direct Runner: kota hatası ajanı bekletir, sözleşme reddi ve onay politikası', async () => {
  const quota = new QuotaTracker();
  const c = buildMissionContract({ objective: 'iş', repoPath: '/r' });
  const { runner } = fakeRunner({ claude: { caps: FULL, result: { status: 'failed', error: 'usage limit reached, try again in 10 minutes' } } });

  const res = await runDirect(c, { runner, candidates: ['claude'] }, quota);
  assert.strictEqual(res.status, 'failed');
  assert.strictEqual(res.errorKind, 'rate_limit');
  assert.strictEqual(quota.isAvailable('claude'), false);

  const again = await runDirect(c, { runner, candidates: ['claude'] }, quota);
  assert.strictEqual(again.status, 'rejected');
  assert.match(again.errors![0], /uygun ajan yok/);

  const planned = buildMissionContract({ objective: 'x', repoPath: '/r', mode: 'planned' });
  assert.match((await runDirect(planned, { runner }, quota)).errors![0], /yalnızca direct/);

  const invalid = buildMissionContract({ objective: '', repoPath: '/r' });
  assert.strictEqual((await runDirect(invalid, { runner }, quota)).status, 'rejected');

  const guarded = buildMissionContract({ objective: 'iş', repoPath: '/r', requireApprovalForWrites: true });
  const g = fakeRunner({ codex: { caps: FULL } });
  await runDirect(guarded, { runner: g.runner, candidates: ['codex'] }, new QuotaTracker());
  assert.strictEqual(g.started[0].dangerouslySkipPermissions, false, 'onay gerektiren politika izinleri atlamaz');

  assert.strictEqual(buildDirectPrompt(buildMissionContract({ objective: 'sade', repoPath: '/r', excludePaths: [] })), 'sade');
});
