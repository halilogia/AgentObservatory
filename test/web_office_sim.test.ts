// Session projection, concurrent lifecycle, renderer and HUD regression tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { EventStore } from '../src/core/event_store.ts';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { CodexAdapter } from '../src/adapters/codex_adapter.ts';
import { createEvent } from '../src/core/types.ts';
const webDir = path.join(import.meta.dirname, '..', 'web');
const src = fs.readFileSync(path.join(webDir, 'office_sim.js'), 'utf8');
const ctx: any = {}; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const O = ctx.ObsOffice;
let checks = 0;
function check(name: string, fn: () => void) { fn(); checks++; console.log('PASS office: ' + name); }
const ev = (taskId: string, type = 'task.started', extra: any = {}) => ({ taskId, agent: 'codex', type, ...extra });
const run = (s: any, sec: number) => { for (let i = 0; i < sec * 20; i++) O.step(s, .05); };
const actor = (s: any, id: string) => s.actors[s.registry.tasks.get(id).actorId];
check('two Codex and two Claude sessions have independent desks and lifecycles', () => {
  const s = O.createState(); assert.equal(s.order.length, 0);
  for (const agent of ['codex', 'claude']) for (const n of [1, 2]) O.feed(s, ev(agent + n, 'task.started', { agent, sessionId: agent + n }));
  assert.equal(s.order.length, 4);
  assert.equal(new Set(s.order.map((id: string) => s.actors[id].idx)).size, 4);
  O.feed(s, ev('codex1', 'task.completed')); O.feed(s, ev('claude1', 'task.failed', { agent: 'claude' }));
  assert.equal(actor(s, 'codex2').mode, 'thinking'); assert.equal(actor(s, 'claude2').mode, 'thinking');
  assert.equal(actor(s, 'codex1').doneCount, 1); assert.equal(actor(s, 'claude1').failCount, 1);
  run(s, 8); assert.equal(actor(s, 'codex1').mode, 'idle');
});
check('sequential and concurrent tasks reuse a session without stopping other tasks', () => {
  const s = O.createState(), a = O.feed(s, ev('one', 'task.started', { sessionId: 'shared' }));
  O.feed(s, ev('one', 'task.completed'));
  assert.equal(O.feed(s, ev('two', 'task.started', { sessionId: 'shared' })), a);
  O.feed(s, ev('three', 'task.started', { sessionId: 'shared' }));
  O.feed(s, ev('three', 'tool.invoked', { data: { id: 'edit', name: 'Edit' } })); O.feed(s, ev('two', 'task.failed'));
  assert.equal(a.mode, 'typing'); assert.equal(s.order.length, 1); assert.notEqual(a.badge?.kind, 'deny');
});
check('nested and late parent links retain distinct actors and nearby stations', () => {
  const s = O.createState(), parent = O.feed(s, ev('root', 'task.started', { sessionId: 's' }));
  const child = O.feed(s, ev('child', 'task.started', { sessionId: 's', parentTaskId: 'root' }));
  const grandchild = O.feed(s, ev('grandchild', 'task.started', { sessionId: 's', parentTaskId: 'child' }));
  assert.equal(s.order.length, 3); assert.equal(child.parentTaskId, 'root'); assert.equal(grandchild.parentTaskId, 'child');
  assert.equal(Math.abs(O.seat(parent.idx).x - O.seat(child.idx).x), 76);
  O.feed(s, ev('root', 'task.completed')); assert.equal(child.mode, 'thinking');
  O.feed(s, ev('late', 'task.started', { sessionId: 's' }));
  O.reconcile(s, [{ taskId: 'late', agent: 'codex', sessionId: 's', parentTaskId: 'root', status: 'running' }]);
  assert.notEqual(actor(s, 'late'), parent);
  assert.equal(O.feed(s, ev('next', 'task.started', { sessionId: 's' })), parent);
  assert.equal(O.feed(s, ev('orphan', 'task.started', { parentTaskId: 'unknown' })).parentTaskId, 'unknown');
});
check('late session IDs promote or merge provisional actors without losing tools', () => {
  const s = O.createState(), a = O.feed(s, ev('one'));
  O.feed(s, ev('one', 'tool.invoked', { data: { id: 'read', name: 'Read' } }));
  O.feed(s, ev('one', 'message.delta', { sessionId: 'known' })); assert.equal(actor(s, 'one'), a);
  O.feed(s, ev('two')); O.feed(s, ev('two', 'message.delta', { sessionId: 'known' }));
  assert.equal(s.order.length, 1); assert.equal(actor(s, 'two'), a); assert.equal(a.mode, 'reading'); assert.equal(s.registry.stations.slots.size, 1);
});
check('parallel tools, late completions, duplicates and terminal replay are isolated', () => {
  const s = O.createState(), a = O.feed(s, ev('one'));
  const read = (id: string) => ev('one', 'tool.invoked', { id: 'event-' + id, data: { toolUseId: id, name: 'Read' } });
  O.feed(s, read('r1')); O.feed(s, read('r2')); O.feed(s, read('r1')); assert.equal(s.registry.tasks.get('one').tools.size, 2);
  O.feed(s, ev('one', 'tool.completed', { data: { toolUseId: 'r1' } })); assert.equal(a.mode, 'reading');
  O.feed(s, ev('one', 'tool.completed', { data: { toolUseId: 'r2' } })); assert.equal(a.mode, 'thinking');
  O.feed(s, ev('one', 'tool.completed', { data: { toolUseId: 'early' } }));
  O.feed(s, ev('one', 'tool.invoked', { data: { toolUseId: 'early', name: 'Edit' } })); assert.equal(a.mode, 'thinking');
  O.feed(s, ev('one', 'task.completed', { id: 'done' })); O.feed(s, ev('one', 'task.completed', { id: 'done' }));
  O.feed(s, read('late')); assert.equal(a.doneCount, 1); assert.equal(a.mode, 'done'); run(s, 4); assert.equal(a.mode, 'idle');
});
check('permissions, tool categories and unknown providers are supported', () => {
  const s = O.createState(), a = O.feed(s, ev('one', 'task.started', { agent: 'hermes', sessionId: 'h' }));
  assert.equal(O.classifyTool('unrecognized_widget'), 'working'); assert.equal(O.classifyTool('exec_command'), 'running');
  assert.equal(O.classifyTool('write_file'), 'typing'); assert.equal(O.classifyTool('cat'), 'reading'); assert.equal(O.classifyTool('reasoning'), 'thinking');
  O.feed(s, ev('one', 'permission.requested', { agent: 'hermes' })); run(s, 5); assert.equal(a.badge.kind, 'ask');
  O.feed(s, ev('one', 'permission.resolved', { agent: 'hermes', data: { allowed: false } })); assert.equal(a.badge.kind, 'deny'); assert.equal(a.mode, 'thinking');
  assert.notEqual(O.feed(s, ev('other', 'task.started', { sessionId: 'h' })), a);
});
check('snapshots preserve SSE state and do not replay historical tools as active', () => {
  const s = O.createState(), rows = [{ taskId: 'one', agent: 'codex', sessionId: 's', status: 'running', toolsUsed: [{ name: 'Edit' }] }];
  O.reconcile(s, rows); const a = actor(s, 'one'); assert.equal(a.mode, 'thinking');
  O.feed(s, ev('one', 'tool.invoked', { data: { id: 'active', name: 'exec' } })); O.reconcile(s, rows); assert.equal(a.mode, 'running');
  O.feed(s, ev('one', 'task.completed')); O.reconcile(s, rows); assert.equal(a.mode, 'done');
  O.reconcile(s, [{ taskId: 'old', agent: 'codex', status: 'completed' }]); assert.equal(s.order.length, 1);
  O.feed(s, ev('two')); O.reconcile(s, [{ taskId: 'two', agent: 'codex', status: 'cancelled' }]); assert.equal(actor(s, 'two').mode, 'done');
});
check('growing rows, safe picking, idle retirement and station reuse', () => {
  const s = O.createState(); for (let i = 0; i < 30; i++) O.feed(s, ev('task' + i));
  assert.equal(new Set(s.order.map((id: string) => s.actors[id].idx)).size, 30); run(s, 8);
  const a = actor(s, 'task29'); s.cameraY = O.seat(a.idx).y - 112;
  assert.equal(O.hitTest(s, a.x, a.y - s.cameraY - 10), a.id); assert.equal(O.hitTest(s, 1, 170), null); assert.equal(O.hitTest(s, a.x, 20), null);
  const first = actor(s, 'task0'), index = first.idx; O.feed(s, ev('task0', 'task.cancelled')); run(s, 125);
  assert.equal(s.actors[first.id], undefined); assert.equal(O.feed(s, ev('new')).idx, index); assert.equal(s.order.length, 30);
});
check('sanitized Codex fixture projects real adapter events using an in-memory store', () => {
  const db = new SqliteStore(':memory:'), store = new EventStore({ sqliteStore: db }), adapter = new CodexAdapter();
  try {
    const id = 'fixture'; store.recordEvent(createEvent({ taskId: id, sessionId: 'fixture-session', agent: 'codex', type: 'task.started' }));
    for (const line of fs.readFileSync(path.join(import.meta.dirname, 'fixtures/codex.jsonl'), 'utf8').split('\n')) if (line.trim()) adapter.handleStdoutLine(line, id, store);
    adapter.handleExit(0, id, store, ''); const s = O.createState(); O.feed(s, ev('independent', 'task.started', { sessionId: 'other' }));
    for (const event of store.getEvents(id)) O.feed(s, event);
    assert.equal(actor(s, id).mode, 'done'); assert.equal(actor(s, 'independent').mode, 'thinking');
  } finally { db.close(); }
});
check('Canvas drawing, selection, RAF lifecycle and listener cleanup', () => {
  let rafCalls = 0, cancels = 0, picked = '';
  ctx.requestAnimationFrame = () => ++rafCalls; ctx.cancelAnimationFrame = () => cancels++; ctx.performance = { now: () => 0 };
  const calls: string[] = [], listeners = new Map();
  const g: any = new Proxy({}, { get: (_t, k) => () => calls.push(String(k)), set: () => true });
  const canvas: any = { getContext: () => g, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }),
    addEventListener: (k: string, fn: any) => listeners.set(k, fn), removeEventListener: (k: string) => listeners.delete(k) };
  const sim = O.mount(canvas, (id: string) => picked = id), a = sim.feed(ev('one')); run(sim.state, 6); O.drawScene(g, sim.state); assert.ok(calls.includes('fillText') && calls.includes('clip') && calls.includes('restore'));
  listeners.get('click')({ clientX: a.x * 2, clientY: (a.y - 10) * 2 }); assert.equal(picked, a.id);
  for (let i = 0; i < 8; i++) sim.feed(ev('extra' + i)); sim.select(actor(sim.state, 'extra7').id); assert.ok(sim.state.cameraY > 0);
  sim.start(); sim.start(); assert.equal(rafCalls, 1); sim.stop(); assert.equal(cancels, 1);
  sim.feed(ev('background')); sim.start(); assert.equal(rafCalls, 2); sim.destroy(); assert.equal(cancels, 2); assert.equal(listeners.size, 0);
});
check('HUD selection and log filtering use actor/task identity', () => {
  const app = fs.readFileSync(path.join(webDir, 'app.js'), 'utf8'), s = O.createState();
  const a = O.feed(s, ev('one', 'task.started', { sessionId: 'a' })); O.feed(s, ev('two', 'task.started', { sessionId: 'b' }));
  const hud: any = { office: { state: s, select: (id: string) => s.selectedActorId = id }, hudEvents: [ev('one'), ev('two')], lsSet: () => {}, renderDrawer: () => {}, officeActive: true };
  vm.createContext(hud);
  vm.runInContext("let currentHudAgent = ''; let currentHudTask = ''; let currentHudTab = ''; function officeSim() { return office; }\n" + app.slice(app.indexOf('  function focusHudAgent('), app.indexOf('  function switchHudTab(')) + '\nthis.focus = focusHudTask; this.events = selectedActorEvents;', hud);
  hud.focus('one'); assert.equal(s.selectedActorId, a.id); assert.equal(hud.events().length, 1); assert.equal(hud.events()[0].taskId, 'one');
  assert.ok(!app.includes('HUD_AGENT_IDS')); assert.ok(app.includes('sim.reconcile(serverTasks)'));
  assert.ok(!/https?:\/\/|eval\(|new Function|innerHTML/.test(src));
  const html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8'); assert.ok(html.includes('id="officeCanvas"') && html.includes('src="/office_sim.js'));
});
console.log(`web_office_sim OK (${checks} scenarios)`);

