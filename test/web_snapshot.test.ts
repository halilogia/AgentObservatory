// web_snapshot: Yazabilir kipi öncesi git ağaç anlık görüntüsü ve geri alma (gerçek git ile, geçici depoda)
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { restoreTree, snapshotTree } from '../src/commands/web_snapshot.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-snap-'));
const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
fs.writeFileSync(path.join(dir, '.gitignore'), 'out/\n');
fs.writeFileSync(path.join(dir, 'a.txt'), 'bir');
fs.mkdirSync(path.join(dir, 'alt dizin'));
fs.writeFileSync(path.join(dir, 'alt dizin', 'ü ş.txt'), 'türkçe ad');
git('add', '-A'); git('commit', '-q', '-m', 'ilk');
const headBefore = git('rev-parse', 'HEAD').trim();
fs.writeFileSync(path.join(dir, 'taslak.txt'), 'izlenmeyen dosya');   // izlenmeyen
fs.mkdirSync(path.join(dir, 'out')); fs.writeFileSync(path.join(dir, 'out', 'x.js'), 'ignore edilen');

const snap = await snapshotTree(dir);
assert.ok(snap && /^[0-9a-f]{40,64}$/.test(snap), 'anlık görüntü karması');
assert.strictEqual(git('status', '--porcelain').includes('taslak.txt'), true, 'gerçek indeks değişmemeli (taslak hâlâ izlenmiyor)');
assert.strictEqual(await snapshotTree(dir), snap, 'değişiklik yoksa aynı karma');

// ajan çalışıyor: değiştir, sil, ekle
fs.writeFileSync(path.join(dir, 'a.txt'), 'DEĞİŞTİ');
fs.rmSync(path.join(dir, 'alt dizin', 'ü ş.txt'));
fs.writeFileSync(path.join(dir, 'yeni.txt'), 'ajanın eklediği');
fs.writeFileSync(path.join(dir, 'taslak.txt'), 'taslak da değişti');
fs.writeFileSync(path.join(dir, 'out', 'x.js'), 'ignore edilen dosyaya dokunulmaz');

const r = await restoreTree(dir, snap!);
assert.deepStrictEqual(r, { restored: 3, removed: 1 });
assert.strictEqual(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'bir');
assert.strictEqual(fs.readFileSync(path.join(dir, 'alt dizin', 'ü ş.txt'), 'utf8'), 'türkçe ad');
assert.strictEqual(fs.readFileSync(path.join(dir, 'taslak.txt'), 'utf8'), 'izlenmeyen dosya');
assert.ok(!fs.existsSync(path.join(dir, 'yeni.txt')), 'sonradan eklenen silinmeli');
assert.strictEqual(fs.readFileSync(path.join(dir, 'out', 'x.js'), 'utf8'), 'ignore edilen dosyaya dokunulmaz', 'ignore edilene dokunma');
assert.strictEqual(git('rev-parse', 'HEAD').trim(), headBefore, 'commit geçmişi değişmemeli');
assert.deepStrictEqual(await restoreTree(dir, snap!), { restored: 0, removed: 0 }, 'zaten aynıysa iş yok');

// alt klasörden alınan anlık görüntü yalnızca o klasörü geri alır
fs.writeFileSync(path.join(dir, 'a.txt'), 'kök değişti');
const sub = path.join(dir, 'alt dizin');
const subSnap = await snapshotTree(sub);
fs.writeFileSync(path.join(sub, 'k.txt'), 'x');
await restoreTree(sub, subSnap!);
assert.ok(!fs.existsSync(path.join(sub, 'k.txt')));
assert.strictEqual(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'kök değişti', 'klasör dışına dokunulmaz');

// git deposu değil ve geçersiz karma
const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-nogit-'));
assert.strictEqual(await snapshotTree(plain), null);
await assert.rejects(() => restoreTree(dir, 'zzz'), /bad_snap/);
await assert.rejects(() => restoreTree(dir, 'a'.repeat(40)), /snap_missing/);
console.log('✔ web_snapshot: anlık görüntü, geri alma, ignore, klasör sınırı, git dışı');
