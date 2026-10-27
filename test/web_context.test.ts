// web/context.js: motor değişince önceki konuşmanın yeni isteme özet olarak eklenmesi
import assert from 'node:assert';
import '../web/context.js';

const ctx = (globalThis as any).ObsCtx;
assert.ok(ctx, 'ObsCtx yüklenmeli');
const bot = (label: string, v: string, tools: string[] = []) => ({ r: 'b', engine: 'opencode', label, parts: [...tools.map((s) => ({ k: 'tool', name: 'Read', summary: s })), { k: 'text', v }], notice: null });

// ilk mesaj: özet yok, istem olduğu gibi gider
assert.strictEqual(ctx.build([], 'merhaba'), null);
assert.strictEqual(ctx.CACHE_TTL_MS, 60 * 60000, 'önbellek süresi tek sabitte, varsayılan 60 dk');

const prior = [
  { r: 'u', text: 'README\'yi oku' }, bot('Deepseek V4.1 Flash', 'Kurulum var, lisans yok.', ['Read(README.md)']),
  { r: 'u', text: 'lisansı ekle' }, { r: 'b', engine: 'claude', label: 'Sonnet', parts: [], notice: { text: 'kota dolu' } }
];
const p = ctx.build(prior, 'peki devam et') as string;
assert.ok(p.startsWith('<CONTEXT_SUMMARY>') && p.includes('<USER_REQUEST>\npeki devam et\n</USER_REQUEST>'), 'etiketler');
assert.ok(p.includes("README'yi oku") && p.includes('Deepseek V4.1 Flash: Kurulum var, lisans yok.') && p.includes('Read(README.md)'), 'önceki tur ve araç');
assert.ok(!p.includes('lisansı ekle'), 'yanıtsız (hatalı) tur özete girmez');

// yeniden deneme: aynı istem özet içinde tekrarlanmaz
const retry = ctx.build([{ r: 'u', text: 'x' }, bot('A', 'y'), { r: 'u', text: 'z' }, bot('A', 'w')], 'z') as string;
assert.ok(!retry.includes('## 2.'), 'son tur istemin kendisi: özete girmez');

// bütçe: uzun konuşmada en yeni turlar korunur, eskiler atılır, toplam sınırı aşmaz
const many: any[] = [];
for (let i = 0; i < 60; i++) many.push({ r: 'u', text: 'soru ' + i + ' ' + 'x'.repeat(200) }, bot('A', 'cevap ' + i + ' ' + 'y'.repeat(900)));
const big = ctx.build(many, 'son', { budget: 6000 }) as string;
assert.ok(big.includes('soru 59') && big.includes('soru 58') && !big.includes('soru 0 '), 'en yeni turlar kalır');
assert.ok(big.includes('earlier turns omitted'), 'atlanan tur sayısı yazılır');
assert.ok(big.length < 8000, 'bütçe aşılmaz (' + big.length + ')');
console.log('✔ web/context.js: bağlam özeti, hatalı tur atlama, yeniden deneme, bütçe');
