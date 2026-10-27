// web/skins.js: motor -> skin eşlemesi, araç etiketi biçimi, sonuç kısaltma
import assert from 'node:assert';
import '../web/skins.js';

const S = (globalThis as any).ObsSkins;
assert.ok(S, 'ObsSkins yüklenmeli');

// motor -> skin
for (const id of ['claude', 'codex', 'agy', 'opencode']) assert.strictEqual(S.skinFor(id), id);
assert.strictEqual(S.skinFor('Claude'), 'claude');
assert.strictEqual(S.skinFor('gemini'), 'generic');
assert.strictEqual(S.skinFor(undefined), 'generic');

// araç açıklaması
const bash = S.describe('Bash', { command: 'npm   test\n--silent' });
assert.deepStrictEqual(bash, { kind: 'exec', name: 'Bash', summary: 'npm test --silent' });
assert.strictEqual(S.describe('Read', { file_path: 'C:\\a\\b\\c\\d\\x.ts' }).summary, '…/c/d/x.ts');
assert.strictEqual(S.describe('Grep', { pattern: 'foo' }).kind, 'search');
assert.strictEqual(S.describe('Edit', { file_path: 'src/x.ts' }).kind, 'edit');
assert.strictEqual(S.describe('Bash', undefined, '$ ls -la').summary, 'ls -la', 'girdi yoksa özet metninden "$ " öneki atılır');
assert.strictEqual(S.describe('Mystery', { a: 1 }).kind, 'other');

// etiket biçimi
const full = (id: string, v: any) => { const l = S.label(id, v); return l.name + l.rest; };
assert.strictEqual(full('claude', bash), 'Bash(npm test --silent)');
assert.strictEqual(full('codex', bash), 'Ran npm test --silent');
assert.strictEqual(full('codex', S.describe('Read', { path: 'a.ts' })), 'Explored a.ts');
assert.strictEqual(full('agy', bash), 'Bash npm test --silent');
assert.strictEqual(full('opencode', bash), '\u2190 Bash npm test --silent');
assert.strictEqual(full('opencode', S.describe('read', { path: 'a.ts' })), '\u2190 Read a.ts');
assert.strictEqual(full('generic', bash), '[Bash] npm test --silent');
assert.strictEqual(full('codex', S.describe('Mystery', { a: 1 })), 'Used Mystery {"a":1}');

// sonuç kısaltma
const r = S.result('a\n\nb  \nc\nd\ne');
assert.deepStrictEqual(r, { lines: ['a', 'b', 'c'], more: 2 });
assert.deepStrictEqual(S.result('tek'), { lines: ['tek'], more: 0 });
assert.deepStrictEqual(S.result(''), { lines: [], more: 0 });
assert.strictEqual(S.result('x'.repeat(300)).lines[0].length, 140);
assert.strictEqual(S.moreText(5, 'satır'), '… +5 satır');
console.log('✔ web/skins.js: skin eşlemesi, araç etiketi, sonuç kısaltma');
