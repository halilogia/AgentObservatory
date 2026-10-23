// Gerçek CLI çıktısıyla adaptör testi: test/fixtures/*.jsonl dosyaları gerçek çalıştırmalardan alındı
// ("Reply with exactly: OK"). Adaptörler bu satırları okuyup yanıtı ve token bilgisini çıkarabilmeli.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventStore } from '../src/core/event_store.ts';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { createEvent } from '../src/core/types.ts';
import type { BaseAdapter } from '../src/adapters/base_adapter.ts';
import { AgyAdapter } from '../src/adapters/agy_adapter.ts';
import { CodexAdapter } from '../src/adapters/codex_adapter.ts';
import { OpenCodeAdapter } from '../src/adapters/opencode_adapter.ts';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function replay(name: string, adapter: BaseAdapter, file: string) {
  const store = new EventStore({ sqliteStore: new SqliteStore(':memory:') });
  const taskId = 'task_fixture_' + name;
  store.recordEvent(createEvent({ taskId, agent: adapter.name, type: 'task.started', data: { prompt: 'Reply with exactly: OK' } }));
  for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
    if (line.trim()) adapter.handleStdoutLine(line, taskId, store);
  }
  adapter.handleExit(0, taskId, store, '');
  return store.getTask(taskId)!;
}

console.log('Gerçek çıktı fixture testleri...');
for (const [name, adapter, file] of [
  ['agy', new AgyAdapter(), 'agy.jsonl'],
  ['codex', new CodexAdapter(), 'codex.jsonl'],
  ['opencode', new OpenCodeAdapter(), 'opencode.jsonl']
] as const) {
  const task = replay(name, adapter, file);
  assert.strictEqual(task.status, 'completed', `${name}: görev completed olmalı`);
  assert.strictEqual(task.assistantText.trim(), 'OK', `${name}: yanıt tam olarak "OK" olmalı (gelen: ${JSON.stringify(task.assistantText)})`);
  console.log(`✔ ${name}: yanıt "OK", durum completed`);
}

// Hata türü ayrımı (kota ≠ bozuk)
import { classifyFailure } from '../src/core/failure.ts';
assert.deepStrictEqual(classifyFailure('Error 429: usage limit reached, try again in 20 minutes'), { kind: 'rate_limit', cooldownMs: 20 * 60000 });
assert.strictEqual(classifyFailure("The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account").kind, 'model_unsupported');
assert.strictEqual(classifyFailure('No active credentials for provider: codex').kind, 'auth');
assert.strictEqual(classifyFailure('hello').kind, 'unknown');
console.log('✔ hata sınıflandırma: rate_limit / model_unsupported / auth / unknown');

// OpenCode izin politikası: read-only => plan ajanı; yazma => edit açık, bash kapalı; otomatik onay bayrağı YOK
const oc = new OpenCodeAdapter();
const ocRead = oc.buildCommand({ prompt: 'x', sandbox: 'read-only' });
assert.ok(ocRead.args.includes('--agent') && ocRead.args.includes('plan'), 'read-only OpenCode plan ajanını kullanmalı');
assert.ok(!ocRead.env.OPENCODE_CONFIG_CONTENT, 'read-only için izin yapılandırması gerekmez');
const ocWrite = oc.buildCommand({ prompt: 'x', sandbox: 'workspace-write', dangerouslySkipPermissions: true });
assert.ok(!ocWrite.args.includes('--auto') && !ocWrite.args.includes('--dangerously-skip-permissions'), 'OpenCode otomatik onay bayrağı almamalı');
const ocPerm = JSON.parse(ocWrite.env.OPENCODE_CONFIG_CONTENT as string).permission;
assert.deepStrictEqual(ocPerm, { edit: 'allow', bash: 'deny', webfetch: 'deny' }, 'yazma kipinde edit açık, bash/webfetch kapalı');
console.log('✔ opencode izin politikası');
