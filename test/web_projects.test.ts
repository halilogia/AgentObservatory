// web/projects.js (proje deposu) ve web/context.js (proje talimatlarının yeni oturum başında isteme eklenmesi)
import assert from 'node:assert';

// localStorage taklidi (tarayıcı dışında)
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
// @ts-ignore
await import('../web/projects.js');
// @ts-ignore
await import('../web/context.js');
const P = (globalThis as any).ObsProjects, C = (globalThis as any).ObsCtx;
assert.ok(P && C);

// kaydet / oku / sırala / sil
assert.deepStrictEqual(P.list(), []);
assert.strictEqual(P.save({ id: 'p1', name: '   ', cwd: 'C:/x' }), null, 'adsız proje kaydedilmez');
const a = P.save({ id: 'p1', name: '  Metrobus   3D  ', cwd: 'C:/a', instructions: '  Sade arayüz.  ', touched: 1000 });
assert.strictEqual(a.name, 'Metrobus 3D', 'boşluklar sadeleşir');
assert.strictEqual(a.instructions, 'Sade arayüz.');
P.save({ id: 'p2', name: 'Observatory', cwd: 'C:/b', touched: 2000 });
assert.deepStrictEqual(P.list().map((p: any) => p.id), ['p2', 'p1'], 'en son kullanılan önce');
P.touch('p1');
assert.deepStrictEqual(P.list().map((p: any) => p.id), ['p1', 'p2'], 'touch sıralamayı yeniler');
assert.strictEqual(P.get('p2').cwd, 'C:/b'); assert.strictEqual(P.get('yok'), null); assert.strictEqual(P.get(null), null);
P.save({ id: 'p2', name: 'Observatory 2', cwd: 'C:/b' });
assert.strictEqual(P.list().length, 2, 'aynı kimlik güncellenir, çoğalmaz');
assert.strictEqual(P.save({ id: 'p3', name: 'x'.repeat(100), instructions: 'y'.repeat(9000), cwd: '' }).name.length, P.NAME_MAX, 'ad kısaltılır');
assert.strictEqual(P.get('p3').instructions.length, P.INSTR_MAX, 'talimat kısaltılır');
P.remove('p3'); P.remove('p2'); P.remove('p1');
assert.deepStrictEqual(P.list(), []);
assert.strictEqual(JSON.parse(store.get('obs-projects-v1')!).length, 0);
store.set('obs-projects-v1', 'bozuk json'); assert.deepStrictEqual(P.list(), [], 'bozuk kayıt çökertmez');

// talimatlar: ilk mesajda (özet yokken) bile eklenir; sıra PROJECT_INSTRUCTIONS, CONTEXT_SUMMARY, USER_REQUEST
assert.strictEqual(C.build([], 'merhaba'), null, 'talimat da özet de yoksa istem olduğu gibi gider');
const first = C.build([], 'merhaba', { instructions: ' Sade ol. ' }) as string;
assert.strictEqual(first, '<PROJECT_INSTRUCTIONS>\nSade ol.\n</PROJECT_INSTRUCTIONS>\n\n<USER_REQUEST>\nmerhaba\n</USER_REQUEST>');
const prior = [{ r: 'u', text: 'soru' }, { r: 'b', engine: 'claude', label: 'Sonnet', parts: [{ k: 'text', v: 'cevap' }], notice: null }];
const both = C.build(prior, 'devam', { instructions: 'Sade ol.' }) as string;
const i1 = both.indexOf('<PROJECT_INSTRUCTIONS>'), i2 = both.indexOf('<CONTEXT_SUMMARY>'), i3 = both.indexOf('<USER_REQUEST>');
assert.ok(i1 === 0 && i2 > i1 && i3 > i2, 'sıra: talimat, özet, istem');
assert.ok(!C.build(prior, 'devam')!.includes('PROJECT_INSTRUCTIONS'), 'talimat yoksa blok yok');
console.log('✔ web/projects.js + context.js: proje deposu, sıralama, sınırlar, talimat sarmalayıcı');
