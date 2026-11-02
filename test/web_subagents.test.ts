// web/subagents.js: alt ajanları sohbetteki Task/Agent araç satırına bağlar, özetler, canlı sayaç.
import assert from 'node:assert';
import '../web/subagents.js';

const S = (globalThis as any).ObsSubagents;
const NOW = 2_000_000_000;
const msgs: any[] = [
  { r: 'u', text: 'x' },
  { r: 'b', taskId: 'T1', parts: [
    { k: 'text', v: 'basliyorum' },
    { k: 'tool', name: 'Agent', input: { prompt: 'birinci gorev' }, summary: '' },
    { k: 'tool', name: 'Read', input: {}, summary: '' },
    { k: 'tool', name: 'Task', input: { prompt: 'ikinci gorev' }, summary: '' }
  ] }
];
const ev = (type: string, data: object, timestamp: number) => ({ type, data, timestamp });
const subs = [
  { task_id: 's2', parent_task_id: 'T1', agent: 'claude', model: 'm', status: 'running', prompt: 'ikinci gorev', start_time: NOW - 5000, end_time: null, events: [ev('tool.invoked', { name: 'Bash' }, NOW - 4000)] },
  { task_id: 's1', parent_task_id: 'T1', agent: 'claude', model: 'm', status: 'completed', prompt: 'birinci gorev', start_time: NOW - 20000, end_time: NOW - 10000, events: [
    ev('tool.invoked', { name: 'Read' }, NOW - 19000), ev('tool.invoked', { name: 'Read' }, NOW - 18000),
    ev('message.delta', { text: 'ara not ' }, NOW - 17000), ev('tool.invoked', { name: 'Grep' }, NOW - 16000),
    ev('message.delta', { text: 'sonuc: iyi' }, NOW - 11000)] },
  { task_id: 's3', parent_task_id: 'T1', agent: 'claude', model: 'm', status: 'failed', prompt: 'eslesmeyen', start_time: NOW - 3000, end_time: NOW - 2000, events: [ev('task.failed', { error: 'patladi' }, NOW - 2000)] }
];
const running = S.attach(msgs, subs, NOW);
assert.strictEqual(running, 1, 'bir alt ajan çalışıyor');
const parts = msgs[1].parts;
assert.strictEqual(parts[1].subs[0].id, 's1', 'istem eşleşmesi: birinci araç satırı');
assert.strictEqual(parts[3].subs[0].id, 's2', 'istem eşleşmesi: ikinci araç satırı');
assert.ok(!parts[2].subs, 'Read satırına alt ajan bağlanmaz');
assert.strictEqual(parts[parts.length - 1].subs[0].id, 's3', 'eşleşmeyen alt ajan için yapay araç satırı');
assert.strictEqual(msgs[1].subRun, 1, 'son tur çalışan sayacını taşır');

const s1 = parts[1].subs[0];
assert.strictEqual(s1.status, 'done');
assert.strictEqual(s1.sec, 10);
assert.strictEqual(s1.toolCount, 3);
assert.deepStrictEqual(s1.tools, [{ name: 'Read', count: 2 }, { name: 'Grep', count: 1 }]);
assert.strictEqual(s1.reply, 'sonuc: iyi', 'son yanıt: son araçtan sonraki metin');
assert.strictEqual(parts[3].subs[0].status, 'running');
assert.strictEqual(parts[3].subs[0].sec, 5, 'çalışan alt ajan süresi şimdiye kadar');
assert.strictEqual(parts[parts.length - 1].subs[0].status, 'error');
assert.strictEqual(parts[parts.length - 1].subs[0].error, 'patladi');
assert.strictEqual(S.statusOf({ status: 'running', start_time: NOW - 2 * 3600_000 }, NOW), 'stopped', 'bir saatten eski çalışıyor kaydı');
assert.strictEqual(S.text('live', 'tr', { n: 2 }), '2 alt ajan çalışıyor');
assert.strictEqual(S.text('badge', 'tr', { n: 3 }), '3 alt ajan');
assert.strictEqual(S.attach([{ r: 'u', text: 'a' }], [], NOW), 0, 'alt ajan yoksa sıfır');

// Antigravity tarzı Sağ Yan Panel (Split View) ve dosya farkı özeti testi
const pixelSub = S.summarize({
  task_id: 'sub_pxl_1',
  parent_task_id: 'T1',
  agent: 'agy',
  model: 'gemini-4-argon-medium',
  status: 'completed',
  prompt: 'Create a 16x16 pixel art server rack animation with pxl.js',
  start_time: NOW - 420_000,
  end_time: NOW,
  events: [
    ev('tool.invoked', { name: 'write_file', input: { Path: 'office_props.px.js', Content: 'a\n'.repeat(126) + 'b' } }, NOW - 300_000),
    ev('message.delta', { text: 'Tasarım ve derleme işlemi tamamlandı; detaylı asset yolları ana ajana ( ea6de370-2461-403f-81a4-080391a4e1aa ) mesaj olarak iletildi.' }, NOW - 10_000)
  ]
}, NOW);
assert.strictEqual(pixelSub.roleName, 'Pixel Artist', 'piksel sanat isteminden Pixel Artist rolü çıkarılmalı');
assert.strictEqual(pixelSub.files.length, 1, 'değişen dosya sayısı 1 olmalı');
assert.strictEqual(pixelSub.files[0].path, 'office_props.px.js');
assert.strictEqual(pixelSub.totalAdd, 127, '+127 satır ekleme hesaplanmalı');
assert.strictEqual(pixelSub.totalDel, 0, '-0 satır silme hesaplanmalı');
console.log('web_subagents OK');
