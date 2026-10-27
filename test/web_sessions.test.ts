// web/sessions.js + src/commands/web_sessions.ts: TUI/terminal oturumunun web sohbetine dönüşmesi
import assert from 'node:assert';
import fs from 'node:fs';
import '../web/sessions.js';
import { groupSessions, sessionEvents } from '../src/commands/web_sessions.ts';

const NOW = 2_000_000_000;
// 1) oturum listesi: satırlar yeniden eskiye; başlık en eski istemden, canlılık saat sınırıyla
const rows = [
  { task_id: 't3', session_id: 'S1', agent: 'claude', model: 'sonnet', status: 'running', prompt: 'üçüncü', start_time: NOW - 1000, end_time: null },
  { task_id: 't2', session_id: 'S1', agent: 'claude', model: 'sonnet', status: 'completed', prompt: 'ikinci', start_time: NOW - 5000, end_time: NOW - 4000 },
  { task_id: 't1', session_id: 'S1', agent: 'claude', model: 'sonnet', status: 'completed', prompt: 'ilk istem', start_time: NOW - 9000, end_time: NOW - 8000 },
  { task_id: 'o1', session_id: 'S2', agent: 'codex', model: 'gpt', status: 'running', prompt: 'eski', start_time: NOW - 3 * 3600_000, end_time: null }
];
const list = groupSessions(rows, NOW);
assert.strictEqual(list.length, 2);
assert.deepStrictEqual([list[0].id, list[0].turns, list[0].title, list[0].running], ['S1', 3, 'ilk istem', true]);
assert.strictEqual(list[1].running, false, 'bir saatten eski çalışıyor kaydı canlı sayılmaz');

// 2) olay süzme: son tur dışındaki / 1 sn'den kısa iptaller ve oturum dışı görevler atılır
const tasks = [{ task_id: 'a', start_time: 1000 }, { task_id: 'b', start_time: 5000 }];
const raw = [
  { task_id: 'a', type: 'task.started', data: '{"prompt":"merhaba"}', timestamp: 1000 },
  { task_id: 'a', type: 'task.cancelled', data: '{}', timestamp: 1100 },
  { task_id: 'zzz', type: 'message.delta', data: '{"text":"x"}', timestamp: 1200 },
  { task_id: 'b', type: 'task.started', data: '{"prompt":"devam"}', timestamp: 5000 },
  { task_id: 'b', type: 'message.delta', data: '{bozuk', timestamp: 5100 }
];
const ev = sessionEvents(tasks, raw);
assert.deepStrictEqual(ev.map((e) => e.type), ['task.started', 'task.started', 'message.delta']);
assert.deepStrictEqual(ev[2].data, {}, 'bozuk JSON boş nesneye düşer');

// 3) olaylar → web mesajları
const S = (globalThis as any).ObsSessions;
assert.ok(S, 'ObsSessions yüklenmeli');
const h = { toolKind: (n: string) => (n === 'Bash' ? 'term' : 'generic'), toolSummary: (n: string, i: any) => (i && i.command) || n, color: () => '#f60' };
const sess = {
  tasks: [{ task_id: 'a', agent: 'claude', model: 'sonnet', prompt: 'listele', start_time: 0 }],
  events: [
    { taskId: 'a', type: 'task.started', data: { prompt: 'listele', cwd: 'C:/x' }, timestamp: 0 },
    { taskId: 'a', type: 'message.delta', data: { text: 'Bakıyorum. ' }, timestamp: 10 },
    { taskId: 'a', type: 'message.delta', data: { text: 'Tamam.' }, timestamp: 20 },
    { taskId: 'a', type: 'tool.invoked', data: { id: 'u1', name: 'Bash', input: { command: 'ls' } }, timestamp: 30 },
    { taskId: 'a', type: 'tool.completed', data: { toolUseId: 'u1', output: 'a\nb' }, timestamp: 40 },
    { taskId: 'a', type: 'message.delta', data: { text: 'Bitti.' }, timestamp: 50 },
    { taskId: 'a', type: 'usage.updated', data: { usage: { input_tokens: 5, output_tokens: 7 } }, timestamp: 55 },
    { taskId: 'a', type: 'task.completed', data: {}, timestamp: 3000 }
  ]
};
const msgs = S.toChat(sess, h);
assert.strictEqual(msgs.length, 2);
assert.deepStrictEqual(msgs[0], { r: 'u', text: 'listele' });
const bot = msgs[1];
assert.deepStrictEqual(bot.parts.map((p: any) => p.k), ['text', 'tool', 'text']);
assert.strictEqual(bot.parts[0].v, 'Bakıyorum. Tamam.');
assert.deepStrictEqual([bot.parts[1].kind, bot.parts[1].summary, bot.parts[1].out], ['term', 'ls', 'a\nb']);
assert.deepStrictEqual(bot.meta, { sec: 3, tin: 5, tout: 7 });
assert.strictEqual(bot.cwd, 'C:/x');
assert.ok(!('_cur' in bot) && !('_tools' in bot), 'iç alanlar temizlenmeli');

// 4) sayfa bağlantıları
const html = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
for (const id of ['projectMenu', 'modelMenu', 'attachMenu', 'slashMenu', 'runCard', 'history']) assert.ok(html.includes(`id="${id}"`), `index.html #${id} içermeli`);
assert.ok(html.includes('src="/sessions.js'));
assert.ok(!/\sstyle="/.test(html), 'satır içi style CSP tarafından engellenir');
// app.js'in $('#...') ile eriştiği her öğe HTML'de olmalı (başlatma çökmesini önler)
const app = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const missing = [...new Set([...app.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]))].filter((i) => !html.includes(`id="${i}"`) && !new RegExp(`\\.id = '${i}'|id: '${i}'`).test(app));
assert.deepStrictEqual(missing, [], 'app.js bu öğelere erişiyor ama index.html içinde yok');
console.log('web_sessions OK');
