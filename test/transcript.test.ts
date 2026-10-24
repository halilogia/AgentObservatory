// Oturum dökümü: her ajan kendi CLI görünümünde çizilmeli (düz metin kipinde işaretleri doğrular)
import assert from 'node:assert';
import { TranscriptRenderer } from '../src/ui/transcript.ts';
import { describeTool } from '../src/ui/skins.ts';

function render(agent: string, events: Array<[string, any]>, color = false): string {
  let out = '';
  const r = new TranscriptRenderer((s) => { out += s; }, { color });
  let t = 1000;
  for (const [type, data] of events) r.push({ taskId: 'task_x', agent, type, data, timestamp: (t += 1000) });
  r.end();
  return out;
}

const flow: Array<[string, any]> = [
  ['task.started', { prompt: 'Dosyayı oku', cwd: 'C:\\Users\\Kullanici\\Desktop\\proje' }],
  ['message.delta', { text: 'Bakıyorum.\nİkinci satır' }],
  ['tool.invoked', { name: 'Read', input: { file_path: 'C:\\Users\\Kullanici\\Desktop\\proje\\src\\a.ts' } }],
  ['tool.completed', { output: 'l1\nl2\nl3\nl4\nl5' }],
  ['usage.updated', { usage: { input_tokens: 2000, output_tokens: 50 } }],
  ['task.completed', { exitCode: 0 }]
];

// Claude: ● işareti, > istem, ⎿ sonuç, devam satırı girintili
const claude = render('claude', flow);
assert.ok(claude.includes('* Claude Code') && claude.includes('> Dosyayı oku'), 'claude başlık + istem');
assert.ok(claude.includes('● Bakıyorum.\n  İkinci satır'), 'claude asistan bloğu ve girinti');
assert.ok(claude.includes('● Read(') && claude.includes('⎿  l1') && claude.includes('… +2 lines'), 'claude araç + kısaltılmış sonuç');
assert.ok(claude.includes('Worked for 5s') && claude.includes('in 2.0k'), 'claude alt bilgi');

// Codex: › istem, • madde, └ sonuç
const codex = render('codex', flow);
assert.ok(codex.includes('>_ OpenAI Codex') && codex.includes('› Dosyayı oku'), 'codex başlık + istem');
assert.ok(codex.includes('• Bakıyorum.') && codex.includes('• Explored') && codex.includes('└ l1'), 'codex madde + araç + sonuç');

// agy ve opencode
const agy = render('agy', flow);
assert.ok(agy.includes('▲ Antigravity CLI') && agy.includes('◆ Bakıyorum.') && agy.includes('▲ Done'), 'agy teması');
const oc = render('opencode', flow);
assert.ok(oc.includes('> build ·') && oc.includes('┃ Dosyayı oku') && oc.includes('← Read'), 'opencode teması');

// agy'nin ikinci task.started olayı başlığı tekrarlamaz
const dup = render('agy', [['task.started', { prompt: 'x' }], ['task.started', { model: 'gemini-3.8-flash-low' }]]);
assert.strictEqual(dup.split('Antigravity CLI').length - 1, 1, 'başlık bir kez çizilmeli');

// başarısız görev: hata türü görünür
const failed = render('codex', [['task.started', { prompt: 'x' }], ['task.failed', { error: '429 usage limit reached', errorKind: 'rate_limit' }]]);
assert.ok(failed.includes('Failed') && failed.includes('[rate_limit]'), 'hata türü gösterilmeli');

// renk açıkken ANSI kaçışları var, kapalıyken yok
assert.ok(render('claude', flow, true).includes('\x1b['), 'renkli kip ANSI üretmeli');
assert.ok(!claude.includes('\x1b['), 'düz kip ANSI üretmemeli');

// çok uzun istem kısaltılır
const long = render('claude', [['task.started', { prompt: Array.from({ length: 30 }, (_, i) => 'satır ' + i).join('\n') }]]);
assert.ok(long.includes('… +20 satır'), 'uzun istem kısaltılmalı');

// araç adı normalizasyonu
assert.strictEqual(describeTool('run_command', { CommandLine: 'npm test' }).kind, 'exec');
assert.strictEqual(describeTool('Grep', { pattern: 'foo' }).kind, 'search');
assert.strictEqual(describeTool('replace_file_content', { TargetFile: 'a.ts' }).kind, 'edit');
console.log('✔ transcript: claude / codex / agy / opencode görünümleri, kısaltma, hata türü, renk kipi');

// token alan adları adaptörlere göre değişir: camelCase (codex, claude) da toplanmalı
const camel = render('codex', [['task.started', { prompt: 'x' }], ['usage.updated', { usage: { inputTokens: 1500, outputTokens: 20 } }], ['task.completed', { exitCode: 0 }]]);
assert.ok(camel.includes('in 1.5k') && camel.includes('out 20'), 'inputTokens/outputTokens okunmalı');
console.log('✔ transcript: camelCase token alanları');
