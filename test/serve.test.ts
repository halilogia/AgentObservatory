// observatory serve: uç noktalar, Host/Origin koruması ve SSE canlı akışı (geçici SQLite dosyası, kullanıcının asıl veritabanına dokunmaz)
import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { createEvent } from '../src/core/types.ts';
import { startServer } from '../src/commands/serve.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-serve-'));
const dbPath = path.join(dir, 'test.sqlite');
const writer = new SqliteStore(dbPath);
const PORT = 18900 + Math.floor(Math.random() * 90);

writer.recordEvent(createEvent({ taskId: 'task_t1', agent: 'codex', type: 'task.started', data: { prompt: 'p' } }));
writer.recordEvent(createEvent({ taskId: 'task_t1', agent: 'codex', type: 'message.delta', data: { text: 'OK' } }));

const server = startServer({ port: PORT, dbPath, pollMs: 50, ingest: false });
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${PORT}`;

function rawGet(headers: Record<string, string>, urlPath = '/health'): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, headers }, (res) => { res.resume(); resolve(res.statusCode || 0); });
    req.on('error', reject);
    req.end();
  });
}

try {
  const health = await (await fetch(`${base}/health`)).json() as any;
  assert.ok(health.ok && health.lastSeq >= 2, '/health ok ve lastSeq >= 2 olmalı');

  const tasks = await (await fetch(`${base}/tasks`)).json() as any[];
  assert.ok(tasks.some((t) => t.task_id === 'task_t1'), '/tasks seed görevi içermeli');

  const detail = await (await fetch(`${base}/tasks/task_t1`)).json() as any;
  assert.deepStrictEqual(detail.events.map((e: any) => e.type), ['task.started', 'message.delta'], 'olaylar sırayla gelmeli');
  assert.strictEqual(detail.events[1].data.text, 'OK');

  const missing = await fetch(`${base}/tasks/task_yok`);
  assert.strictEqual(missing.status, 404);

  assert.strictEqual(await rawGet({ Host: 'evil.com' }), 403, 'yabancı Host reddedilmeli (DNS rebinding)');
  assert.strictEqual(await rawGet({ Origin: 'https://evil.com' }), 403, 'yabancı Origin reddedilmeli');
  assert.strictEqual(await rawGet({ Origin: 'http://localhost:3000' }), 200, 'yerel Origin kabul edilmeli');

  // SSE: bağlandıktan SONRA yazılan olay akışta görünmeli
  const res = await fetch(`${base}/stream`);
  assert.strictEqual(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  await reader.read(); // ": bağlandı"
  writer.recordEvent(createEvent({ taskId: 'task_t1', agent: 'codex', type: 'task.completed', data: { exitCode: 0 } }));
  let buf = '';
  const deadline = Date.now() + 5000;
  while (!buf.includes('task.completed') && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value);
  }
  assert.ok(buf.includes('"type":"task.completed"'), 'SSE yeni olayı akıtmalı');
  await reader.cancel();
  console.log('✔ serve: /health /tasks /tasks/:id, Host+Origin koruması, SSE canlı akış');
} finally {
  server.close();
  server.closeAllConnections?.();
}
