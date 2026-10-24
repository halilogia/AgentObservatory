// web/i18n.js + dil dosyaları: anahtar eşitliği, kullanılan her anahtarın var olması, ara değer, çoğul, yedek dil
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../web/i18n.js';
import '../web/lang-tr.js';
import '../web/lang-en.js';
import { ENGINES } from '../src/commands/web.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const i18n = (globalThis as any).ObsI18n;
assert.ok(i18n, 'ObsI18n yüklenmeli');

// 1) iki dilde aynı anahtarlar
const tr: string[] = i18n.keys('tr').sort(), en: string[] = i18n.keys('en').sort();
assert.deepStrictEqual(tr.filter((k) => !en.includes(k)), [], 'İngilizcede eksik anahtarlar');
assert.deepStrictEqual(en.filter((k) => !tr.includes(k)), [], 'Türkçede eksik anahtarlar');

// 2) kodda ve HTML'de kullanılan anahtarların hepsi tanımlı
const used = new Set<string>();
const app = read('web/app.js'), html = read('web/index.html');
for (const m of app.matchAll(/\bt\('([\w.]+)'/g)) used.add(m[1]);
for (const m of html.matchAll(/data-i18n="([\w.]+)"/g)) used.add(m[1]);
for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) used.add(pair.split(':')[1].trim());
for (const k of used) { if (k.endsWith('.')) continue; /* t('api.' + kod) gibi dinamik önek: aşağıda aile olarak sınanır */ assert.ok(tr.includes(k) || tr.includes(k + '_other'), `anahtar tanımsız: ${k}`); /* çoğul anahtarlar key_one / key_other */ }

// 3) dinamik anahtar aileleri
for (const x of ['low', 'medium', 'high', 'xhigh', 'max']) assert.ok(tr.includes('effort.' + x), 'effort.' + x);
for (const k of ['rate_limit', 'rate_limit_wait', 'auth', 'model_unsupported', 'permission', 'spawn_failed']) assert.ok(tr.includes('err.' + k), 'err.' + k);
for (const c of ['model', 'new', 'folder', 'write', 'history', 'copy']) { assert.ok(tr.includes('slash.' + c) && tr.includes('slashName.' + c), 'slash ' + c); }
const webSrc = read('src/commands/web.ts');
for (const m of webSrc.matchAll(/fail\(\d+, '(\w+)'/g)) assert.ok(tr.includes('api.' + m[1]), 'sunucu hata kodu çevirisi yok: ' + m[1]);
for (const e of ENGINES) {
  if (e.note) assert.ok(tr.includes(e.note), 'motor notu çevirisi yok: ' + e.note);
  for (const mo of e.models) assert.ok(tr.includes(mo.sub), 'model açıklaması çevirisi yok: ' + mo.sub);
}
assert.ok(tr.includes('models.free'), 'OpenCode canlı modelleri için models.free');

// 4) davranış: ara değer, çoğul, yedek dil, dil değiştirme
i18n.init({ lng: 'en', fallbackLng: 'tr' });
assert.strictEqual(i18n.t('mode.noWrite', { engine: 'agy' }), 'agy: no write mode');
assert.strictEqual(i18n.t('time.hours', { count: 1 }), '1 hour');
assert.strictEqual(i18n.t('time.hours', { count: 3 }), '3 hours');
assert.strictEqual(i18n.t('olmayan.anahtar'), 'olmayan.anahtar', 'eksik anahtar anahtarın kendisini döner');
let fired = ''; i18n.on('languageChanged', (l: string) => { fired = l; });
i18n.changeLanguage('tr');
assert.strictEqual(fired, 'tr'); assert.strictEqual(i18n.language, 'tr');
assert.strictEqual(i18n.t('time.hours', { count: 3 }), '3 saat');
assert.strictEqual(i18n.t('effort.xhigh'), 'X-yüksek');
i18n.changeLanguage('de'); assert.strictEqual(i18n.language, 'tr', 'desteklenmeyen dil yok sayılır');
console.log('✔ web i18n: anahtar eşitliği, kullanım kapsamı, ara değer, çoğul, dil değişimi');
