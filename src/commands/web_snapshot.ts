// Dosya geri alma: Yazabilir kipinde bir görev başlamadan önce klasörün git "ağaç" (tree) anlık görüntüsü alınır;
// "eski noktaya dön" denince klasör o anlık görüntüye döndürülür. Gerçek indeks (index), dal ve commit'lere DOKUNULMAZ:
// geçici bir indeks dosyasıyla `git add -A` + `git write-tree` yapılır (.gitignore'daki dosyalar dahil edilmez).
// Yalnızca verilen klasörün altı geri alınır; deponun geri kalanı etkilenmez. Git deposu değilse anlık görüntü yoktur.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TIMEOUT = 60000;
const MAX_BUFFER = 64 * 1024 * 1024;

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, env: { ...process.env, ...env }, timeout: TIMEOUT, maxBuffer: MAX_BUFFER, windowsHide: true, encoding: 'utf8' },
      (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr })) : resolve(stdout)));
  });
}

/** klasörün altındaki izlenen ve izlenmeyen (ignore edilmeyen) tüm dosyaların tree karması; git deposu değilse null */
export async function snapshotTree(cwd: string): Promise<string | null> {
  let top: string;
  try { top = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim(); } catch { return null; }
  if (!top) return null;
  const idx = path.join(os.tmpdir(), `obs-idx-${crypto.randomBytes(6).toString('hex')}`);
  try {
    await git(cwd, ['add', '-A', '--', '.'], { GIT_INDEX_FILE: idx });
    return (await git(cwd, ['write-tree'], { GIT_INDEX_FILE: idx })).trim() || null;
  } catch { return null; }
  finally { try { fs.rmSync(idx, { force: true }); } catch { /* geçici dosya */ } }
}

export interface RestoreResult { restored: number; removed: number }

/** klasörü anlık görüntüdeki haline döndürür: sonradan eklenen dosyalar silinir, değişen/silinenler geri gelir */
export async function restoreTree(cwd: string, snap: string): Promise<RestoreResult> {
  if (!/^[0-9a-f]{40,64}$/.test(snap)) throw new Error('bad_snap');
  // git uzun yol, Windows kısa (8.3) yol verebilir: karşılaştırma için ikisi de gerçek yola çevrilir
  const real = (p: string) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
  const top = real((await git(cwd, ['rev-parse', '--show-toplevel'])).trim());
  try { await git(cwd, ['cat-file', '-e', `${snap}^{tree}`]); } catch { throw new Error('snap_missing'); }
  const now = await snapshotTree(cwd);
  if (!now) throw new Error('not_git');
  if (now === snap) return { restored: 0, removed: 0 };
  const out = await git(cwd, ['diff-tree', '-r', '--no-renames', '--name-status', '-z', snap, now]);
  const parts = out.split('\0').filter(Boolean);
  const base = real(cwd).toLowerCase();
  const inside = (abs: string) => { const a = path.resolve(abs).toLowerCase(); return a === base || a.startsWith(base + path.sep); };
  const restore: string[] = []; const remove: string[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const status = parts[i], rel = parts[i + 1];
    const abs = path.resolve(top, rel);
    if (!inside(abs)) continue; // klasör dışına asla dokunma
    if (status === 'A') remove.push(abs); else restore.push(rel);
  }
  for (const f of remove) { try { fs.rmSync(f, { force: true }); } catch { /* kilitli dosya */ } }
  for (let i = 0; i < restore.length; i += 200) {
    await git(top, ['restore', `--source=${snap}`, '--worktree', '--', ...restore.slice(i, i + 200)]);
  }
  return { restored: restore.length, removed: remove.length };
}
