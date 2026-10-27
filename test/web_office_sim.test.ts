// web_office_sim: SSE olaylarının ofis animasyon durumuna eşlenmesi + CSP uyumu (harici kaynak yok)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const webDir = path.join(import.meta.dirname, '..', 'web');
const src = fs.readFileSync(path.join(webDir, 'office_sim.js'), 'utf8');
const ctx: any = {}; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const O = ctx.ObsOffice;
assert.ok(O, 'ObsOffice tanımlı');

assert.equal(O.classifyTool('Edit'), 'typing');
assert.equal(O.classifyTool('write_file'), 'typing');
assert.equal(O.classifyTool('Bash'), 'typing');
assert.equal(O.classifyTool('read_file'), 'reading');
assert.equal(O.classifyTool('Grep'), 'reading');
assert.equal(O.classifyTool('search_web'), 'reading');

const ev = (agent: string, type: string, data: any = {}, taskId = 't1') => ({ agent, type, data, taskId });
const run = (s: any, sec: number) => { for (let i = 0; i < sec * 20; i++) O.step(s, 0.05); };

const s = O.createState();
const c = s.agents.claude;
assert.equal(O.poseOf(c), 'idle');
const restX = c.x;

// yazma aracı: masaya yürür, yazar
O.feed(s, ev('claude', 'task.started'));
O.feed(s, ev('claude', 'tool.invoked', { name: 'Edit' }));
run(s, 0.1); assert.equal(O.poseOf(c), 'walking');
run(s, 6); assert.equal(O.poseOf(c), 'typing'); assert.ok(c.x < restX);

// okuma aracı: kitaplığa gider
O.feed(s, ev('claude', 'tool.invoked', { name: 'Read' }));
run(s, 6); assert.equal(O.poseOf(c), 'reading');

// izin bekleme: kalıcı ünlem; çözülünce rozet değişir
O.feed(s, ev('claude', 'permission.requested'));
run(s, 6); assert.equal(O.poseOf(c), 'waiting'); assert.equal(c.badge.kind, 'ask');
run(s, 5); assert.equal(c.badge.kind, 'ask');
O.feed(s, ev('claude', 'permission.resolved', { decision: 'deny' }));
assert.equal(c.badge.kind, 'deny');

// tamamlanma: yeşil onay, sayaç, sonra dinlenme alanı
O.feed(s, ev('claude', 'task.completed'));
assert.equal(c.badge.kind, 'ok'); assert.equal(c.doneCount, 1);
run(s, 4); assert.equal(c.badge, null);
run(s, 6); assert.equal(O.poseOf(c), 'idle'); assert.ok(c.x > 200);

// bitmiş görevin geç olayı ajanı canlandırmaz
O.feed(s, ev('claude', 'message.delta'));
run(s, 6); assert.equal(O.poseOf(c), 'idle');

// başarısız görev + bilinmeyen ajan
O.feed(s, ev('codex', 'task.started', {}, 't2')); O.feed(s, ev('codex', 'task.failed', {}, 't2'));
assert.equal(s.agents.codex.badge.kind, 'deny'); assert.equal(s.agents.codex.failCount, 1);
assert.equal(O.feed(s, ev('hermes', 'task.started')), null);

// çizim hatasız çalışır (sahte 2D bağlam)
const calls: string[] = [];
const g: any = new Proxy({}, { get: (_t, k) => (k === 'fillStyle' || k === 'font' || k === 'textAlign' ? undefined : () => calls.push(String(k))), set: () => true });
O.drawScene(g, s);
assert.ok(calls.length > 100, String(calls.length));

// CSP: harici kaynak yok, sayfa betiği 'self'
assert.ok(!/https?:\/\/|eval\(|new Function|innerHTML/.test(src), 'harici/yasaklı kalıp');
const html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
assert.ok(html.includes('id="officeCanvas"') && html.includes('src="/office_sim.js'));
assert.ok(!/<script[^>]*src="https?:/.test(html));
console.log('web_office_sim OK');
