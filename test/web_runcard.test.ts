// web/runcard.js: durum kartı mantığı (süre biçimi, art arda adım sayısı, çıktı kırpma, adım çubuğu)
import assert from 'node:assert';
import fs from 'node:fs';
import '../web/runcard.js';

const rc = (globalThis as any).ObsRunCard;
assert.ok(rc, 'ObsRunCard yüklenmeli');
assert.strictEqual(rc.clock(0), '0:00');
assert.strictEqual(rc.clock(125_000), '2:05');
assert.strictEqual(rc.dur(400), '0.4s');
assert.strictEqual(rc.dur(12_000), '12s');
assert.strictEqual(rc.dur(65_000), '1:05');
assert.deepStrictEqual(rc.trailing([]), { kind: null, count: 0 });
assert.deepStrictEqual(rc.trailing([{ kind: 'term' }, { kind: 'read' }, { kind: 'read' }]), { kind: 'read', count: 2 });
assert.deepStrictEqual(rc.outLines('a\n\nb  \nc\nd\ne', 3), { lines: ['a', 'b', 'c'], more: 2 });
assert.deepStrictEqual(rc.segments([{ t1: 5 }, { t1: 0 }], 24), ['done', 'run']);
assert.strictEqual(rc.segments(Array.from({ length: 40 }, () => ({ t1: 1 })), 24).length, 24);

// sayfa bağlantıları
const html = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
assert.ok(html.includes('id="runCard"') && html.includes('src="/runcard.js'));
console.log('web_runcard OK');
