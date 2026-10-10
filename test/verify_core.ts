import assert from 'node:assert';
import { EventStore } from '../src/core/event_store.ts';
import { createEvent } from '../src/core/types.ts';
import { ClaudeAdapter } from '../src/adapters/claude_adapter.ts';
import { CodexAdapter } from '../src/adapters/codex_adapter.ts';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { validateCwd } from '../src/core/paths.ts';

console.log('🧪 Agent Observatory Kapsamlı Hardening & Doğrulama Testi Başlatılıyor...\n');

// 1. İZOLASYON: Geçici/In-Memory SQLite Veritabanı
console.log('1. İzole In-Memory SQLite Veritabanı Test Ediliyor...');
const memSqlite = new SqliteStore(':memory:');
assert.ok(memSqlite, 'In-memory test SQLite deposu başlatılmalı');
console.log('✔ İzole veritabanı hazır (Kullanıcının asıl veritabanına dokunulmuyor)!\n');

// 2. GÜVENLİK: Varsayılan İzinler & CWD Doğrulaması
console.log('2. Güvenlik Denetimleri (Safe Defaults & CWD Validation) Test Ediliyor...');
const claude = new ClaudeAdapter();
const codex = new CodexAdapter();

// A. Claude varsayılan izin kontrolü
const clCmd = claude.buildCommand({ prompt: 'test prompt' });
assert.ok(!clCmd.args.includes('--dangerously-skip-permissions'), 'Claude varsayılan olarak TEHLİKELİ izinleri atlamamalı!');

// B. Codex varsayılan sandbox kontrolü
const cxCmd = codex.buildCommand({ prompt: 'test prompt' });
assert.ok(cxCmd.args.includes('workspace-write'), 'Codex varsayılan olarak workspace-write sandbox kullanmalı!');
assert.ok(!cxCmd.args.includes('danger-full-access'), 'Codex asla varsayılan olarak danger-full-access olmamalı!');

// C. CWD Doğrulama
assert.throws(() => {
  validateCwd('C:\\NonExistentDirectory_12345');
}, /Geçersiz veya bulunamayan çalışma dizini/, 'Var olmayan dizin reddedilmeli');

assert.throws(() => {
  validateCwd('C:\\Windows\\System32');
}, /Sistem dizinlerinde görev çalıştırmak güvenlik nedeniyle engellendi/, 'Sistem kök dizinleri engellenmeli');

console.log('✔ Güvenlik varsayılanları ve dizin doğrulaması başarıyla geçti!\n');

// 3. DOĞRULUK: Paralel Codex Görevlerinde Oturum İzolasyonu
console.log('3. Paralel Görevlerde Oturum İzolasyonu (Session Isolation) Test Ediliyor...');
const codexStore = new EventStore({ sqliteStore: memSqlite });

// Görev A ve Görev B eşzamanlı olarak aynı adapter üzerinden yürütülüyor
const taskA = 'task_codex_parallel_A';
const taskB = 'task_codex_parallel_B';

codex.buildCommand({ taskId: taskA, prompt: 'Task A' });
codex.buildCommand({ taskId: taskB, prompt: 'Task B' });

// Görev A oturum başlatır
codex.handleStdoutLine(JSON.stringify({ type: 'thread.started', thread_id: 'thread_AAA' }), taskA, codexStore);
// Görev B oturum başlatır
codex.handleStdoutLine(JSON.stringify({ type: 'thread.started', thread_id: 'thread_BBB' }), taskB, codexStore);

// Görev A mesaj üretir
codex.handleStdoutLine(
  JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Mesaj A' } }),
  taskA,
  codexStore
);
// Görev B mesaj üretir
codex.handleStdoutLine(
  JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Mesaj B' } }),
  taskB,
  codexStore
);

const stateA = codexStore.getTask(taskA);
const stateB = codexStore.getTask(taskB);

assert.strictEqual(stateA?.sessionId, 'thread_AAA', 'Görev A kendi thread_AAA oturumunu korumalı');
assert.strictEqual(stateB?.sessionId, 'thread_BBB', 'Görev B kendi thread_BBB oturumunu korumalı');
assert.notStrictEqual(stateA?.sessionId, stateB?.sessionId, 'Paralel görevlerin oturumları asla birbirine karışmamalı!');
console.log('✔ Paralel görev oturum izolasyonu başarıyla doğrulandı!\n');

// 4. İPTAL DURUM MAKİNESİ: Değiştirilemez Terminal Durumu (Immutable Terminal State)
console.log('4. İptal Durum Makinesi ve Terminal Durum Güvencesi Test Ediliyor...');
const cancelStore = new EventStore({ sqliteStore: memSqlite });
const cancelTaskId = 'task_cancel_test_1';

// Görev başlar
cancelStore.recordEvent(createEvent({
  taskId: cancelTaskId,
  agent: 'claude',
  type: 'task.started',
  data: { prompt: 'İptal edilecek görev' }
}));
assert.strictEqual(cancelStore.getTask(cancelTaskId)?.status, 'running');

// Görev iptal edilir
cancelStore.recordEvent(createEvent({
  taskId: cancelTaskId,
  agent: 'claude',
  type: 'task.cancelled',
  data: { reason: 'Kullanıcı durdurdu' }
}));
assert.strictEqual(cancelStore.getTask(cancelTaskId)?.status, 'cancelled');

// Süreç öldükten sonra handleExit sıfır olmayan kodla çağrılsa bile "failed" OLARAK EZİLMEMELİ!
claude.handleExit(1, cancelTaskId, cancelStore, 'Process killed');
const finalTaskState = cancelStore.getTask(cancelTaskId);
assert.strictEqual(finalTaskState?.status, 'cancelled', 'İptal edilen görev handleExit tarafından failed olarak ezilmemeli!');
console.log('✔ İptal durum makinesi ve terminal durum dokunulmazlığı başarıyla doğrulandı!\n');

// 5. VERİ TUTARLILIĞI: Ardışık Aynı Delta Parçalarının Kaybolmaması & Monotonik seq
console.log('5. Ardışık Delta Parçaları ve SQLite Monotonik Sıralama Test Ediliyor...');
const seqStore = new SqliteStore(':memory:');
const seqTaskId = 'task_seq_test';

// Ardışık 3 kez tamamen aynı metin parçası (örn. alt satır \n) üretiliyor
seqStore.recordEvent(createEvent({ taskId: seqTaskId, agent: 'claude', type: 'message.delta', data: { text: '\n' } }));
seqStore.recordEvent(createEvent({ taskId: seqTaskId, agent: 'claude', type: 'message.delta', data: { text: '\n' } }));
seqStore.recordEvent(createEvent({ taskId: seqTaskId, agent: 'claude', type: 'message.delta', data: { text: '\n' } }));

const events = seqStore.getEvents(seqTaskId);
assert.strictEqual(events.length, 3, 'Ardışık aynı içerikli delta olayları asla tekilleştirilip yutulmamalı!');

const eventsSinceSeq0 = seqStore.getEventsSinceSeq(0);
assert.strictEqual(eventsSinceSeq0.length, 3);
assert.ok(eventsSinceSeq0[0].seq < eventsSinceSeq0[1].seq);
assert.ok(eventsSinceSeq0[1].seq < eventsSinceSeq0[2].seq);
console.log('✔ Monotonik artan seq ve mesaj bütünlüğü başarıyla doğrulandı!\n');

// 6. CODEX PROTOKOL AYRIŞTIRICISI: item.started, aggregated_output, mcp_tool_call
console.log('6. Codex Protokol Ayrıştırıcısı (item.started & aggregated_output) Test Ediliyor...');
const codexParserStore = new EventStore({ sqliteStore: memSqlite });
const codexParserTaskId = 'task_codex_parser_test';

// Codex item.started
codex.handleStdoutLine(
  JSON.stringify({
    type: 'item.started',
    item: { type: 'mcp_tool_call', name: 'read_file', input: { path: 'test.txt' } }
  }),
  codexParserTaskId,
  codexParserStore
);
let parserEvents = codexParserStore.getEvents(codexParserTaskId);
assert.strictEqual(parserEvents.length, 1);
assert.strictEqual(parserEvents[0].type, 'tool.invoked');
assert.strictEqual(parserEvents[0].data.name, 'read_file');

// Codex item.completed with aggregated_output
codex.handleStdoutLine(
  JSON.stringify({
    type: 'item.completed',
    item: { type: 'mcp_tool_call', name: 'read_file', exit_code: 0, aggregated_output: 'file content preview' }
  }),
  codexParserTaskId,
  codexParserStore
);
parserEvents = codexParserStore.getEvents(codexParserTaskId);
assert.strictEqual(parserEvents.length, 2);
assert.strictEqual(parserEvents[1].type, 'tool.completed');
assert.strictEqual(parserEvents[1].data.output, 'file content preview');
console.log('✔ Codex protokol ayrıştırıcısı (item.started, aggregated_output) başarıyla doğrulandı!\n');

// 6.5 DEDUP, HİYERARŞİ VE KIRPMA
console.log('6.5 Olay Tekilleştirme, parentTaskId ve Kırpma Test Ediliyor...');
{
  const { MAX_FIELD_BYTES, MAX_ASSISTANT_TEXT_BYTES } = await import('../src/core/sqlite_store.ts');
  const st = new SqliteStore(':memory:');
  const tid = 'task_dedup_child';
  const base = { taskId: tid, sessionId: null, agent: 'claude' as const, tier: 1 as const };
  st.recordEvent({ ...base, id: 'e1', type: 'task.started', data: { prompt: 'p' }, timestamp: 1000, parentTaskId: 'task_parent_1' });
  const delta = { ...base, id: 'e2', type: 'message.delta' as const, data: { text: 'abc' }, timestamp: 1001 };
  st.recordEvent(delta);
  st.recordEvent(delta);
  st.recordEvent(delta);
  const tool = { ...base, id: 'e3', type: 'tool.invoked' as const, data: { name: 'Bash', input: { cmd: 'x'.repeat(MAX_FIELD_BYTES + 500) } }, timestamp: 1002 };
  st.recordEvent(tool);
  st.recordEvent(tool);
  let t = st.getTask(tid)!;
  assert.strictEqual(t.assistantText, 'abc', 'Yinelenen olay metni iki kez biriktirmemeli');
  assert.strictEqual(t.toolsUsed.length, 1, 'Yinelenen araç çağrısı tek sayılmalı');
  assert.strictEqual(t.parentTaskId, 'task_parent_1');
  assert.strictEqual(st.getEvents(tid).length, 3, 'Yinelenen olaylar tekrar eklenmemeli');
  assert.strictEqual(st.getEvents(tid)[1].parentTaskId, 'task_parent_1');
  assert.match(String(t.toolsUsed[0].input.cmd), /\.\.\.\[truncated 500 bytes\]$/);
  const evtData = st.getEvents(tid)[2].data;
  assert.match(String(evtData.input.cmd), /\.\.\.\[truncated 500 bytes\]$/);

  st.recordEvent({ ...base, id: 'e4', type: 'message.delta', data: { text: 'y'.repeat(MAX_ASSISTANT_TEXT_BYTES + 100) }, timestamp: 1003 });
  st.recordEvent({ ...base, id: 'e5', type: 'message.delta', data: { text: 'more' }, timestamp: 1004 });
  t = st.getTask(tid)!;
  assert.match(t.assistantText, /\.\.\.\[truncated \d+ bytes\]$/);
  assert.ok(t.assistantText.length < MAX_ASSISTANT_TEXT_BYTES + 100);
  st.close();
}
console.log('✔ Dedup, parentTaskId kalıcılığı ve kırpma doğrulandı!\n');

// 7. RESMİ MCP SDK MODÜL DOĞRULAMASI
console.log('7. Resmi MCP SDK (@modelcontextprotocol/sdk) Modül Yüklemesi Test Ediliyor...');
const mcpModule = await import('../src/mcp/mcp_server.ts');
assert.strictEqual(typeof mcpModule.startMcpServer, 'function');
console.log('✔ Resmi MCP Server modülü doğrulandı!\n');

// 8. TUI OTURUM SEÇİCİ: ok tuşu/seçim mantığı güvenli no-op doğrulaması
console.log('8. Oturum seçici ok tuşu mantığı Test Ediliyor...');
{
  const tui = await import('../src/ui/tui.ts');
  assert.strictEqual(tui.getViewMode(), 'live');
  assert.strictEqual(tui.getSelectedIndex(), 0);
  assert.strictEqual(tui.handlePickerKey('\u001b[A'), null, 'Canlı modda ok tuşu işlenmemeli');
  tui.moveSelection(1);
  assert.strictEqual(tui.getSelectedIndex(), 0, 'Boş listede ok tuşu no-op olmalı');
  assert.strictEqual(tui.openSelected(), false, 'Boş listede Enter no-op olmalı');
  assert.strictEqual(tui.selectSession(10), false);
}
console.log('✔ Oturum seçici boş liste/mod korumaları doğrulandı!\n');

console.log('🎉 TÜM P0 GÜVENLİK, TAM TEST İZOLASYONU VE VERİ TUTARLILIĞI TESTLERİ EKSİKSİZ BAŞARIYLA TAMAMLANDI!');
