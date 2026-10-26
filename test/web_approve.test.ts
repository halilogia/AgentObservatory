import assert from 'node:assert';
import { startWeb } from '../src/commands/web.ts';
import type { RunnerLike } from '../src/commands/web.ts';

console.log('🧪 Testing /api/approve endpoint and interactive approval...');

let lastApproved: { taskId: string; approved: boolean } | null = null;
const mockRunner: RunnerLike = {
  startTask: (o: any) => ({
    taskId: 'task_test_123',
    promise: new Promise(() => {}) // pending
  }),
  cancelTask: () => true,
  approveTask: (taskId: string, approved: boolean) => {
    lastApproved = { taskId, approved };
    return true;
  }
};

const { server, token, port } = startWeb({
  port: 0,
  runner: mockRunner,
  roots: [process.cwd()]
});

await new Promise((r) => server.once('listening', r));
const actualPort = (server.address() as any).port;
const base = `http://127.0.0.1:${actualPort}`;

try {
  // 1. Without active task -> 404
  const res1 = await fetch(`${base}/api/approve`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-observatory-token': token,
      'sec-fetch-site': 'same-origin'
    },
    body: JSON.stringify({ taskId: 'non_existent', approved: true })
  });
  assert.strictEqual(res1.status, 404, 'Olmayan görevde 404 dönmeli');
  const d1 = await res1.json() as any;
  assert.strictEqual(d1.code, 'no_active_task');

  // Start a task to make it active
  const startRes = await fetch(`${base}/api/run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-observatory-token': token,
      'sec-fetch-site': 'same-origin'
    },
    body: JSON.stringify({
      engine: 'codex',
      model: 'gpt-6-astra',
      prompt: 'test prompt',
      mode: 'write',
      cwd: process.cwd()
    })
  });
  if (startRes.status !== 200) {
    console.error('startRes error:', await startRes.json());
  }
  assert.strictEqual(startRes.status, 200, 'Görev başlatılabilmeli');
  const startData = await startRes.json() as any;
  const activeTaskId = startData.taskId;
  assert.strictEqual(activeTaskId, 'task_test_123');

  // 2. Active task with invalid approval payload -> 400
  const res2 = await fetch(`${base}/api/approve`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-observatory-token': token,
      'sec-fetch-site': 'same-origin'
    },
    body: JSON.stringify({ taskId: activeTaskId, approved: 'not-a-boolean' })
  });
  assert.strictEqual(res2.status, 400, 'Geçersiz onay türünde 400 dönmeli');
  const d2 = await res2.json() as any;
  assert.strictEqual(d2.code, 'bad_approval');

  // 3. Active task with valid approved: true -> 200
  const res3 = await fetch(`${base}/api/approve`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-observatory-token': token,
      'sec-fetch-site': 'same-origin'
    },
    body: JSON.stringify({ taskId: activeTaskId, approved: true })
  });
  assert.strictEqual(res3.status, 200, 'Onay isteği 200 dönmeli');
  const d3 = await res3.json() as any;
  assert.strictEqual(d3.ok, true);
  assert.strictEqual(d3.taskId, activeTaskId);
  assert.strictEqual(d3.approved, true);
  assert.deepStrictEqual(lastApproved, { taskId: activeTaskId, approved: true });

  // 4. Active task with valid approved: false (rejection) -> 200
  const res4 = await fetch(`${base}/api/approve`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-observatory-token': token,
      'sec-fetch-site': 'same-origin'
    },
    body: JSON.stringify({ taskId: activeTaskId, approved: false })
  });
  assert.strictEqual(res4.status, 200, 'Reddetme isteği 200 dönmeli');
  const d4 = await res4.json() as any;
  assert.strictEqual(d4.approved, false);
  assert.deepStrictEqual(lastApproved, { taskId: activeTaskId, approved: false });

  console.log('✔ /api/approve tüm güvenlik ve onay akışları başarıyla geçti!');
} finally {
  server.close();
}
