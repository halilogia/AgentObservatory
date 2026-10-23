// Tier 3: elle başlatılan Claude / Codex / OpenCode oturumlarının kayıt dosyalarından olay üretimi.
// Satır biçimleri gerçek dosyalardan (2026-10-23) alındı; içerikler kısaltıldı.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { ClaudeLineParser } from '../src/ingest/claude.ts';
import { CodexLineParser } from '../src/ingest/codex.ts';
import { OpenCodeDbSource } from '../src/ingest/opencode.ts';
import { isInjectedText, toTaskEvent } from '../src/ingest/core.ts';
import type { ExtEvent } from '../src/ingest/core.ts';

const feed = (p: { push(l: string, k: string): ExtEvent[] }, lines: object[]) =>
  lines.flatMap((o, i) => p.push(JSON.stringify(o), 'f.jsonl:' + i * 100));
const types = (evs: ExtEvent[]) => evs.map((e) => e.type);

// ---------- Claude ----------
const SID = '024d25c1-eb9f-4ea6-b393-7be53dbd1624';
const claudeLines = [
  { type: 'queue-operation', sessionId: SID },
  { type: 'user', sessionId: SID, cwd: 'C:\\proje', timestamp: '2026-10-23T19:00:00.000Z', isSidechain: false,
    message: { role: 'user', content: [{ type: 'text', text: '<system-reminder>\ngizli bağlam\n</system-reminder>' }, { type: 'text', text: 'Dosyayı oku' }] } },
  { type: 'assistant', sessionId: SID, timestamp: '2026-10-23T19:00:01.000Z', isSidechain: false,
    message: { id: 'msg_1', stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: 'a.ts' } }] } },
  { type: 'assistant', sessionId: SID, timestamp: '2026-10-23T19:00:01.500Z', isSidechain: true,
    message: { id: 'msg_s', stop_reason: 'end_turn', content: [{ type: 'text', text: 'alt ajan sesi' }] } },
  { type: 'user', sessionId: SID, timestamp: '2026-10-23T19:00:02.000Z', isSidechain: false,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: 'satır1\nsatır2' }] }] } },
  { type: 'assistant', sessionId: SID, timestamp: '2026-10-23T19:00:03.000Z', isSidechain: false,
    message: { id: 'msg_2', stop_reason: 'end_turn', usage: { input_tokens: 20, output_tokens: 7 }, content: [{ type: 'text', text: 'Tamam.' }] } },
  { type: 'user', sessionId: SID, timestamp: '2026-10-23T19:01:00.000Z', isSidechain: false, message: { role: 'user', content: 'ikinci istem' } }
];
const cl = feed(new ClaudeLineParser(), claudeLines);
assert.deepStrictEqual(types(cl), ['task.started', 'tool.invoked', 'usage.updated', 'tool.completed', 'message.delta', 'usage.updated', 'task.completed', 'task.started'], 'claude olay sırası');
assert.strictEqual(cl[0].data.prompt, 'Dosyayı oku', 'sistem bağlamı istemden ayıklanmalı');
assert.strictEqual(cl[0].taskId, 'ext_claude_024d25c1eb_1');
assert.strictEqual(cl[7].taskId, 'ext_claude_024d25c1eb_2', 'her kullanıcı istemi yeni görev');
assert.strictEqual(cl[3].data.output, 'satır1\nsatır2');
assert.ok(!cl.some((e) => JSON.stringify(e.data).includes('alt ajan')), 'alt ajan (sidechain) satırları atlanmalı');
assert.strictEqual(feed(new ClaudeLineParser(() => true), claudeLines).length, 0, 'Observatory zaten kaydettiyse atlanmalı');

// ---------- Codex ----------
const cxHead = [
  { timestamp: '2026-10-24T00:00:00.000Z', type: 'session_meta', payload: { id: '01a16a92-07db-7d02-b188-1e5dcd8e2666', cwd: 'C:\\swt' } },
  { timestamp: '2026-10-24T00:00:00.100Z', type: 'turn_context', payload: { cwd: 'C:\\swt', model: 'gpt-6-astra' } },
  { timestamp: '2026-10-24T00:00:00.200Z', type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'talimat' }] } },
  { timestamp: '2026-10-24T00:00:00.300Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<recommended_plugins>\nliste\n</recommended_plugins>' }] } },
  { timestamp: '2026-10-24T00:00:00.400Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Testi çalıştır' }] } }
];
const cxOk = feed(new CodexLineParser(), [
  ...cxHead,
  { timestamp: '2026-10-24T00:00:01.000Z', type: 'response_item', payload: { type: 'function_call', name: 'shell', call_id: 'c1', arguments: '{"command":"npm test"}' } },
  { timestamp: '2026-10-24T00:00:02.000Z', type: 'response_item', payload: { type: 'function_call_output', call_id: 'c1', output: [{ type: 'input_text', text: 'OK 9 tests' }] } },
  { timestamp: '2026-10-24T00:00:03.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Geçti.' }] } },
  { timestamp: '2026-10-24T00:00:03.100Z', type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 100, output_tokens: 9 } } } },
  { timestamp: '2026-10-24T00:00:03.200Z', type: 'event_msg', payload: { type: 'task_complete', last_agent_message: 'Geçti.' } }
]);
assert.deepStrictEqual(types(cxOk), ['task.started', 'tool.invoked', 'tool.completed', 'message.delta', 'usage.updated', 'task.completed'], 'codex olay sırası (enjekte edilen bağlam istem sayılmamalı)');
assert.strictEqual(cxOk[0].data.prompt, 'Testi çalıştır');
assert.deepStrictEqual(cxOk[1].data.input, { command: 'npm test' }, 'arguments JSON olarak çözülmeli');
assert.strictEqual(cxOk[2].data.output, 'OK 9 tests');

const cxLimit = feed(new CodexLineParser(), [
  ...cxHead,
  { timestamp: '2026-10-24T00:00:02.000Z', type: 'event_msg', payload: { type: 'task_complete', error: { message: "You've hit your usage limit. try again at 2:29 AM." } } }
]);
assert.strictEqual(cxLimit[cxLimit.length - 1].type, 'task.failed', 'kota hatası task.failed olmalı');
assert.strictEqual((cxLimit[cxLimit.length - 1].data as any).errorKind, 'rate_limit');

const cxGuardian = feed(new CodexLineParser(), [
  cxHead[0],
  { type: 'event_msg', payload: { type: 'task_started', turn_attribution: { turn_trigger: 'guardian_review' } } },
  ...cxHead.slice(1)
]);
assert.strictEqual(cxGuardian.length, 0, 'koruyucu inceleme alt oturumu atlanmalı');

// ---------- OpenCode (geçici SQLite) ----------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-oc-'));
const dbPath = path.join(dir, 'opencode.db');
const w = new DatabaseSync(dbPath);
w.exec(`CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT);
        CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
        CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);`);
w.prepare('INSERT INTO session VALUES (?, ?)').run('ses_abcdef123456', 'C:/swt');
const msg = w.prepare('INSERT INTO message VALUES (?, ?, ?, ?, ?)');
const part = w.prepare('INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)');
msg.run('m1', 'ses_abcdef123456', 1, 1, JSON.stringify({ role: 'user' }));
msg.run('m2', 'ses_abcdef123456', 2, 2, JSON.stringify({ role: 'assistant' }));
part.run('p1', 'm1', 'ses_abcdef123456', 1, 1000, JSON.stringify({ type: 'text', text: 'a.txt oku' }));
part.run('p2', 'm2', 'ses_abcdef123456', 2, 2000, JSON.stringify({ type: 'tool', tool: 'read', callID: 'call1', state: { status: 'completed', input: { filePath: 'a.txt' }, output: 'hello' } }));
part.run('p3', 'm2', 'ses_abcdef123456', 3, 3000, JSON.stringify({ type: 'text', text: 'hello', time: { end: 3000 } }));
part.run('p4', 'm2', 'ses_abcdef123456', 4, 4000, JSON.stringify({ type: 'step-finish', reason: 'stop', tokens: { input: 50, output: 3 } }));
w.close();
const oc = new OpenCodeDbSource(() => false, 0, dbPath);
const ocEv = oc.poll();
assert.deepStrictEqual(types(ocEv), ['task.started', 'tool.invoked', 'tool.completed', 'message.delta', 'usage.updated', 'task.completed'], 'opencode olay sırası');
assert.strictEqual(ocEv[0].taskId, 'ext_opencode_sesabcdef1_1');
assert.strictEqual(oc.poll().length, 0, 'ikinci yoklamada yeni olay yok');
oc.close();

// ---------- Tekrar yazma güvenliği ve enjekte metin ----------
const mem = new SqliteStore(':memory:');
for (let round = 0; round < 2; round++) cl.forEach((e) => mem.recordEvent(toTaskEvent(e)));
assert.strictEqual(mem.getEvents('ext_claude_024d25c1eb_1').length, 7, 'aynı satır iki kez yazılmamalı');
assert.strictEqual(mem.getTask('ext_claude_024d25c1eb_1')?.status, 'completed');
assert.ok(isInjectedText('<recommended_plugins>\nx\n</recommended_plugins>'), 'etiketli bağlam bloğu enjekte sayılmalı');
assert.ok(!isInjectedText('Normal bir istem'), 'normal istem enjekte sayılmamalı');
console.log('✔ ingest: claude / codex (kota hatası dahil) / opencode ayrıştırma, tekrar yazma güvenliği');
