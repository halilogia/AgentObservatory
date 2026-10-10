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
const codexStore = new EventStore();

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
const cancelStore = new EventStore();
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

// 6. RESMİ MCP SDK MODÜL DOĞRULAMASI
console.log('6. Resmi MCP SDK (@modelcontextprotocol/sdk) Modül Yüklemesi Test Ediliyor...');
const mcpModule = await import('../src/mcp/mcp_server.ts');
assert.strictEqual(typeof mcpModule.startMcpServer, 'function');
console.log('✔ Resmi MCP Server modülü doğrulandı!\n');

console.log('🎉 TÜM P0 GÜVENLİK, OTURUM İZOLASYONU VE VERİ TUTARLILIĞI TESTLERİ EKSİKSİZ BAŞARIYLA TAMAMLANDI!');
