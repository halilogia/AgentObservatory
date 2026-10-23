// observatory doctor [--live]: hangi ajan kurulu, sürümü ne, (--live) gerçekten yanıt veriyor mu?
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolveBinary } from '../core/paths.ts';
import { classifyFailure } from '../core/failure.ts';

const ENGINES = ['claude', 'codex', 'agy', 'opencode', 'freebuff'] as const;

function versionOf(exe: string): string {
  // .cmd dosyaları Node'da kabuk olmadan çalışmaz
  const viaShell = /\.(cmd|bat)$/i.test(exe);
  // kabukta yol boşluk içerebilir: tırnakla
  const r = viaShell
    ? spawnSync(`"${exe}" --version`, { encoding: 'utf8', timeout: 20000, shell: true, windowsHide: true })
    : spawnSync(exe, ['--version'], { encoding: 'utf8', timeout: 20000, windowsHide: true });
  if (r.error) return `çalıştırılamadı: ${r.error.message}`;
  return ((r.stdout || '') + (r.stderr || '')).trim().split('\n')[0] || '(sürüm çıktısı yok)';
}

export async function runDoctor(args: string[]): Promise<void> {
  const live = args.includes('--live');
  const rows: string[][] = [['Motor', 'Durum', 'Sürüm / not', 'Yol']];
  const found: string[] = [];

  for (const name of ENGINES) {
    const exe = resolveBinary(name);
    const exists = fs.existsSync(exe);
    if (!exists) {
      rows.push([name, 'YOK', 'bulunamadı (PATH adı kullanılacak)', exe]);
      continue;
    }
    found.push(name);
    rows.push([name, 'VAR', versionOf(exe), exe]);
  }

  if (live) {
    const { globalRunner } = await import('../runtime/agent_runner.ts');
    for (const name of found.filter((n) => ['claude', 'codex', 'agy', 'opencode'].includes(n))) {
      const row = rows.find((r) => r[0] === name)!;
      try {
        const res = await globalRunner.runTask({
          agent: name, prompt: 'Reply with exactly: OK', cwd: os.tmpdir(), timeoutSeconds: 120, sandbox: 'read-only'
        } as any);
        const ok = res.status === 'completed' && /\bOK\b/.test(res.assistantText || '');
        row[1] = ok ? 'ÇALIŞIYOR' : 'HATA';
        if (!ok) row[2] = `${row[2]} | ${res.status}: ${classifyFailure(res.assistantText || '').kind}`;
      } catch (err: any) {
        row[1] = 'HATA';
        row[2] = `${row[2]} | ${classifyFailure(err.message).kind}: ${String(err.message).slice(0, 80)}`;
      }
    }
  }

  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  for (const r of rows) console.log(r.map((c, i) => c.padEnd(widths[i])).join('  '));
  if (!live) console.log('\nGerçek yanıt denemesi için: observatory doctor --live (kısa bir görev çalıştırır)');
}
