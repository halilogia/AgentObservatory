// web/router.js: otomatik yönlendirme kuralları, kurulu olmayan motoru atlama, yazma güvenliği, geri düşme
import assert from 'node:assert';
import '../web/router.js';
import { ENGINES, TEAMS } from '../src/commands/web.ts';

const R = (globalThis as any).ObsRouter;
assert.ok(R, 'ObsRouter yüklenmeli');
const eng = (over: Record<string, any> = {}) => ENGINES.map((e) => ({ ...e, installed: true, limitedUntil: null, ...(over[e.id] || {}) }));
const cur = { engine: 'agy', model: 'gemini-3.8-flash' };
const NOW = 1e12;

// takım meta bilgisi: her motorun takımı tanımlı, renk + dil anahtarı tek sabitte
assert.deepStrictEqual(ENGINES.map((e) => [e.id, e.team]), [['claude', 'turuncu'], ['codex', 'kirmizi'], ['opencode', 'siyah'], ['commandcode', 'siyah'], ['agy', 'mavi']]);
for (const e of ENGINES) assert.ok(TEAMS.some((t) => t.id === e.team), 'bilinmeyen takım: ' + e.team);
assert.ok(TEAMS.every((t) => /^#[0-9A-F]{6}$/i.test(t.color) && t.labelKey === 'team.' + t.id));

// kurallar
const pick = (p: string, o: any = {}, engines = eng()) => R.pick(p, engines, { current: cur, now: NOW, ...o });
assert.strictEqual(pick('bu fonksiyonu refactor et').engine, 'claude');
assert.strictEqual(pick('add a login feature, implement it').engine, 'claude');
assert.strictEqual(pick('bu PR için kod incelemesi yap').engine, 'codex');
assert.strictEqual(pick('write unit tests for parser').engine, 'codex');
assert.strictEqual(pick('bu dosyayı denetle').reason, 'router.review');
assert.strictEqual(pick('bu 300 sayfayı özetle').engine, 'opencode');
assert.strictEqual(pick('translate all strings to German').engine, 'opencode');
assert.strictEqual(pick('toplu çeviri yap').reason, 'router.bulk');
assert.strictEqual(pick('ask gemini what it thinks').engine, 'agy');
assert.strictEqual(pick('kodu incele ve düzelt').engine, 'codex', 'denetim kodu yazmadan önce gelir');
assert.strictEqual(pick('refactor et').model, 'sonnet');

// kurulu olmayan / limitli motor atlanır
assert.strictEqual(pick('refactor et', {}, eng({ claude: { installed: false } })).reason, 'router.fallback');
assert.strictEqual(pick('refactor et', {}, eng({ claude: { limitedUntil: NOW + 1000 } })).engine, 'agy', 'limitli: mevcut seçime düşer');
assert.strictEqual(pick('refactor et', {}, eng({ claude: { limitedUntil: NOW - 1000 } })).engine, 'claude', 'süresi geçen limit sayılmaz');
assert.strictEqual(pick('incele ve düzelt', {}, eng({ codex: { installed: false } })).engine, 'claude', 'sıradaki uyan kurala geçer');
const blackFallback = pick('toplu çeviri', { write: true }, eng({ opencode: { installed: false } }));
assert.strictEqual(blackFallback.engine, 'commandcode');
assert.strictEqual(blackFallback.mode, 'read', 'Command Code fallback preserves read-only mode');

// geri düşme
const none = pick('merhaba, nasılsın?');
assert.deepStrictEqual([none.engine, none.model, none.reason, none.routed], ['agy', 'gemini-3.8-flash', 'router.fallback', false]);
assert.strictEqual(R.pick('x', [], {}).engine, '');

// yazma güvenliği: yazma yalnız kullanıcı seçtiyse VE motor destekliyorsa
assert.strictEqual(pick('bu özelliği ekle', { write: false }).mode, 'read');
assert.strictEqual(pick('bu özelliği ekle', { write: true }).mode, 'read', 'claude yazamaz: izin genişlemez');
assert.strictEqual(pick('toplu çeviri', { write: true }).mode, 'write', 'opencode destekler ve kullanıcı seçti');
assert.strictEqual(pick('toplu çeviri', { write: false }).mode, 'read', 'kullanıcı seçmediyse asla yazma');
assert.strictEqual(pick('merhaba', { write: true }).mode, 'read', 'agy yazamaz');
for (const p of ['denetle', 'refactor', 'özetle', 'gemini', 'selam']) assert.strictEqual(pick(p, { write: false }).mode, 'read');
console.log('✔ web/router.js: kurallar, atlama, yazma güvenliği, geri düşme');
