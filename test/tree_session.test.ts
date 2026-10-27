import assert from 'node:assert/strict';
import { renderTree, scrollFromBarRow } from '../src/ui/tree.ts';
import type { TaskSummary } from '../src/core/types.ts';

const now = 1_000_000_000;
const mk = (id: string, sid: string | null, start: number, extra: Partial<TaskSummary> = {}): TaskSummary => ({
  taskId: id, sessionId: sid, agent: 'claude', status: 'completed', prompt: 'p' + id, model: 'sonnet',
  startTime: start, endTime: start + 1000, durationMs: 1000, toolsUsed: [], assistantText: 'son ' + id,
  usage: { inputTokens: 1000, cachedTokens: 0, outputTokens: 500, reasoningTokens: 0, totalTokens: 1500 }, error: null, ...extra
});
const tasks = [
  mk('t1', 'c461032a-1', now - 5000), mk('t2', 'c461032a-1', now - 4000), mk('t3', 'c461032a-1', now - 3000),
  mk('sub1', 'c461032a-1', now - 3500, { parentTaskId: 't2', agent: 'codex', model: 'codex' }),
  mk('solo', null, now - 2000)
];
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const base = { onlyRunning: false, cols: 140, rows: 60, now };

const c = renderTree(tasks, base);
assert.deepEqual(c.order, ['solo', 'session:c461032a-1'].sort((a, b) => c.order.indexOf(a) - c.order.indexOf(b)));
assert.equal(c.order.length, 2);
assert.match(strip(c.text), /c461032a · 3 mesaj · sürdü 3s · 4\.5k|c461032a · 3 mesaj · sürdü 3s · 5k tok/);

const e = renderTree(tasks, { ...base, expanded: new Set(['c461032a-1']) });
const txt = strip(e.text);
assert.match(txt, /Turn 1/); assert.match(txt, /Turn 3/); assert.match(txt, /\[ALT AJAN\]/);
assert.equal(e.order.length, 6);
console.log('tree_session OK');

// kaydırma çubuğu sürükleme: üst uç = en eski satırlar (en büyük kaydırma), alt uç = en son (0), sığan içerikte null
{
  const g = { top: 3, room: 20, total: 120 };
  assert.strictEqual(scrollFromBarRow(4, g), 100, 'çubuğun en üstü en eski kısmı göstermeli');
  assert.strictEqual(scrollFromBarRow(23, g), 0, 'çubuğun en altı en son kısmı göstermeli');
  assert.strictEqual(scrollFromBarRow(10, { top: 3, room: 20, total: 20 }), null);
}
