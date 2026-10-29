// Performans için eklenen kısa yolların davranışı eski (tam) yolla aynı kalmalı.
import assert from 'node:assert/strict';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { TranscriptView, renderDetail } from '../src/ui/tree.ts';
import type { TaskEvent, TaskSummary } from '../src/core/types.ts';

const ev = (i: number, type: TaskEvent['type'], data: Record<string, any>, taskId = 't1'): TaskEvent =>
  ({ id: `e${taskId}${i}`, taskId, sessionId: 's1', agent: 'claude', tier: 1, type, data, timestamp: 1000 + i });

const events: TaskEvent[] = [
  ev(0, 'task.started', { prompt: 'ilk istem\nikinci satır' }),
  ev(1, 'message.delta', { text: 'Merhaba, ' }),
  ev(2, 'message.delta', { text: 'dünya.\nUzun bir satır: ' + 'x'.repeat(300) }),
  ev(3, 'tool.invoked', { id: 'a', name: 'Read', input: { file_path: 'src/a.ts' } }),
  ev(4, 'tool.completed', { toolUseId: 'a', output: 'satır1\nsatır2' }),
  ev(5, 'message.delta', { text: 'bitti  \n\n' }),
  ev(6, 'task.completed', {})
];

// 1. Artımlı görünüm: olaylar parça parça eklense de tek seferde çizimle aynı satırlar
{
  const full = new TranscriptView('sonnet');
  full.push(events.map((e) => ({ ...e, data: { ...e.data } })));
  const inc = new TranscriptView('sonnet');
  inc.lines(80); // genişlik önce sabitlenir: sonraki eklemeler artımlı sarılır
  for (const e of events) inc.push([{ ...e, data: { ...e.data } }]);
  assert.deepEqual(inc.lines(80), full.lines(80));
  // genişlik değişince baştan sarılır
  const narrow = new TranscriptView('sonnet');
  narrow.push(events.map((e) => ({ ...e, data: { ...e.data } })));
  assert.deepEqual(inc.lines(50), narrow.lines(50));
  const lines = full.lines(80);
  assert.ok(lines.length > 3);
  assert.ok(lines[lines.length - 1].trim().length > 0, 'sonda boş satır kalmamalı');
  // renderDetail hazır görünümle ve olay listesiyle aynı kareyi üretir
  const t = { taskId: 't1', agent: 'claude', model: 'sonnet', status: 'completed', startTime: 1000, durationMs: 6, toolsUsed: [] } as unknown as TaskSummary;
  const opts = { cols: 82, rows: 30, now: 5000 };
  assert.equal(renderDetail(t, [], { ...opts, view: full }), renderDetail(t, events.map((e) => ({ ...e, data: { ...e.data } })), opts));
}

// 2. tools_json sona ekleme + olay kuyruğu sorguları
{
  const s = new SqliteStore(':memory:');
  s.recordEvents(events);
  for (let i = 0; i < 5; i++) s.recordEvent(ev(10 + i, 'tool.invoked', { id: 'b' + i, name: 'Bash', input: { command: 'echo ' + i } }));
  s.recordEvent(ev(20, 'message.delta', { text: 'araç listesi bozulmamalı' }));
  const task = s.getTask('t1')!;
  assert.deepEqual(task.toolsUsed.map((x: any) => x.name), ['Read', 'Bash', 'Bash', 'Bash', 'Bash', 'Bash']);
  assert.equal(task.toolsUsed[5].input.command, 'echo 4');
  // ikinci okuma önbellekten gelir ama içerik aynıdır
  assert.deepEqual(s.getTask('t1')!.toolsUsed, task.toolsUsed);

  const all = s.getEventsTail('session', 's1', 100);
  assert.equal(all.length, events.length + 6);
  assert.deepEqual(all.map((e) => e.id), s.getEventsForSession('s1').map((e) => e.id), 'kronolojik sıra korunur');
  const tail = s.getEventsTail('task', 't1', 3);
  assert.deepEqual(tail.map((e) => e.id), all.slice(-3).map((e) => e.id));
  assert.equal(s.getEventsTail('session', 's1', 100, all[all.length - 2].seq).length, 1, 'yalnızca seq sonrası');
  assert.equal(s.countEvents('session', 's1'), all.length);
  assert.deepEqual(s.getSessionTaskIndex('s1').map((x) => x.taskId), ['t1']);
  s.close();
}

console.log('✔ perf_paths: artımlı sohbet görünümü, tools_json ekleme, olay kuyruğu sorguları');
