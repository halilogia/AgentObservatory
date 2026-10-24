// web/cup.js: kahve fincanı, Claude Code "cache-clock" modundaki piksel-art ile aynı renk ve eşikler
import assert from 'node:assert';
import '../web/cup.js';

const cup = (globalThis as any).ObsCup;
assert.ok(cup, 'ObsCup yüklenmeli');
assert.deepStrictEqual([cup.COLS, cup.ROWS], [14, 10]);

// sıcak fincan: kahve yüzeyi, porselen, tabak (modla birebir)
const hot = cup.pixels('hot', 0);
assert.strictEqual(hot[4][5], 0x3b2314);
assert.strictEqual(hot[4][4], 0x6b4428);
assert.strictEqual(hot[5][5], 0xf1ede4);
assert.strictEqual(hot[8][6], 0xb9b2a6);
assert.strictEqual(hot[5][3], 0xffffff);
// soğuk fincan: gri tonlar, duman yok
const cold = cup.pixels('cold', 0);
assert.strictEqual(cold[4][5], 0x7a6a5c);
assert.strictEqual(cold[5][5], 0x9a968e);
assert.ok(cold.slice(0, 4).every((r: any[]) => r.every((c) => c === null)), 'soğuk fincanda duman olmaz');
// duman sayısı durumla artar
const smoke = (s: string) => cup.pixels(s, 0).slice(0, 4).flat().filter((c: any) => c !== null).length;
assert.ok(smoke('hot') > smoke('warm') && smoke('warm') > smoke('low') && smoke('low') > 0);

// eşikler (TTL 60 dk)
const T = 60 * 60000, now = 1e9;
assert.strictEqual(cup.stateOf(null, now, T, false), 'empty');
assert.strictEqual(cup.stateOf(now - 10 * 60000, now, T, false), 'hot');
assert.strictEqual(cup.stateOf(now - 40 * 60000, now, T, false), 'warm');
assert.strictEqual(cup.stateOf(now - 55 * 60000, now, T, false), 'low');
assert.strictEqual(cup.stateOf(now - 59.5 * 60000, now, T, false), 'low');
assert.strictEqual(cup.stateOf(now - 61 * 60000, now, T, false), 'cold');
assert.strictEqual(cup.stateOf(now - 61 * 60000, now, T, true), 'hot');
console.log('✔ web/cup.js: fincan pikselleri, duman ve süre eşikleri');
