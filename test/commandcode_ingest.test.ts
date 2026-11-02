// Tier 3: Command Code oturum kayıtlarından (~/.commandcode/projects/<proje>/<oturum>.jsonl) olay üretimi.
import assert from 'node:assert';
import { CommandCodeLineParser, commandCodeSessionIdFromPath, countCommandCodeTurns } from '../src/ingest/commandcode.ts';
import type { ExtEvent } from '../src/ingest/core.ts';

const SID = '9974043a-a910-4e4a-8f42-31b2e9335b98';
const feed = (p: { push(l: string, k: string): ExtEvent[] }, lines: object[]) =>
  lines.flatMap((o, i) => p.push(JSON.stringify(o), 'f.jsonl:' + i * 100));
const types = (evs: ExtEvent[]) => evs.map((e) => e.type);

const head = { type: 'session', version: 3, id: SID, cwd: 'C:\\proje', timestamp: '2026-10-31T12:42:48.836Z' };
const userPrompt = {
  type: 'message', timestamp: '2026-10-31T12:43:19.848Z',
  message: { role: 'user', content: [{ type: 'text', text: 'Bir şey yap' }] }
};
const assistantTool = {
  type: 'message', timestamp: '2026-10-31T12:43:20.000Z',
  message: {
    role: 'assistant',
    content: [
      { type: 'thinking', thinking: 'düşün' },
      { type: 'text', text: 'Bakıyorum' },
      { type: 'tool_use', id: 'call_1', name: 'powershell', input: { command: 'ls' } }
    ]
  }
};
const toolResult = {
  type: 'message', timestamp: '2026-10-31T12:43:21.000Z',
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: [{ type: 'text', text: 'dosya' }] }] }
};
const assistantFinal = {
  type: 'message', timestamp: '2026-10-31T12:43:22.000Z',
  message: { role: 'assistant', content: [{ type: 'text', text: 'Bitti' }] }
};

const evs = feed(new CommandCodeLineParser(), [head, userPrompt, assistantTool, toolResult, assistantFinal]);
assert.deepStrictEqual(types(evs),
  ['task.started', 'message.delta', 'message.delta', 'tool.invoked', 'tool.completed', 'message.delta', 'task.completed'],
  'command code olay sırası');
assert.strictEqual(evs[0].data.prompt, 'Bir şey yap');
assert.strictEqual(evs[0].data.cwd, 'C:\\proje', 'oturum başlığındaki cwd göreve taşınmalı');
assert.strictEqual(evs[0].sessionId, SID);
assert.strictEqual(evs[0].taskId, 'ext_commandcode_9974043aa9_1');
assert.ok(evs.every((e) => e.agent === 'commandcode'), 'tüm olaylar commandcode ajanına ait olmalı');
assert.strictEqual(evs[1].data.thinking, 'düşün', 'thinking ayrı olay olarak yazılmalı');
assert.strictEqual(evs[2].data.text, 'Bakıyorum');
assert.deepStrictEqual(evs[3].data.input, { command: 'ls' });
assert.strictEqual(evs[4].data.output, 'dosya');
assert.strictEqual(evs[6].taskId, 'ext_commandcode_9974043aa9_1', 'araçsız nihai yanıt turu kapatır');

// İkinci istem: önceki tur kapanır, yeni görev açılır
const two = feed(new CommandCodeLineParser(), [
  head, userPrompt,
  { type: 'message', timestamp: '2026-10-31T12:44:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'ikinci istem' }] } }
]);
assert.deepStrictEqual(types(two), ['task.started', 'task.completed', 'task.started'], 'yeni istem önceki turu kapatmalı');
assert.strictEqual(two[2].taskId, 'ext_commandcode_9974043aa9_2');

// Observatory'nin kendi başlattığı oturum çift kaydedilmemeli
assert.strictEqual(feed(new CommandCodeLineParser(() => true), [head, userPrompt, assistantFinal]).length, 0);

// Checkpoint satırları (kayıt değil, dosya anlık görüntüsü) yok sayılmalı
assert.deepStrictEqual(feed(new CommandCodeLineParser(), [{ id: 'cp1', turnNumber: 1, files: [] }]), []);

// Canlı takip: dosya sonundan başlarken oturum kimliği dosya adından, tur numarası önceki istemlerden gelir
const chunk = [head, userPrompt, assistantFinal,
  { type: 'message', timestamp: '2026-10-31T12:44:30.000Z', message: { role: 'user', content: [{ type: 'text', text: 'üçüncü istem' }] } }
].map((o) => JSON.stringify(o)).join('\n');
assert.strictEqual(commandCodeSessionIdFromPath('C:\\x\\projects\\p\\' + SID + '.jsonl'), SID);
assert.strictEqual(commandCodeSessionIdFromPath('C:\\x\\projects\\p\\' + SID + '.checkpoints.jsonl'), SID);
assert.strictEqual(countCommandCodeTurns(chunk), 2, 'yalnızca gerçek istemler sayılmalı (tool_result hariç)');
const tail = new CommandCodeLineParser(() => false, SID, countCommandCodeTurns(chunk));
const next = tail.push(JSON.stringify({ type: 'message', timestamp: '2026-10-31T12:45:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'dördüncü istem' }] } }), 'f.jsonl:900');
assert.strictEqual(next[0].taskId, 'ext_commandcode_9974043aa9_3', 'canlı takipte tur numarası devam etmeli');
assert.strictEqual(next[0].sessionId, SID);

console.log('✔ commandcode_ingest: oturum/istem/araç/thinking olayları, tur kapanışı ve canlı takip doğrulandı');
