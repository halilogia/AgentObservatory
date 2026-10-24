// observatory web: arayüz, yapılandırma, yazan uçların korumaları ve sahte bir runner ile gönder -> SSE akışı
import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { createEvent } from '../src/core/types.ts';
import { startWeb, parseOpenCodeModels, humanizeModel } from '../src/commands/web.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-web-'));
const root = path.join(dir, 'GitHub');
fs.mkdirSync(path.join(root, 'proj'), { recursive: true });
const dbPath = path.join(dir, 'test.sqlite');
const writer = new SqliteStore(dbPath);
writer.recordEvent(createEvent({ taskId: 'task_seed', agent: 'codex', type: 'task.started', data: { prompt: 'x' } }));

const calls: any[] = [];
const fakeRunner = {
  startTask(o: any) {
    calls.push(o);
    const taskId = 'task_fake_' + calls.length;
    const promise = new Promise<void>((resolve) => {
      setTimeout(() => writer.recordEvent(createEvent({ taskId, agent: o.agent, type: 'task.started', data: { prompt: o.prompt } })), 20);
      setTimeout(() => writer.recordEvent(createEvent({ taskId, agent: o.agent, type: 'message.delta', data: { text: 'merhaba' } })), 80);
      setTimeout(() => { writer.recordEvent(createEvent({ taskId, agent: o.agent, type: 'task.completed', data: { exitCode: 0 } })); resolve(); }, 140);
    });
    return { taskId, promise };
  },
  cancelTask() { return true; }
};

const PORT = 18990 + Math.floor(Math.random() * 9);
const TOKEN = 'a'.repeat(48);
const { server } = startWeb({ port: PORT, dbPath, roots: [root], configPath: path.join(dir, 'web.json'), runner: fakeRunner, token: TOKEN, pollMs: 50,
  opencodeListing: async () => ['openai/gpt-5', 'opencode/nemotron-3.5-super-vl-free', 'opencode/big-pickle', 'opencode/glm-5.3-flash-free', 'opencode/big-pickle'].join('\n') });
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${PORT}`;
const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-observatory-token': TOKEN, ...headers }, body: JSON.stringify(body) });
const rawPost = (headers: Record<string, string>, payload = '{}'): Promise<number> => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api/run', method: 'POST', headers }, (res) => { res.resume(); resolve(res.statusCode || 0); });
  req.on('error', reject); req.end(payload);
});

try {
  // arayüz dosyaları
  const page = await fetch(base + '/');
  const html = await page.text();
  assert.strictEqual(page.status, 200);
  assert.ok(html.includes(`content="${TOKEN}"`), 'jeton sayfaya meta etiketiyle verilmeli');
  assert.ok(!/https?:\/\//.test(html), 'sayfa dış kaynak yüklememeli');
  assert.ok((page.headers.get('content-security-policy') || '').includes("script-src 'self'"), 'sıkı CSP');
  assert.strictEqual(page.headers.get('x-frame-options'), 'DENY');
  for (const f of ['md.js', 'store.js', 'i18n.js', 'lang-tr.js', 'lang-en.js', 'theme.js', 'favicon.svg', 'favicon.png']) assert.strictEqual((await fetch(base + '/' + f)).status, 200, f + ' sunulmalı');
  const svgFavicon = await fetch(base + '/favicon.svg');
  assert.strictEqual(svgFavicon.headers.get('content-type'), 'image/svg+xml');
  const pngFavicon = await fetch(base + '/favicon.png');
  assert.strictEqual(pngFavicon.headers.get('content-type'), 'image/png');
  assert.strictEqual((await fetch(base + '/nope.js')).status, 404, 'olmayan dosya 404');
  assert.strictEqual((await fetch(base + '/..%2fpackage.json')).status, 404, 'dizin dışına çıkılamaz');
  const js = await fetch(base + '/app.js');
  assert.ok((js.headers.get('content-type') || '').startsWith('text/javascript'));
  assert.ok(!(await js.text()).includes('innerHTML = text'), 'app.js ham metni innerHTML ile basmamalı');

  // yapılandırma
  const cfg = await (await fetch(base + '/api/config')).json() as any;
  assert.deepStrictEqual(cfg.engines.map((e: any) => e.id), ['claude', 'codex', 'opencode', 'agy'], 'dört motor');
  assert.ok(cfg.projects.some((p: any) => p.name === 'proj'), 'proje listesi');
  assert.ok(cfg.defaultCwd.startsWith(root) && cfg.defaultCwd !== root, 'varsayılan klasör kök değil, bir proje olmalı');
  assert.ok(cfg.engines.every((e: any) => typeof e.installed === 'boolean'));
  // OpenCode modelleri CLI listesinden: yalnızca opencode/ ücretsiz modelleri, tekrarsız, big-pickle önce
  const oc = cfg.engines.find((e: any) => e.id === 'opencode');
  assert.deepStrictEqual(oc.models.map((m: any) => m.id), ['opencode/big-pickle', 'opencode/glm-5.3-flash-free', 'opencode/nemotron-3.5-super-vl-free']);
  assert.deepStrictEqual(oc.models.map((m: any) => m.label), ['Big Pickle', 'GLM 5.3 Flash', 'Nemotron 3.5 Super VL']);
  assert.ok(oc.models.every((m: any) => m.sub === 'models.free'));
  assert.strictEqual(humanizeModel('opencode/flint-40b-free'), 'Flint 40B');
  assert.deepStrictEqual(parseOpenCodeModels(['boş', 'opencode/a-free', 'openai/x', ''].join('\r\n')).map((m) => m.id), ['opencode/a-free']);

  // yazan uçların korumaları
  const ok = { engine: 'codex', model: 'gpt-6-astra', prompt: 'x', cwd: path.join(root, 'proj') };
  assert.strictEqual((await fetch(base + '/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ok) })).status, 403, 'jetonsuz reddedilmeli');
  assert.strictEqual((await post('/api/run', ok, { 'x-observatory-token': 'yanlis' })).status, 403, 'yanlış jeton');
  assert.strictEqual((await post('/api/run', ok, { 'sec-fetch-site': 'cross-site' })).status, 403, 'çapraz site');
  assert.strictEqual(await rawPost({ host: `127.0.0.1:${PORT}`, origin: 'https://evil.com', 'content-type': 'application/json', 'x-observatory-token': TOKEN }), 403, 'yabancı Origin');
  assert.strictEqual(await rawPost({ host: `127.0.0.1:${PORT}`, origin: 'http://localhost:3000', 'content-type': 'application/json', 'x-observatory-token': TOKEN }), 403, 'başka yerel port da reddedilmeli');
  assert.strictEqual(await rawPost({ host: `127.0.0.1:${PORT}`, 'content-type': 'text/plain', 'x-observatory-token': TOKEN }), 415, 'content-type denetimi');

  // doğrulamalar
  const nw = await post('/api/run', { ...ok, engine: 'agy', model: 'gemini-3.8-flash', mode: 'write' });
  assert.strictEqual(nw.status, 400, 'agy yazma kipi yok');
  const nwj = await nw.json() as any;
  assert.strictEqual(nwj.code, 'no_write', 'hata kodu çeviri için dönmeli'); assert.strictEqual(nwj.params.engine, 'Antigravity (agy)');
  assert.strictEqual(((await (await post('/api/run', { ...ok, cwd: os.homedir() })).json()) as any).code, 'cwd_forbidden');
  assert.strictEqual(((await (await post('/api/run', { ...ok }, { 'x-observatory-token': 'yanlis' })).json()) as any).code, 'bad_token');
  assert.strictEqual((await post('/api/run', { ...ok, engine: 'claude', model: 'sonnet', mode: 'write' })).status, 400, 'claude yazma kipi yok');
  assert.strictEqual((await post('/api/run', { ...ok, model: 'yok' })).status, 400, 'bilinmeyen model');
  assert.strictEqual((await post('/api/run', { ...ok, prompt: '  ' })).status, 400, 'boş istem');
  assert.strictEqual((await post('/api/run', { ...ok, cwd: os.homedir() })).status, 400, 'izinli kök dışı klasör');
  assert.strictEqual((await post('/api/run', { ...ok, effort: 'turbo' })).status, 400, 'geçersiz çaba');
  assert.strictEqual((await post('/api/cancel', { taskId: 'task_yok' })).status, 404, 'etkin olmayan görev iptal edilemez');
  assert.strictEqual(calls.length, 0, 'reddedilen isteklerde runner çağrılmamalı');

  // gerçek akış: kurulu bir motorla gönder, SSE'den olayları al
  const installed = cfg.engines.find((e: any) => e.installed && !e.limitedUntil);
  if (!installed) {
    console.log('ℹ kurulu motor yok: gönder -> akış adımı atlandı');
  } else {
    const es = await fetch(base + '/stream');
    const reader = es.body!.getReader(); const dec = new TextDecoder();
    await reader.read();
    const model = installed.models[0].id;
    const r = await post('/api/run', { engine: installed.id, model, prompt: 'merhaba', cwd: path.join(root, 'proj'), mode: 'read', effort: installed.efforts.length ? 'medium' : undefined });
    assert.strictEqual(r.status, 200, 'geçerli istek kabul edilmeli');
    const { taskId } = await r.json() as any;
    assert.strictEqual(calls.length, 1);
    const call = calls[0];
    assert.strictEqual(call.sandbox, 'read-only', 'varsayılan kip salt okunur');
    assert.strictEqual(call.dangerouslySkipPermissions, false);
    assert.ok(path.resolve(call.cwd).startsWith(path.resolve(root)));
    let buf = ''; const deadline = Date.now() + 6000;
    while (!buf.includes('task.completed') && Date.now() < deadline) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value); }
    assert.ok(buf.includes(taskId) && buf.includes('merhaba') && buf.includes('task.completed'), 'SSE görevin olaylarını akıtmalı');
    await reader.cancel();
  }
  // klasör ekle: kökün dışındaki bir klasör eklenir, listelenir, çalıştırılabilir, kalıcıdır ve çıkarılabilir
  {
    const outside = path.join(dir, 'masaustu-yeni'); fs.mkdirSync(outside);
    const code = async (body: unknown, p = '/api/folders') => ((await (await post(p, body)).json()) as any).code;
    assert.strictEqual(await code({ path: 'goreli/yol' }), 'folder_not_absolute');
    assert.strictEqual(await code({ path: path.join(dir, 'yok') }), 'folder_missing');
    assert.strictEqual(await code({ path: dbPath }), 'folder_not_dir');
    assert.strictEqual(await code({ path: os.homedir() }), 'folder_too_broad');
    assert.strictEqual(await code({ path: path.parse(dir).root }), 'folder_too_broad');
    assert.strictEqual((await post('/api/folders', { path: outside }, { 'x-observatory-token': 'yanlis' })).status, 403, 'jetonsuz klasör eklenemez');
    const added = await (await post('/api/folders', { path: `"${outside}"` })).json() as any;
    assert.strictEqual(added.ok, true);
    const cfg2 = await (await fetch(base + '/api/config')).json() as any;
    assert.ok(cfg2.projects.some((p: any) => p.custom && p.path === outside), 'eklenen klasör listede ve custom');
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'web.json'), 'utf8'));
    assert.deepStrictEqual(saved.folders, [outside], 'ayar dosyasına yazılmalı');
    const okRun = await post('/api/run', { engine: 'codex', model: 'gpt-6-astra', prompt: 'x', mode: 'read', cwd: path.join(outside) });
    assert.notStrictEqual(((await okRun.json()) as any).code, 'cwd_forbidden', 'eklenen klasörde çalıştırılabilir');
    await post('/api/folders/remove', { path: outside });
    const cfg3 = await (await fetch(base + '/api/config')).json() as any;
    assert.ok(!cfg3.projects.some((p: any) => p.path === outside), 'çıkarılan klasör listede olmamalı');
  }
  // dosya geri alma uçları: izinli klasör ister; git deposu olmayan klasörde anlık görüntü yok; geçersiz karma reddedilir
  {
    const c = async (p: string, body: unknown) => (await post(p, body)).json() as Promise<any>;
    assert.strictEqual((await c('/api/snapshot', { cwd: os.homedir() })).code, 'cwd_forbidden');
    assert.strictEqual((await c('/api/restore', { cwd: os.homedir(), snap: 'a'.repeat(40) })).code, 'cwd_forbidden');
    assert.strictEqual((await c('/api/snapshot', { cwd: path.join(root, 'proj') })).snap, null, 'git deposu değil: anlık görüntü yok');
    assert.strictEqual((await c('/api/restore', { cwd: path.join(root, 'proj'), snap: 'zzz' })).code, 'bad_snap');
    assert.strictEqual((await post('/api/snapshot', { cwd: root }, { 'x-observatory-token': 'yanlis' })).status, 403);
  }
  console.log('✔ web: arayüz + CSP, yapılandırma, jeton/Origin/Sec-Fetch-Site korumaları, doğrulamalar, gönder -> SSE');
} finally {
  server.close();
  server.closeAllConnections?.();
}
