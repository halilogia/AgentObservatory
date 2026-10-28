import test from 'node:test';
import assert from 'node:assert';
import { buildMissionContract, validateMissionContract, createValidatedContract } from '../src/core/mission_contract.ts';
import { SqliteStore } from '../src/core/sqlite_store.ts';

test('Mission Contract: modlara göre varsayılanlar', () => {
  const d = buildMissionContract({ objective: 'README düzelt', repoPath: '/repo' });
  assert.strictEqual(d.mode, 'direct');
  assert.strictEqual(d.title, 'README düzelt');
  assert.strictEqual(d.constraints.maxAttempts, 1);
  assert.strictEqual(d.policy.requireApprovalForWrites, false);
  assert.deepStrictEqual(d.constraints.allowedCapabilities, ['code.read', 'code.write', 'terminal.execute']);

  const v = buildMissionContract({ objective: 'x', repoPath: '/r', mode: 'verified', testCommands: ['npm test'] });
  assert.strictEqual(v.constraints.maxAttempts, 3);
  assert.strictEqual(v.acceptance.requireRedTeamAudit, true);
  assert.strictEqual(v.policy.requireApprovalForTerminal, true);
  assert.ok(v.constraints.allowedCapabilities.includes('review.readonly'));
  assert.ok(v.missionId.startsWith('mission_'));
});

test('Mission Contract: doğrulama hataları', () => {
  assert.strictEqual(validateMissionContract(buildMissionContract({ objective: 'iş', repoPath: '/r' })).ok, true);

  const bad = buildMissionContract({ objective: '  ', repoPath: '', mode: 'verified' });
  const r = validateMissionContract(bad);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('objective')));
  assert.ok(r.errors.some((e) => e.includes('repoPath')));
  assert.ok(r.errors.some((e) => e.includes('testCommand')), 'verified modda test komutu şart');

  const esc = buildMissionContract({ objective: 'a', repoPath: '/r', includePaths: ['../dis', '/abs'], excludePaths: ['src/**'] });
  assert.ok(validateMissionContract(esc).errors.filter((e) => e.includes('göreli')).length === 2);

  const dup = buildMissionContract({ objective: 'a', repoPath: '/r', includePaths: ['src'], excludePaths: ['src'] });
  assert.ok(validateMissionContract(dup).errors.some((e) => e.includes('hem include hem exclude')));

  const multi = buildMissionContract({ objective: 'a', repoPath: '/r', mode: 'direct', maxAttempts: 3 });
  assert.ok(validateMissionContract(multi).errors.some((e) => e.includes('direct modda')));

  const noTerm = buildMissionContract({ objective: 'a', repoPath: '/r', testCommands: ['npm test'], allowedCapabilities: ['code.write'] });
  assert.ok(validateMissionContract(noTerm).errors.some((e) => e.includes('terminal.execute')));

  const unknown = buildMissionContract({ objective: 'a', repoPath: '/r', allowedCapabilities: ['code.write', 'teleport' as any] });
  assert.ok(validateMissionContract(unknown).errors.some((e) => e.includes('bilinmeyen yetenek')));

  assert.throws(() => createValidatedContract({ objective: '', repoPath: '/r' }), /Geçersiz MissionContract/);
});

test('Mission Contract: SQLite ile gidiş-dönüş', () => {
  const store = new SqliteStore(':memory:');
  const c = createValidatedContract({ objective: 'kalıcılık', repoPath: '/r', mode: 'planned' });
  store.createMission({ id: c.missionId, title: c.title, mode: c.mode, repoPath: c.workspace.repoPath });
  store.createMissionContract(c);
  assert.deepStrictEqual(store.getMissionContract(c.missionId), c);
  store.close();
});
