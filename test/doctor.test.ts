// observatory doctor: tüm motorlar tabloda görünmeli (kurulu olup olmadığından bağımsız)
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.ts');
const r = spawnSync(process.execPath, ['--experimental-strip-types', cli, 'doctor'], { encoding: 'utf8', timeout: 120000 });
assert.strictEqual(r.status, 0, `doctor 0 ile çıkmalı: ${r.stderr}`);
for (const engine of ['claude', 'codex', 'agy', 'opencode', 'aider', 'freebuff']) {
  assert.ok(new RegExp(`^${engine}\\s+(VAR|YOK)\\b`, 'm').test(r.stdout), `${engine} satırı VAR/YOK ile görünmeli`);
}
assert.ok(/Durum/.test(r.stdout), 'tablo başlığı olmalı');
console.log('✔ doctor: altı motor da tabloda');
