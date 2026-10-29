// Telefondan erişim: kapalı varsayılan, Host izni, eşleştirme kodu, cihaz çerezi, yalnızca sohbet yetkisi, yazma izni, iptal
import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { createEvent } from '../src/core/types.ts';
import { startWeb } from '../src/commands/web.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-remote-'));
const root = path.join(dir, 'GitHub'); fs.mkdirSync(path.join(root, 'proj'), { recursive: true });
const dbPath = path.join(dir, 'test.sqlite');
new SqliteStore(dbPath).recordEvent(createEvent({ taskId: 'task_seed', agent: 'codex', type: 'task.started', data: { prompt: 'x' } }));
const calls: any[] = [];
const fakeRunner = { startTask(o: any) { calls.push(o); return { taskId: 'task_r_' + calls.length, promise: new Promise<void>(() => undefined) }; }, cancelTask() { return true; } };

const PORT = 18970 + Math.floor(Math.random() * 9), TOKEN = 'b'.repeat(48), HOST = 'pc.tail123.ts.net';
const cfgPath = path.join(dir, 'web.json');
fs.writeFileSync(cfgPath, JSON.stringify({ roots: [root] }));
const { server } = startWeb({ port: PORT, dbPath, roots: [root], configPath: cfgPath, runner: fakeRunner, token: TOKEN, pollMs: 50, ingest: false,
  opencodeListing: async () => 'opencode/big-pickle', detectTailscale: async () => ({ installed: true, state: 'Running', dnsName: HOST, online: true }) });
await new Promise((r) => server.once('listening', r));

interface R { status: number; headers: http.IncomingHttpHeaders; body: string; json: any }
function call(method: string, p: string, o: { host?: string; cookie?: string; body?: unknown; login?: string; token?: boolean } = {}): Promise<R> {
  const host = o.host || `127.0.0.1:${PORT}`;
  const remote = !!o.host;
  const headers: Record<string, string> = { host };
  if (o.cookie) headers.cookie = o.cookie;
  if (o.login) headers['tailscale-user-login'] = o.login;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  if (method === 'POST') { headers.origin = remote ? `https://${host}` : `http://127.0.0.1:${PORT}`; headers['sec-fetch-site'] = 'same-origin'; if (o.token !== false) headers['x-observatory-token'] = TOKEN; }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (res) => {
      let body = ''; res.on('data', (c) => (body += c)); res.on('end', () => { let json: any = null; try { json = JSON.parse(body); } catch { /* html */ } resolve({ status: res.statusCode || 0, headers: res.headers, body, json }); });
    });
    req.on('error', reject); req.end(o.body !== undefined ? JSON.stringify(o.body) : undefined);
  });
}
const cookieOf = (r: R) => String(r.headers['set-cookie']?.[0] || '').split(';')[0];

try {
  // 1. varsayılan KAPALI: uzak Host reddedilir
  assert.strictEqual((await call('GET', '/', { host: HOST })).status, 403, 'kapalıyken uzak Host reddedilmeli');
  assert.strictEqual((await call('GET', '/api/remote')).json.enabled, false);
  assert.strictEqual((await call('POST', '/api/pair/new', { body: {} })).json.code, 'remote_off');

  // 2. açma ve eşleştirme kodu (yalnızca yerel + jetonlu)
  assert.strictEqual((await call('POST', '/api/remote', { body: { enabled: true }, token: false })).status, 403, 'jetonsuz açılamaz');
  const st = (await call('POST', '/api/remote', { body: { enabled: true } })).json;
  assert.deepStrictEqual([st.enabled, st.host, st.url], [true, HOST, `https://${HOST}/pair`]);
  assert.ok(st.serveCommand.includes(String(PORT)));
  assert.strictEqual(JSON.parse(fs.readFileSync(cfgPath, 'utf8')).roots[0], root, 'ayar dosyasındaki diğer anahtarlar korunur');

  // 3. izinli Host ama çerez yok: sayfa eşleştirmeye yönlenir, API 401, eşleştirme sayfası açık
  const r0 = await call('GET', '/', { host: HOST });
  assert.strictEqual(r0.status, 302); assert.strictEqual(r0.headers.location, '/pair');
  assert.strictEqual((await call('GET', '/api/config', { host: HOST })).json.code, 'not_paired');
  assert.strictEqual((await call('GET', '/stream', { host: HOST })).status, 401);
  assert.ok((await call('GET', '/pair', { host: HOST })).body.includes('pair.js'));
  assert.strictEqual((await call('POST', '/api/run', { host: HOST, body: {} })).status, 401, 'çerezsiz görev başlatılamaz');

  // 4. yanlış kod, doğru kod, tek kullanım, kilit
  const { code } = (await call('POST', '/api/pair/new', { body: {} })).json;
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.strictEqual((await call('POST', '/api/pair', { host: HOST, body: { code: 'AAAA-AAAA' } })).json.code, 'pair_bad');
  const ok = await call('POST', '/api/pair', { host: HOST, body: { code: code.toLowerCase().replace('-', ' '), name: 'iPhone' }, login: 'halil@example.com' });
  assert.strictEqual(ok.status, 200);
  assert.match(String(ok.headers['set-cookie']), /HttpOnly; Secure; SameSite=Strict/);
  const cookie = cookieOf(ok); assert.ok(cookie.startsWith('obs_dev='));
  assert.strictEqual((await call('POST', '/api/pair', { host: HOST, body: { code }, login: 'halil@example.com' })).json.code, 'pair_expired', 'kod tek kullanımlık');
  assert.strictEqual((await call('GET', '/api/config', { host: HOST, cookie })).json.code, 'wrong_account', 'hesap başlığı yoksa da reddedilir (kilit)');
  const again = (await call('POST', '/api/pair/new', { body: {} })).json.code;
  for (let i = 0; i < 4; i++) assert.strictEqual((await call('POST', '/api/pair', { host: HOST, body: { code: 'ZZZZ-ZZZZ' }, login: 'halil@example.com' })).json.code, 'pair_bad');
  assert.strictEqual((await call('POST', '/api/pair', { host: HOST, body: { code: 'ZZZZ-ZZZZ' }, login: 'halil@example.com' })).json.code, 'pair_locked', '5 yanlışta kilit');
  assert.strictEqual((await call('POST', '/api/pair', { host: HOST, body: { code: again }, login: 'halil@example.com' })).json.code, 'pair_locked', 'kilitliyken doğru kod da geçmez');

  // 5. eşleşmiş telefon: sohbet eder, yönetemez
  const me = { host: HOST, cookie, login: 'halil@example.com' };
  const cfg = (await call('GET', '/api/config', me)).json;
  assert.strictEqual(cfg.remote, true); assert.strictEqual(cfg.writeAllowed, false);
  assert.strictEqual((await call('GET', '/', me)).status, 200);
  assert.strictEqual((await call('GET', '/api/config', { host: HOST, cookie: 'obs_dev=bozuk.deger', login: 'halil@example.com' })).status, 401);
  assert.strictEqual((await call('GET', '/api/config', { host: HOST, cookie, login: 'baska@example.com' })).json.code, 'wrong_account', 'ilk eşleşen Tailscale hesabına kilitli');
  for (const [m, p] of [['POST', '/api/folders'], ['POST', '/api/snapshot'], ['POST', '/api/restore'], ['POST', '/api/pair/new'], ['POST', '/api/remote'], ['POST', '/api/devices/remove'], ['GET', '/api/remote']] as const) {
    const r = await call(m, p, { ...me, body: m === 'POST' ? { path: root } : undefined });
    assert.strictEqual(r.json.code, 'local_only', `${m} ${p} uzaktan yasak`);
  }
  const run = (mode: string) => call('POST', '/api/run', { ...me, body: { engine: 'opencode', model: cfg.engines.find((e: any) => e.id === 'opencode').models[0].id, prompt: 'merhaba', mode, cwd: path.join(root, 'proj') } });
  const rd = await run('read');
  assert.ok(rd.status === 200 || rd.json.code === 'not_installed', 'telefondan okuma kipinde görev kabul edilir: ' + rd.body);
  const w = await run('write');
  assert.strictEqual(w.status, 403); assert.strictEqual(w.json.code, 'remote_write_forbidden', 'yazma varsayılan kapalı');

  // 6. yazma izni yerel sayfadan cihaz başına açılır; iptal çerezi öldürür
  const dev = (await call('GET', '/api/remote')).json.devices;
  assert.strictEqual(dev.length, 1); assert.strictEqual(dev[0].name, 'iPhone'); assert.strictEqual(dev[0].write, false);
  assert.ok(!JSON.stringify(dev).includes('hash') && !fs.readFileSync(cfgPath, 'utf8').includes(cookie.split('.')[1]), 'çerez gizi diske yazılmaz, yalnızca özeti');
  await call('POST', '/api/devices/write', { body: { id: dev[0].id, write: true } });
  const wr = await run('write');
  assert.ok(wr.status === 200 || wr.json.code === 'not_installed', 'izin verilince yazma kipi reddedilmez: ' + wr.body);
  await call('POST', '/api/devices/remove', { body: { id: dev[0].id } });
  assert.strictEqual((await call('GET', '/api/config', me)).json.code, 'not_paired', 'iptal edilen cihaz düşer');

  // 7. kapatınca uzak Host yine reddedilir
  await call('POST', '/api/remote', { body: { enabled: false } });
  assert.strictEqual((await call('GET', '/', me)).status, 403);
  console.log('✔ web_remote: varsayılan kapalı, Host izni, kod (tek kullanım, kilit), çerez, yerel-özel uçlar, yazma izni, iptal');
} finally {
  server.close(); server.closeAllConnections?.();
}
