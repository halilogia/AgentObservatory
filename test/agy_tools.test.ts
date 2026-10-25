// agy stream-json: araç adımları (tool.invoked) ve token alanları (snake_case -> camelCase) kayda geçmeli.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventStore } from '../src/core/event_store.ts';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { createEvent } from '../src/core/types.ts';
import { AgyAdapter, normalizeAgyTool, mapAgyUsage } from '../src/adapters/agy_adapter.ts';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const store = new EventStore({ sqliteStore: new SqliteStore(':memory:') });
const adapter = new AgyAdapter();
const taskId = 'task_agy_tools';
store.recordEvent(createEvent({ taskId, agent: 'agy', type: 'task.started', data: { prompt: 'x' } }));
for (const line of fs.readFileSync(path.join(dir, 'agy_tools.jsonl'), 'utf8').split('\n')) {
  if (line.trim()) adapter.handleStdoutLine(line, taskId, store);
}
adapter.handleExit(0, taskId, store, '');
const t = store.getTask(taskId)!;
assert.deepStrictEqual(t.toolsUsed.map((x) => x.name), ['Read', 'Glob'], 'araç adımları kayda geçer ve ortak adlara çevrilir');
assert.strictEqual(t.toolsUsed[0].input.file_path, 'C:/proje/CLAUDE.md', 'dosya yolu taşınır');
assert.strictEqual(t.usage.inputTokens, 35889, 'girdi tokenı');
assert.strictEqual(t.usage.outputTokens, 153, 'çıktı tokenı');
assert.strictEqual(t.usage.cachedTokens, 100, 'önbellek tokenı');
assert.strictEqual(t.usage.reasoningTokens, 7, 'akıl yürütme tokenı');
assert.deepStrictEqual(normalizeAgyTool('run_command', { CommandLine: 'ls' }), { name: 'Bash', input: { command: 'ls' } });
assert.deepStrictEqual(mapAgyUsage({}), { inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0 });
console.log('✔ agy araç adımları ve token alanları');
