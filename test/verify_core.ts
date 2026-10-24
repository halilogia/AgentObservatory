import assert from 'node:assert';
import { EventStore } from '../src/core/event_store.ts';
import { createEvent } from '../src/core/types.ts';
import { ClaudeAdapter } from '../src/adapters/claude_adapter.ts';
import { CodexAdapter } from '../src/adapters/codex_adapter.ts';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { validateCwd } from '../src/core/paths.ts';
import { formatTaskReport } from '../src/mcp/mcp_server.ts';
import { WorktreeManager } from '../src/runtime/worktree_manager.ts';
import { ResourceBroker } from '../src/runtime/resource_broker.ts';
import { FleetOrchestrator } from '../src/runtime/fleet_orchestrator.ts';

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

// A2. Claude effort & model parametreleri
const clEffortCmd = claude.buildCommand({ prompt: 'hi', effort: 'medium', model: 'sonnet' });
const effortIdx = clEffortCmd.args.indexOf('--effort');
const modelIdx = clEffortCmd.args.indexOf('--model');
assert.ok(effortIdx >= 0 && clEffortCmd.args[effortIdx + 1] === 'medium', 'Claude komutu --effort medium içermeli!');
assert.ok(modelIdx >= 0 && clEffortCmd.args[modelIdx + 1] === 'sonnet', 'Claude komutu --model sonnet içermeli!');
assert.ok(!clCmd.args.includes('--effort') && !clCmd.args.includes('--model'), 'Belirtilmediğinde --effort/--model eklenmemeli!');

// B. Codex varsayılan sandbox kontrolü
const cxCmd = codex.buildCommand({ prompt: 'test prompt' });
assert.ok(cxCmd.args.includes('workspace-write'), 'Codex varsayılan olarak workspace-write sandbox kullanmalı!');
assert.ok(!cxCmd.args.includes('danger-full-access'), 'Codex asla varsayılan olarak danger-full-access olmamalı!');
assert.ok(!cxCmd.args.includes('-c') && !cxCmd.args.includes('--dangerously-bypass-approvals-and-sandbox'), 'Belirtilmediğinde Codex -c/bypass eklenmemeli!');
const cxDefIdx = cxCmd.args.indexOf('--model');
assert.ok(cxDefIdx >= 0 && cxCmd.args[cxDefIdx + 1] === 'gpt-6-astra', 'Belirtilmediğinde Codex ChatGPT hesabında desteklenen varsayılan modeli (gpt-6-astra) kullanmalı!');

const cxModelCmd = codex.buildCommand({ prompt: 'hi', model: 'o3', effort: 'low', dangerouslySkipPermissions: true });
const cxModelIdx = cxModelCmd.args.indexOf('--model');
assert.ok(cxModelIdx >= 0 && cxModelCmd.args[cxModelIdx + 1] === 'o3', 'Codex komutu --model o3 içermeli!');
const cxCfgIdx = cxModelCmd.args.indexOf('-c');
assert.ok(cxCfgIdx >= 0 && cxModelCmd.args[cxCfgIdx + 1] === 'model_reasoning_effort="low"', 'Codex komutu model_reasoning_effort="low" içermeli!');
assert.ok(cxModelCmd.args.includes('--dangerously-bypass-approvals-and-sandbox'), 'Codex açıkça istenince bypass bayrağını içermeli!');

for (const e of ['xhigh', 'max', 'ultra']) {
  const c = codex.buildCommand({ prompt: 'hi', effort: e });
  assert.ok(c.args.includes(`model_reasoning_effort="${e}"`), `Codex effort ${e} olduğu gibi geçmeli!`);
}

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

  // Saf pencereleme mantığı (PAGE_SIZE = 7, 15 görev)
  assert.deepStrictEqual(tui.computeWindow(0, 0, 15), { offset: 0, end: 7, hasAbove: false, hasBelow: true });
  assert.strictEqual(tui.computeWindow(7, 0, 15).offset, 1, 'Aşağı taşınca pencere kayar');
  assert.strictEqual(tui.computeWindow(2, 5, 15).offset, 2, 'Yukarı taşınca pencere seçiliye iner');
  assert.deepStrictEqual(tui.computeWindow(14, 8, 15), { offset: 8, end: 15, hasAbove: true, hasBelow: false });
  assert.deepStrictEqual(tui.computeWindow(0, 0, 3), { offset: 0, end: 3, hasAbove: false, hasBelow: false });

  // Genişletilmiş tuşlar (picker modu)
  const origWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = () => true; // render çıktısını sustur
  try {
    const mk = (i: number): any => ({
      taskId: `t${i}`, agent: 'claude', status: 'completed', prompt: `p${i}`,
      startTime: 0, durationMs: 0, sessionId: null, model: null
    });
    tui.showSessionPicker(); // viewMode = 'picker'
    assert.strictEqual(tui.getViewMode(), 'picker');

    // Boş liste: hiçbir tuş hata/negatif indeks üretmemeli
    tui.setPickerTasksForTest([]);
    for (const k of ['\u001b[A', '\u001bOA', 'k', 'j', '\u001b[5~', '\u001b[6~', '\u001b[H', '\u001b[F', '\u001b[1~', '\u001b[4~']) {
      assert.strictEqual(tui.handlePickerKey(k), 'handled', `Boş listede ${JSON.stringify(k)} işlenmeli`);
      assert.strictEqual(tui.getSelectedIndex(), 0, 'Boş listede indeks 0 kalmalı');
    }

    tui.setPickerTasksForTest(Array.from({ length: 15 }, (_, i) => mk(i)));
    assert.strictEqual(tui.handlePickerKey('j'), 'handled');
    assert.strictEqual(tui.getSelectedIndex(), 1);
    assert.strictEqual(tui.handlePickerKey('\u001bOB'), 'handled');
    assert.strictEqual(tui.getSelectedIndex(), 2);
    assert.strictEqual(tui.handlePickerKey('K'), 'handled');
    assert.strictEqual(tui.getSelectedIndex(), 1);
    assert.strictEqual(tui.handlePickerKey('\u001bOA'), 'handled');
    assert.strictEqual(tui.getSelectedIndex(), 0);

    assert.strictEqual(tui.handlePickerKey('\u001b[6~'), 'handled');
    assert.strictEqual(tui.getSelectedIndex(), tui.PAGE_SIZE, 'PageDown PAGE_SIZE kadar iner');
    assert.strictEqual(tui.handlePickerKey('\u001b[5~'), 'handled');
    assert.strictEqual(tui.getSelectedIndex(), 0);
    assert.strictEqual(tui.handlePickerKey('\u001b[5~'), 'handled');
    assert.strictEqual(tui.getSelectedIndex(), 0, 'PageUp başta 0da kenetlenmeli');

    assert.strictEqual(tui.handlePickerKey('\u001b[F'), 'handled');
    assert.strictEqual(tui.getSelectedIndex(), 14, 'End son öğeye gider');
    assert.strictEqual(tui.handlePickerKey('\u001b[6~'), 'handled');
    assert.strictEqual(tui.getSelectedIndex(), 14, 'PageDown sonda kenetlenmeli');
    assert.strictEqual(tui.handlePickerKey('\u001b[H'), 'handled');
    assert.strictEqual(tui.getSelectedIndex(), 0, 'Home ilk öğeye gider');
    assert.strictEqual(tui.handlePickerKey('\u001b[4~'), 'handled');
    assert.strictEqual(tui.getSelectedIndex(), 14);
    assert.strictEqual(tui.handlePickerKey('\u001b[1~'), 'handled');
    assert.strictEqual(tui.getSelectedIndex(), 0);

    // Esc: picker'da canlı akışa; inspect'te listeye dönüş
    assert.strictEqual(tui.handlePickerKey('\u001b'), 'live', 'Picker modunda Esc canlıya dönmeli');
    assert.strictEqual(tui.handlePickerKey('\u001b[C'), null, 'Bilinmeyen kaçış dizisi yutulmamalı/işlenmemeli');
    tui.inspectTask('yok-boyle-bir-gorev');
    assert.strictEqual(tui.getViewMode(), 'inspect');
    assert.strictEqual(tui.handlePickerKey('\u001b'), 'handled', 'Inspect modunda Esc listeye dönmeli');
    assert.strictEqual(tui.getViewMode(), 'picker');
  } finally {
    (process.stdout as any).write = origWrite;
    tui.resetViewMode();
  }
}
console.log('✔ Oturum seçici boş liste/mod korumaları doğrulandı!\n');

// MCP rapor formatlayıcı: token tasarruflu (compact) ve detaylı mod
console.log('MCP formatTaskReport (compact / detailed) Test Ediliyor...');
{
  const longText = 'A'.repeat(1500) + 'B'.repeat(3000) + 'C'.repeat(1000);
  const summary = {
    agent: 'claude',
    model: 'sonnet',
    status: 'completed',
    durationMs: 12340,
    taskId: 'task-123',
    sessionId: 'sess-abc',
    usage: { inputTokens: 12400, cachedTokens: 800, outputTokens: 1000, reasoningTokens: 0, totalTokens: 14200 },
    toolsUsed: [
      { name: 'Edit', input: { file_path: 'src/a.ts', old_string: 'x' } },
      { name: 'Edit', input: { file_path: 'src/a.ts', old_string: 'y' } },
      { name: 'Write', input: { path: 'src/b.ts', content: 'SECRET_BODY' } },
      { name: 'Read', input: { file_path: 'src/c.ts' } },
      { name: 'Read', input: { file_path: 'src/d.ts' } },
      { name: 'PowerShell', input: { command: 'npm test' } }
    ],
    assistantText: longText
  };

  const compact = formatTaskReport(summary);
  assert.ok(compact.includes('12.4k'), 'Token >= 1000 kısaltılmalı');
  assert.ok(compact.includes('800'), 'Token < 1000 düz sayı olmalı');
  assert.ok(compact.includes('**Araç Çağrıları**: 6 adet (Edit: 2, Write: 1, Read: 2, PowerShell: 1)'), 'Araç sayıları toplanmalı');
  assert.ok(compact.includes('**Değiştirilen Dosyalar**'), 'Değiştirilen dosyalar listelenmeli');
  assert.ok(compact.includes('src/a.ts') && compact.includes('src/b.ts'), 'Edit/Write dosyaları çıkarılmalı');
  assert.ok(!compact.includes('src/c.ts') && !compact.includes('src/d.ts'), 'Read dosyaları değiştirilen listede olmamalı');
  assert.strictEqual(compact.split('src/a.ts').length - 1, 1, 'Dosyalar tekilleştirilmeli');
  assert.ok(!compact.includes('SECRET_BODY') && !compact.includes('old_string'), 'Compact modda tool JSON dökülmemeli');
  assert.ok(compact.includes('3000 karakter'), 'Uzun yanıt kırpılıp atlanan karakter sayısı yazılmalı');
  assert.ok(compact.includes('A'.repeat(1500)) && compact.includes('C'.repeat(1000)) && !compact.includes('BBBBBBBBBB'), 'Yanıtın başı ve sonu korunmalı');

  const detailed = formatTaskReport(summary, true);
  assert.ok(detailed.includes('Yürütülen Araçlar'), 'Detaylı modda araç listesi olmalı');
  assert.ok(detailed.includes('SECRET_BODY'), 'Detaylı modda tool girdileri yazılmalı');
  assert.ok(detailed.includes('B'.repeat(3000)), 'Detaylı modda yanıt kırpılmamalı');

  const errReport = formatTaskReport({ agent: 'codex', status: 'failed', durationMs: 500, taskId: 't', error: 'boom' });
  assert.ok(errReport.includes('boom'), 'Hata bloğu korunmalı');
}
console.log('✔ formatTaskReport doğrulandı!\n');

// 9. FLEET & WORKTREE ORCHESTRATION TESTLERİ
console.log('9. Fleet, Worktree & ResourceBroker Mimarisi Test Ediliyor...');

// A. WorktreeManager Temel Metodları
const wtManager = new WorktreeManager();
const currentRepo = process.cwd();
assert.ok(wtManager.isGitRepo(currentRepo), 'Mevcut dizin Git repository olarak algılanmalı');
const activeWts = wtManager.listWorktrees(currentRepo);
assert.ok(Array.isArray(activeWts) && activeWts.length >= 1, 'En az ana worktree listelenmeli');
assert.ok(activeWts[0].worktreePath, 'Worktree nesnesi geçerli bir yola sahip olmalı');
const headSha = wtManager.getHeadSha(currentRepo);
assert.ok(headSha && headSha.length >= 40, 'Geçerli 40 karakterlik Git HEAD SHA dönmeli');
console.log('✔ WorktreeManager temel metodları başarıyla doğrulandı!');

// B. ResourceBroker: Eşzamanlılık Semaforu (Concurrency Semaphore)
{
  const broker = new ResourceBroker({ maxConcurrentTasks: 2 });
  assert.strictEqual(broker.getMaxSlots(), 2, 'Kapasite 2 olmalı');

  let activeCount = 0;
  const executionOrder: number[] = [];

  const job = async (id: number, delayMs: number) => {
    const release = await broker.acquireSlot();
    activeCount++;
    assert.ok(activeCount <= 2, `Aynı anda 2'den fazla iş çalışamaz! (Şu an: ${activeCount})`);
    executionOrder.push(id);
    await new Promise((res) => setTimeout(res, delayMs));
    activeCount--;
    release();
  };

  await Promise.all([
    job(1, 40),
    job(2, 40),
    job(3, 10),
    job(4, 10)
  ]);

  assert.strictEqual(executionOrder.length, 4, '4 iş de sırayla tamamlanmalı');
  const stats = broker.getStats();
  assert.strictEqual(stats.activeSlots, 0, 'Tüm slotlar serbest bırakılmalı');
  assert.strictEqual(stats.queuedSlots, 0, 'Kuyruk boş olmalı');
  console.log('✔ ResourceBroker eşzamanlılık semaforu başarıyla doğrulandı!');
}

// C. ResourceBroker: Tekil Entegrasyon Yazıcı Kilidi (Single Integration Writer Mutex)
{
  const broker = new ResourceBroker();
  let integrationRunning = false;
  const results: number[] = [];

  const integrationTask = async (id: number) => {
    return broker.acquireIntegrationLock(async () => {
      assert.strictEqual(integrationRunning, false, 'İki entegrasyon işlemi aynı anda çalışamaz!');
      integrationRunning = true;
      await new Promise((res) => setTimeout(res, 20));
      results.push(id);
      integrationRunning = false;
      return id;
    });
  };

  const tasksPromise = Promise.all([
    integrationTask(10),
    integrationTask(20),
    integrationTask(30)
  ]);

  const output = await tasksPromise;
  assert.deepStrictEqual(output, [10, 20, 30], 'Tüm entegrasyon görevleri kilit sırasıyla tamamlanmalı');
  console.log('✔ ResourceBroker tekil entegrasyon mutex kilidi doğrulandı!');
}

// D. ResourceBroker: Task Lease Fencing (Stale Worker Koruması)
{
  const broker = new ResourceBroker();
  const lease1 = broker.issueLease('task_abc');
  assert.ok(broker.isLeaseValid('task_abc', lease1), 'Aktif lease geçerli olmalı');

  const lease2 = broker.issueLease('task_abc');
  assert.ok(broker.isLeaseValid('task_abc', lease2), 'Yeni lease geçerli olmalı');
  assert.ok(!broker.isLeaseValid('task_abc', lease1), 'Eski epoch lease geçersiz kılınmalı (Fencing)');

  broker.revokeLease('task_abc');
  assert.ok(!broker.isLeaseValid('task_abc', lease2), 'İptal edilen lease geçersiz olmalı');
  console.log('✔ ResourceBroker task lease fencing doğrulandı!');
}

// E. FleetOrchestrator: DAG Doğrulama ve Döngü (Cycle) Tespiti
{
  const orchestrator = new FleetOrchestrator();

  // 1. Yinelenen ID hatası
  assert.throws(() => {
    orchestrator.validateDag([
      { id: 'dup', agent: 'claude', prompt: 'a' },
      { id: 'dup', agent: 'codex', prompt: 'b' }
    ]);
  }, /Yinelenen görev ID/, 'Yinelenen ID tespit edilmeli');

  // 2. Olmayan bağımlılık referansı
  assert.throws(() => {
    orchestrator.validateDag([
      { id: 't1', agent: 'claude', prompt: 'a', dependsOn: ['ghost'] }
    ]);
  }, /bulunmayan bir bağımlılığa referans/, 'Eksik bağımlılık tespit edilmeli');

  // 3. Döngüsel bağımlılık (Cycle) tespiti
  assert.throws(() => {
    orchestrator.validateDag([
      { id: 'A', agent: 'claude', prompt: 'a', dependsOn: ['B'] },
      { id: 'B', agent: 'codex', prompt: 'b', dependsOn: ['C'] },
      { id: 'C', agent: 'agy', prompt: 'c', dependsOn: ['A'] }
    ]);
  }, /döngüsel bağımlılık/, 'A -> B -> C -> A döngüsü tespit edilmeli');

  // 4. Geçerli DAG başarıyla geçmeli
  assert.doesNotThrow(() => {
    orchestrator.validateDag([
      { id: 'schema', agent: 'claude', prompt: 'DB schema' },
      { id: 'api', agent: 'claude', prompt: 'Backend API', dependsOn: ['schema'] },
      { id: 'ui', agent: 'codex', prompt: 'Frontend UI', dependsOn: ['schema'] },
      { id: 'e2e', agent: 'agy', prompt: 'E2E Tests', dependsOn: ['api', 'ui'] }
    ]);
  }, 'Geçerli DAG doğrulamasını hatasız geçmeli');

  console.log('✔ FleetOrchestrator DAG doğrulama ve döngü tespiti başarıyla doğrulandı!\n');
}

console.log('🎉 TÜM P0 GÜVENLİK, TAM TEST İZOLASYONU VE VERİ TUTARLILIĞI TESTLERİ EKSİKSİZ BAŞARIYLA TAMAMLANDI!');
