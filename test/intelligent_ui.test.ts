import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { createEvent } from '../src/core/types.ts';
import { publishUI, updateUI, readUI, listUI, submitUI, readUIActions, uiText } from '../src/features/intelligent_ui/index.ts';
import { startWeb } from '../src/commands/web.ts';
import { TranscriptRenderer } from '../src/ui/transcript.ts';

const spec = { version: 1, title: 'Sonuçlar', summary: 'Ölçülen veriler', blocks: [
  { id: 'bars', type: 'bar_chart', items: [{ label: 'Başarılı', value: 48 }, { label: 'Bilinmeyen', value: null }, { label: 'Negatif', value: -2 }] },
  { id: 'form', type: 'form', fields: [{ id: 'amount', label: 'Tutar', type: 'number', required: true }, { id: 'rate', label: 'Oran', type: 'number' }], calculation: { operation: 'percentage', inputs: ['amount', 'rate'], label: 'Vergi' } }
] };
const store = new SqliteStore(':memory:');
try {
  store.recordEvent(createEvent({ taskId: 't1', sessionId: 's1', agent: 'codex', type: 'task.started', data: { prompt: 'test' } }));
  const doc = publishUI(store, { id: 'ui-test', taskId: 't1', agent: 'codex', spec });
  assert.equal(doc.sessionId, 's1');
  assert.equal(doc.revision, 1);
  assert.throws(() => publishUI(store, { id: doc.id, agent: 'codex', spec }), /already exists/);
  assert.throws(() => publishUI(store, { taskId: 't1', agent: 'claude', spec }), /scope mismatch/);
  assert.throws(() => publishUI(store, { taskId: 'missing', agent: 'codex', spec }), /not found/);
  assert.throws(() => updateUI(store, { id: doc.id, expectedRevision: 2, spec }), /conflict/);
  assert.throws(() => publishUI(store, { agent: 'codex', spec: { ...spec, blocks: [{ id: 'x', type: 'html', code: '<script>evil()</script>' }] } }));
  assert.throws(() => publishUI(store, { agent: 'codex', spec: { ...spec, blocks: [spec.blocks[0], spec.blocks[0]] } }), /Duplicate/);
  assert.throws(() => publishUI(store, { agent: 'codex', spec: { ...spec, blocks: [{ id: 'x', type: 'table', columns: ['A'], rows: [[1, 2]] }] } }), /width/);
  assert.throws(() => publishUI(store, { agent: 'codex', spec: { ...spec, blocks: [{ id: 'x', type: 'diagram', nodes: [{ id: 'a', label: 'A' }], edges: [{ from: 'a', to: 'b' }] }] } }), /references/);
  assert.throws(() => publishUI(store, { agent: 'codex', spec: { ...spec, summary: 'a'.repeat(50000) } }), /48 KiB/);
  const action = { id: doc.id, expectedRevision: 1, blockId: 'form', requestId: crypto.randomUUID(), values: { amount: 200, rate: 20 } };
  assert.deepEqual(submitUI(store, action).values, action.values);
  submitUI(store, action);
  assert.throws(() => submitUI(store, { ...action, values: { amount: 201, rate: 20 } }), /already used/);
  assert.throws(() => submitUI(store, { ...action, requestId: crypto.randomUUID(), values: { amount: '200' } }), /field type/);
  assert.throws(() => submitUI(store, { ...action, requestId: crypto.randomUUID(), values: {} }), /Required/);
  assert.throws(() => submitUI(store, { ...action, requestId: crypto.randomUUID(), values: { amount: 1, command: 'rm' } }), /Unknown/);
  const next = updateUI(store, { id: doc.id, expectedRevision: 1, spec: { ...spec, summary: 'Güncellendi' } });
  assert.equal(next.revision, 2);
  assert.throws(() => submitUI(store, { ...action, requestId: crypto.randomUUID() }), /conflict/);
  const data = store.withTransaction(db => ({ doc: readUI(db, doc.id), docs: listUI(db, { sessionId: 's1' }), actions: readUIActions(db, doc.id) }));
  assert.equal(data.doc!.spec.summary, 'Güncellendi'); assert.equal(data.docs.length, 1); assert.equal(data.actions.length, 1);
  assert.equal(store.withTransaction(db => readUIActions(db, doc.id, data.actions[0].seq)).length, 0);
  assert.match(uiText(next), /Başarılı: 48/); assert.match(uiText(next), /Bilinmeyen: \?/);
  let output = ''; const transcript = new TranscriptRenderer(s => { output += s; }, { color: false });
  transcript.push({ taskId: 't1', agent: 'codex', type: 'ui.updated', data: next, timestamp: Date.now() });
  assert.match(output, /ui-test/);
  const context = vm.createContext({}); vm.runInContext(fs.readFileSync('web/intelligent-ui.js', 'utf8'), context);
  assert.equal(context.ObsUI.calculate({ operation: 'percentage', inputs: ['a', 'b'] }, { a: 200, b: 20 }), 40);
  assert.equal(context.ObsUI.calculate({ operation: 'sum', inputs: ['a'] }, {}), null);
  assert.equal(context.ObsUI.calculate({ operation: 'product', inputs: ['a', 'b'] }, { a: 1e308, b: 1e308 }), null);
} finally { store.close(); }

// Real HTTP + SSE, isolated file shared by separate readers and writers.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-ui-')); const dbPath = path.join(dir, 'test.sqlite');
const writer = new SqliteStore(dbPath);
const { server, token } = startWeb({ port: 0, dbPath, ingest: false, configPath: path.join(dir, 'web.json'), roots: [], pollMs: 20 });
await new Promise<void>(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const abort = new AbortController();
try {
  const stream = await fetch(base + '/stream?since=0', { signal: abort.signal });
  const reader = stream.body!.getReader(); await reader.read();
  const doc = publishUI(writer, { id: 'http-ui', agent: 'claude', sessionId: 'session-claude', spec });
  const frame = new TextDecoder().decode((await reader.read()).value); assert.match(frame, /ui.published/);
  assert.equal((await fetch(base + '/api/ui?id=missing')).status, 404);
  const fetched = await (await fetch(base + '/api/ui?id=http-ui')).json() as any; assert.equal(fetched.document.agent, 'claude');
  assert.equal(((await (await fetch(base + '/api/ui?sessionId=other')).json()) as any).documents.length, 0);
  const html = await (await fetch(base + '/visual.html')).text(); assert.ok(html.includes(token) && !html.includes('__OBS_TOKEN__'));
  const action = { id: doc.id, expectedRevision: 1, blockId: 'form', requestId: crypto.randomUUID(), values: { amount: 200, rate: 20 } };
  const send = (body: object, key = token) => fetch(base + '/api/ui/action', { method: 'POST', headers: { 'content-type': 'application/json', 'x-observatory-token': key }, body: JSON.stringify(body) });
  assert.equal((await send(action, 'bad')).status, 403);
  assert.equal((await send(action)).status, 200);
  assert.equal((await send({ ...action, expectedRevision: 2, requestId: crypto.randomUUID() })).status, 409);
  const saved = writer.withTransaction(db => readUIActions(db, doc.id)); assert.equal(saved.length, 1); assert.equal(saved[0].values.amount, 200);
  writer.close(); const reopened = new SqliteStore(dbPath); assert.equal(reopened.withTransaction(db => readUI(db, doc.id))!.revision, 1); reopened.close();
} finally {
  abort.abort(); await new Promise<void>(r => server.close(() => r()));
  try { writer.close(); } catch { /* already closed for persistence check */ }
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
console.log('✔ Intelligent UI: validation, ACID revisions, actions, terminal, HTTP and SSE passed');
