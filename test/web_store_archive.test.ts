// web/store.js: otomatik 30 günlük arşivleme ve manuel arşivleme testleri
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// Mock browser localStorage & window
const storage = new Map<string, string>();
const fakeWindow: any = {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, String(v)),
    removeItem: (k: string) => storage.delete(k)
  }
};

const storeCode = fs.readFileSync(path.resolve('web/store.js'), 'utf8');
const runFn = new Function('window', storeCode);
runFn(fakeWindow);

const Store = fakeWindow.ObsStore;
assert.ok(Store, 'ObsStore yüklenmeli');

// 1. Yeni sohbet (arşivlenmemiş)
const now = Date.now();
const recentChat = { id: 'c_recent', title: 'Yeni Sohbet', updated: now - 5 * 86400 * 1000, messages: [] };
assert.strictEqual(Store.isArchived(recentChat, now), false, '5 günlük sohbet arşivde olmamalı');

// 2. 30 günden eski sohbet (otomatik arşiv)
const oldChat = { id: 'c_old', title: 'Eski Sohbet', updated: now - 35 * 86400 * 1000, messages: [] };
assert.strictEqual(Store.isArchived(oldChat, now), true, '35 günlük sohbet otomatik arşivde olmalı');

// 3. Manuel arşivleme (flag = true)
const manualArcChat = { id: 'c_manual', title: 'Manuel Arşiv', updated: now - 2 * 86400 * 1000, archived: true, messages: [] };
assert.strictEqual(Store.isArchived(manualArcChat, now), true, 'Manuel arşivlenmiş sohbet süreden bağımsız arşivde olmalı');

// 4. Manuel arşivden çıkarma (flag = false)
const unarchivedOldChat = { id: 'c_unarc', title: 'Arşivden Çıkarılmış', updated: now - 40 * 86400 * 1000, archived: false, messages: [] };
assert.strictEqual(Store.isArchived(unarchivedOldChat, now), false, 'archived: false ise 40 günlük de olsa aktif olmalı');

// 5. Store.save ve Store.setArchived entegrasyonu
Store.save(recentChat);
assert.strictEqual(Store.list().length, 1);
Store.setArchived(recentChat.id, true);
assert.strictEqual(Store.get(recentChat.id).archived, true, 'setArchived true olarak kaydedilmeli');
Store.setArchived(recentChat.id, false);
assert.strictEqual(Store.get(recentChat.id).archived, false, 'setArchived false olarak güncellenmeli');

console.log('✔ web_store_archive: 30 günlük otomatik arşivleme ve manuel arşiv kontrolü başarılı');
