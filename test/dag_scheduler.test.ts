import test from 'node:test';
import assert from 'node:assert/strict';
import { DagScheduler } from '../src/core/dag_scheduler.ts';

test('DagScheduler produces parallel topological waves and rejects invalid graphs', () => {
  const scheduler = new DagScheduler();
  const tasks = [
    { id: 'a', dependencies: [] }, { id: 'b', dependencies: [] },
    { id: 'c', dependencies: ['a'] }, { id: 'd', dependencies: ['a', 'b'] },
    { id: 'e', dependencies: ['c', 'd'] }
  ];
  assert.deepEqual(scheduler.plan(tasks), {
    order: ['a', 'b', 'c', 'd', 'e'],
    parallelWaves: [['a', 'b'], ['c', 'd'], ['e']]
  });
  assert.throws(() => scheduler.plan([{ id: 'a', dependencies: ['missing'] }]), /bulunmayan/);
  assert.throws(() => scheduler.plan([
    { id: 'a', dependencies: ['b'] }, { id: 'b', dependencies: ['c'] }, { id: 'c', dependencies: ['a'] }
  ]), /Döngüsel/);
  assert.throws(() => scheduler.plan([{ id: 'a', dependencies: [] }, { id: 'a', dependencies: [] }]), /Yinelenen/);
});
