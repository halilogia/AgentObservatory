import assert from 'node:assert';
import { EventStore } from '../src/core/event_store.ts';
import { createEvent } from '../src/core/types.ts';
import { ClaudeAdapter } from '../src/adapters/claude_adapter.ts';
import { CodexAdapter } from '../src/adapters/codex_adapter.ts';
import { globalSqlite } from '../src/core/sqlite_store.ts';

console.log('🧪 Agent Observatory Core TypeScript Test Başlatılıyor...\n');

// Test 1: EventStore & Aggregation
console.log('1. EventStore ve Olay Agregasyonu Test Ediliyor...');
const store = new EventStore();

store.recordEvent(createEvent({
  taskId: 'task_test_1',
  sessionId: 'sess_123',
  agent: 'claude',
  type: 'task.started',
  data: { prompt: 'TS Test Görevi', model: 'claude-sonnet-5-5' }
}), 12345);

let task = store.getTask('task_test_1');
assert.ok(task, 'Task bulunmalı');
assert.strictEqual(task.status, 'running');
assert.strictEqual(task.agent, 'claude');
assert.strictEqual(task.sessionId, 'sess_123');

// Emit tool invocation
store.recordEvent(createEvent({
  taskId: 'task_test_1',
  sessionId: 'sess_123',
  agent: 'claude',
  type: 'tool.invoked',
  data: { name: 'Bash', input: { command: 'ls' } }
}));

task = store.getTask('task_test_1');
assert.ok(task);
assert.strictEqual(task.toolsUsed.length, 1);
assert.strictEqual(task.toolsUsed[0].name, 'Bash');

// Emit usage
store.recordEvent(createEvent({
  taskId: 'task_test_1',
  sessionId: 'sess_123',
  agent: 'claude',
  type: 'usage.updated',
  data: { usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 200, reasoningTokens: 10 } }
}));

task = store.getTask('task_test_1');
assert.ok(task);
assert.strictEqual(task.usage.inputTokens, 100);
assert.strictEqual(task.usage.cachedTokens, 200);
assert.strictEqual(task.usage.reasoningTokens, 10);
assert.strictEqual(task.usage.totalTokens, 150);

// Emit completed
store.recordEvent(createEvent({
  taskId: 'task_test_1',
  sessionId: 'sess_123',
  agent: 'claude',
  type: 'task.completed',
  data: { result: 'TypeScript motoru çalışıyor' }
}));

task = store.getTask('task_test_1');
assert.ok(task);
assert.strictEqual(task.status, 'completed');
assert.strictEqual(task.assistantText, 'TypeScript motoru çalışıyor');
console.log('✔ EventStore testleri başarıyla geçti!\n');

// Test 2: Claude Adapter Parsing
console.log('2. ClaudeAdapter stream-json Ayrıştırma Test Ediliyor...');
const claudeAdapter = new ClaudeAdapter();
const testStore = new EventStore();

claudeAdapter.handleStdoutLine(
  JSON.stringify({ type: 'system', subtype: 'init', session_id: 'cl_session_1', model: 'claude-sonnet-5-5' }),
  'task_claude_1',
  testStore
);

const clTask = testStore.getTask('task_claude_1');
assert.ok(clTask);
assert.strictEqual(clTask.sessionId, 'cl_session_1');
assert.strictEqual(clTask.model, 'claude-sonnet-5-5');
console.log('✔ ClaudeAdapter testleri başarıyla geçti!\n');

// Test 3: Codex Adapter Parsing
console.log('3. CodexAdapter JSONL Ayrıştırma Test Ediliyor...');
const codexAdapter = new CodexAdapter();
const codexStore = new EventStore();

codexAdapter.handleStdoutLine(
  JSON.stringify({ type: 'thread.started', thread_id: 'codex_th_1' }),
  'task_codex_1',
  codexStore
);

codexAdapter.handleStdoutLine(
  JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Codex TS hazır.' } }),
  'task_codex_1',
  codexStore
);

const cxTask = codexStore.getTask('task_codex_1');
assert.ok(cxTask);
assert.strictEqual(cxTask.sessionId, 'codex_th_1');
assert.strictEqual(cxTask.assistantText, 'Codex TS hazır.');
console.log('✔ CodexAdapter testleri başarıyla geçti!\n');

// Test 4: SQLite WAL Persistence & Cross-Process Event Sync
console.log('4. SQLite WAL Kalıcı Depolama ve Olay Senkronizasyonu Test Ediliyor...');
const sqliteTask = globalSqlite.getTask('task_test_1');
assert.ok(sqliteTask, 'Task SQLite veritabanında bulunmalı');
assert.strictEqual(sqliteTask.status, 'completed');
assert.strictEqual(sqliteTask.agent, 'claude');
assert.strictEqual(sqliteTask.usage.inputTokens, 100);

const recentEvents = globalSqlite.getEventsSince(0);
assert.ok(recentEvents.length > 0, 'SQLite üzerinden olaylar sorgulanabilmeli');
console.log(`✔ SQLite WAL testleri başarıyla geçti (${recentEvents.length} kayıtlı olay)!\n`);

// Test 5: MCP Server SDK Import & Structure
console.log('5. Resmi MCP SDK (@modelcontextprotocol/sdk) Yüklemesi Test Ediliyor...');
const mcpModule = await import('../src/mcp/mcp_server.ts');
assert.strictEqual(typeof mcpModule.startMcpServer, 'function', 'startMcpServer fonksiyonu dışa aktarılmalı');
console.log('✔ MCP Server SDK yapılandırması başarıyla doğrulandı!\n');

console.log('🎉 TÜM TYPESCRIPT VE PERSISTENCE TESTLERİ EKSİKSİZ BAŞARIYLA TAMAMLANDI!');
