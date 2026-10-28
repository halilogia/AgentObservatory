import test from 'node:test';
import assert from 'node:assert';
import { percentile, computeMetrics, rankAgents } from '../src/telemetry/metrics.ts';

const usage = (total: number) => ({ inputTokens: total / 2, cachedTokens: 0, outputTokens: total / 2, reasoningTokens: 0, totalTokens: total });
const task = (agent: string, status: string, durationMs: number, tokens = 100) => ({ agent, status, durationMs, usage: usage(tokens) }) as any;

test('Metrics: percentile (nearest-rank)', () => {
  assert.strictEqual(percentile([], 50), null);
  assert.strictEqual(percentile([7], 95), 7);
  const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.strictEqual(percentile(v, 50), 50);
  assert.strictEqual(percentile(v, 95), 100);
  assert.strictEqual(percentile([100, 10, 50], 50), 50, 'sırasız girdi');
});

test('Metrics: ajan başına süre, başarı ve token', () => {
  const r = computeMetrics([
    task('claude', 'completed', 1000, 200),
    task('claude', 'completed', 3000, 400),
    task('claude', 'failed', 2000, 100),
    task('claude', 'cancelled', 50, 10),
    task('codex', 'completed', 500, 300),
    task('codex', 'running', 0, 0)
  ], 123);
  assert.strictEqual(r.generatedAt, 123);
  assert.strictEqual(r.byAgent[0].agent, 'claude', 'çok görevli ajan önde');
  const c = r.byAgent[0];
  assert.strictEqual(c.total, 4);
  assert.strictEqual(c.completed, 2);
  assert.strictEqual(c.failed, 1);
  assert.strictEqual(c.cancelled, 1);
  assert.ok(Math.abs(c.successRate! - 2 / 3) < 1e-9);
  assert.strictEqual(c.p50Ms, 2000);
  assert.strictEqual(c.p95Ms, 3000);
  assert.strictEqual(c.meanMs, 2000);
  assert.strictEqual(c.usage.totalTokens, 710);
  assert.strictEqual(c.avgTokensPerTask, Math.round(710 / 3));

  const x = r.byAgent[1];
  assert.strictEqual(x.successRate, 1);
  assert.strictEqual(r.overall.total, 6);
  assert.strictEqual(computeMetrics([]).overall.successRate, null);
});

test('Metrics: yönlendirme skoru başarı ve hızı birleştirir', () => {
  const tasks = [
    ...Array.from({ length: 5 }, () => task('fast', 'completed', 1000)),
    ...Array.from({ length: 5 }, (_, i) => task('flaky', i < 2 ? 'completed' : 'failed', 1000)),
    task('rookie', 'completed', 500)
  ];
  const hints = rankAgents(computeMetrics(tasks), ['fast', 'flaky', 'rookie', 'ghost']);
  assert.strictEqual(hints[0].agent, 'fast');
  assert.ok(hints.find((h) => h.agent === 'flaky')!.score < hints[0].score);
  assert.match(hints.find((h) => h.agent === 'rookie')!.reason, /yetersiz örnek/);
  assert.strictEqual(hints.find((h) => h.agent === 'ghost')!.reason, 'veri yok');
});
