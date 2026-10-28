// web/md.js: sade Markdown ayrıştırıcı (HTML üretmez; bağlantılar yalnızca http/https)
import assert from 'node:assert';
import '../web/md.js';

const md = (globalThis as any).ObsMd;
assert.ok(md, 'ObsMd yüklenmeli');
const types = (s: string) => md.parse(s).map((b: any) => b.t);

assert.deepStrictEqual(types('# Başlık\n\nmetin'), ['h', 'p']);
assert.deepStrictEqual(types('- a\n- b\n\n1. x\n2. y'), ['ul', 'ol']);
assert.deepStrictEqual(types('```js\nconst a = 1;\n```\nsonra'), ['code', 'p']);
assert.strictEqual(md.parse('```diff\n+eklendi\n-silindi\n```')[0].lang, 'diff');
assert.strictEqual(md.parse('```\nkod\nsatır\n```')[0].v, 'kod\nsatır');
assert.deepStrictEqual(types('| a | b |\n|---|---|\n| 1 | 2 |'), ['table']);
const t = md.parse('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |')[0];
assert.strictEqual(t.head.length, 2); assert.strictEqual(t.rows.length, 2);
assert.deepStrictEqual(types('> alıntı\n> devam'), ['quote']);
assert.deepStrictEqual(types('---'), ['hr']);

const inl = md.parseInline('**kalın** `kod` *eğik* [bağ](https://example.com/x)');
assert.deepStrictEqual(inl.map((n: any) => n.t).filter((x: string) => x !== 'text'), ['strong', 'code', 'em', 'link']);
assert.strictEqual(inl.find((n: any) => n.t === 'link').href, 'https://example.com/x');
// güvenlik: javascript: bağlantısı bağlantı olmaz, HTML etiketi metin kalır
assert.ok(!md.parseInline('[x](javascript:alert(1))').some((n: any) => n.t === 'link'), 'javascript: bağlantısı reddedilmeli');
const html = md.parseInline('<img src=x onerror=alert(1)>');
assert.ok(html.every((n: any) => n.t === 'text'), 'HTML etiketi düz metin kalmalı');
console.log('✔ web/md.js: bloklar, tablo, satır içi biçimler, javascript: ve HTML reddi');
