import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { once } from 'node:events';
import { startServer } from '../src/commands/serve.ts';
import { startWeb } from '../src/commands/web.ts';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { createEvent } from '../src/core/types.ts';

const source = fs.readFileSync(new URL('../web/office_rpg.js', import.meta.url), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(source.replace(/^export /gm, '') + '\nglobalThis.office = {createWorld, InputManager, STATES, feed, step, nearestAgent, currentTask, classifyTool, drawWorld, mountOffice, AGENTS};', ctx);
const O = ctx.office;
const world = O.createWorld(), input = new O.InputManager();
input.down('w'); O.step(world, input, .05); assert.ok(world.player.y < 485);
for (const mode of ['DIALOGUE', 'TEXT_INPUT']) {
  input.setMode(mode); const before = world.player.y; input.down('w'); O.step(world, input, .05); assert.equal(world.player.y, before);
}
input.setMode('WORLD'); assert.equal(input.keys.size, 0);
world.player = { x: 180, y: 215 }; assert.equal(O.nearestAgent(world).id, 'agy');
input.down('w'); for (let i = 0; i < 100; i++) O.step(world, input, .05);
assert.ok(world.player.y >= 198, 'desk collision');
world.player = { x: 40, y: 300 }; input.setMode('WORLD'); input.down('a');
for (let i = 0; i < 100; i++) O.step(world, input, .05);
assert.ok(world.player.x >= 34, 'wall collision');
let seq = 0;
const emit = (type: string, data = {}, taskId = 'one', agent = 'claude') => O.feed(world, { seq: ++seq, type, data, taskId, agent, timestamp: seq });
emit('task.started', { prompt: 'Test task' });
emit('message.delta', { thinking: true }); assert.equal(O.currentTask(world, 'claude').mode, 'thinking');
for (const [name, expected] of [['Read', 'reading'], ['search', 'reading'], ['find', 'reading'], ['Bash', 'typing'], ['Edit', 'typing'], ['write_file', 'typing'], ['mcp__server', 'mcp']]) {
  emit('tool.invoked', { name }); assert.equal(O.currentTask(world, 'claude').mode, expected);
}
emit('usage.updated', { cachedTokens: 25 }); assert.equal(O.currentTask(world, 'claude').mode, 'cache');
emit('permission.requested', { command: 'touch example' });
emit('message.delta', { text: 'waiting' }); assert.equal(O.currentTask(world, 'claude').mode, 'waiting');
emit('task.started', {}, 'two'); emit('task.completed', {}, 'two');
assert.equal(O.currentTask(world, 'claude').id, 'one', 'concurrent completion preserves pending permission');
emit('permission.resolved', { approved: false }); assert.equal(O.currentTask(world, 'claude').permission, null);
emit('task.completed', { summary: 'Done' }); emit('message.delta', { text: 'late' });
assert.equal(world.tasks.get('one').mode, 'completed'); assert.equal(world.tasks.get('one').result, 'Done');
emit('task.failed', { error: 'Failed' }, 'three', 'codex'); assert.equal(O.currentTask(world, 'codex').mode, 'failed');
emit('task.cancelled', {}, 'four', 'agy'); assert.equal(O.currentTask(world, 'agy').mode, 'cancelled');
emit('message.delta', { text: 'once' }, 'five', 'opencode');
O.feed(world, { seq, type: 'message.delta', data: { text: 'duplicate' }, taskId: 'five', agent: 'opencode' });
assert.equal(world.tasks.get('five').text, 'once');
let draws = 0;
O.drawWorld(new Proxy({}, { get: () => () => draws++, set: () => true }), world);
assert.ok(draws > 500);

// Exercise the real dialogue handlers with a small DOM boundary and synthetic HTTP.
// This is a component test, not a browser or real CLI execution test.
const elements = new Map<string, any>(), listeners: Record<string, Function> = {}, requests: any[] = [];
let documentStub: any;
function element(id: string): any {
  if (!elements.has(id)) elements.set(id, {
    id, value: '', hidden: false, disabled: false, textContent: '', open: false,
    options: [{}, {}], handlers: {} as Record<string, Function>,
    append() {}, replaceChildren(...items: any[]) { this.options = items; this.value = items[0]?.value || ''; },
    addEventListener(type: string, handler: Function) { this.handlers[type] = handler; },
    focus() { documentStub.activeElement = this; if (id !== 'world') element('dialogue').handlers.focusin?.({ target: { tagName: ['prompt', 'cwd'].includes(id) ? 'TEXTAREA' : 'BUTTON' } }); },
    showModal() { this.open = true; }, close() { this.open = false; },
    getContext() { return {}; }
  });
  return elements.get(id);
}
documentStub = { getElementById: element, querySelector: () => ({ content: 'test-token' }), createElement: () => ({}), activeElement: null };
Object.assign(ctx, {
  window: { addEventListener: (type: string, handler: Function) => { listeners[type] = handler; }, removeEventListener() {} },
  Option: function (this: any, label: string, value: string) { this.textContent = label; this.value = value; },
  requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setInterval: () => 1, clearInterval() {}, clearTimeout() {}, setTimeout: () => 1,
  EventSource: class { addEventListener() {} close() {} },
  fetch: async (url: string, options?: any) => {
    requests.push({ url, options });
    return { ok: true, json: async () => url === '/api/config' ? { engines: [{ id: 'codex', installed: true, write: true, models: [{ id: 'gpt-6-astra', label: 'Astra' }] }], writeAllowed: true }
      : url === '/health' ? { lastSeq: 0 } : url.startsWith('/tasks') ? [] : { taskId: 'ui-task', ok: true } };
  }
});
const ui = O.mountOffice(documentStub);
await new Promise(resolve => setImmediate(resolve));
ui.open(O.AGENTS[2]); assert.equal(ui.input.mode, 'DIALOGUE'); assert.equal(element('dialogue').open, true);
element('new-task').onclick(); assert.equal(ui.input.mode, 'TEXT_INPUT'); assert.equal(element('prompt-form').hidden, false);
listeners.keydown({ key: 'w', target: { tagName: 'TEXTAREA' }, preventDefault() { throw new Error('text entry was intercepted'); } });
assert.equal(ui.input.keys.size, 0);
element('prompt').value = 'Synthetic office task';
await element('prompt-form').onsubmit({ preventDefault() {} });
const runRequest = requests.find(r => r.url === '/api/run');
assert.equal(JSON.parse(runRequest.options.body).engine, 'codex'); assert.equal(runRequest.options.headers['x-observatory-token'], 'test-token');
O.feed(ui.world, { taskId: 'ui-task', agent: 'codex', type: 'permission.requested', data: { command: 'test' } });
element('inspect').onclick(); assert.equal(element('approval').hidden, false);
await element('allow').onclick(); assert.equal(JSON.parse(requests.at(-1).options.body).approved, true);
O.feed(ui.world, { taskId: 'ui-task', agent: 'codex', type: 'permission.requested', data: {} });
element('inspect').onclick(); await element('deny').onclick(); assert.equal(JSON.parse(requests.at(-1).options.body).approved, false);
O.feed(ui.world, { taskId: 'ui-task', agent: 'codex', type: 'task.completed', data: { summary: 'Synthetic report' } });
element('summary').onclick(); assert.equal(element('report').textContent, 'Synthetic report');
element('dialogue').handlers.cancel({ preventDefault() {} }); assert.equal(ui.input.mode, 'WORLD'); assert.equal(element('dialogue').open, false);
ui.dispose();

// A separate temporary database is required by the HTTP server's second connection.
// Pure store behavior remains isolated in memory; no user database is touched.
const memory = new SqliteStore(':memory:');
memory.recordEvent(createEvent({ taskId: 'memory', agent: 'codex', type: 'task.started' })); memory.close();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-rpg-'));
const dbPath = path.join(dir, 'office.sqlite'), store = new SqliteStore(dbPath);
store.recordEvent(createEvent({ taskId: 'seed', agent: 'claude', type: 'task.started', data: { prompt: 'hello' } }));
let approval: unknown, started: any;
const oldBin = process.env.CODEX_BIN; process.env.CODEX_BIN = process.execPath;
const readonly = startServer({ port: 0, dbPath, ingest: false });
const { server, token } = startWeb({ port: 0, dbPath, ingest: false, roots: [dir], configPath: path.join(dir, 'config.json'), runner: {
  startTask: o => { started = o; return { taskId: 'run-office', promise: new Promise(() => {}) }; },
  approveTask: (taskId, approved) => { approval = { taskId, approved }; return true; }
} });
try {
  await Promise.all([once(readonly, 'listening'), once(server, 'listening')]);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const ro = `http://127.0.0.1:${(readonly.address() as any).port}`;
  for (const url of [base, ro]) {
    const page = await fetch(url + '/office'); assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy')!, /script-src 'self'/);
    const html = await page.text(); assert.match(html, /id="dialogue"/); assert.ok(!html.includes('__OBS_TOKEN__'));
    assert.ok(html.includes(url === base ? token : 'name="obs-token" content=""'));
    for (const asset of ['office_rpg.js', 'office_rpg.css']) assert.equal((await fetch(`${url}/${asset}`)).status, 200);
    assert.equal((await fetch(url + '/office', { headers: { origin: 'https://evil.test' } })).status, 403);
  }
  assert.match(await (await fetch(base)).text(), /href="\/office"/);
  const post = (route: string, body: unknown, auth = token) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-observatory-token': auth }, body: JSON.stringify(body) });
  const payload = { engine: 'codex', model: 'gpt-6-astra', prompt: 'Office task', cwd: dir, mode: 'read' };
  assert.equal((await post('/api/run', payload, 'bad-token')).status, 403);
  assert.equal((await post('/api/run', payload)).status, 200); assert.equal(started.sandbox, 'read-only');
  for (const approved of [true, false]) {
    assert.equal((await post('/api/approve', { taskId: 'run-office', approved })).status, 200);
    assert.deepEqual(approval, { taskId: 'run-office', approved });
  }
  assert.equal((await fetch(ro + '/api/run', { method: 'POST' })).status, 404);
  console.log('PASS office RPG: movement, focus modes, collision, task isolation, telemetry states, routes, auth, run and approval');
} finally {
  for (const s of [server, readonly]) { s.closeAllConnections(); await new Promise<void>(resolve => s.close(() => resolve())); }
  store.close(); fs.rmSync(dir, { recursive: true, force: true });
  if (oldBin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = oldBin;
}
