import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

/**
 * TUI içinden [O] tuşuna basıldığında Halil Emre'nin TrueColor 2D TUI AI Office'ini
 * bağımsız bir terminal penceresinde başlatır.
 */
export function openOfficeTui(onStatus?: (msg: string) => void): void {
  // Hem repo kökünden hem de dist/src altından güvenli dosya yolu çözümleme
  const possiblePaths = [
    path.resolve(process.cwd(), 'nexus_ai_office', 'tui_office', 'main.py'),
    path.resolve(__dirname, '..', '..', 'nexus_ai_office', 'tui_office', 'main.py'),
    path.resolve(__dirname, '..', 'nexus_ai_office', 'tui_office', 'main.py'),
  ];

  const officePath = possiblePaths.find((p) => fs.existsSync(p));

  if (!officePath) {
    if (onStatus) onStatus(`2D AI Ofis dosyası bulunamadı: nexus_ai_office/tui_office/main.py`);
    return;
  }

  const officeDir = path.dirname(officePath);

  if (process.platform === 'win32') {
    // Windows: Yeni konsol penceresinde Python TUI başlat
    const cmdArgs = ['/c', 'start', '🏛️ Nexus AI 2D Ofis (TrueColor TUI)', 'cmd.exe', '/k', `cd /d "${officeDir}" && python main.py`];
    const child = spawn('cmd.exe', cmdArgs, {
      detached: true,
      stdio: 'ignore',
      shell: false,
    });
    child.unref();
    if (onStatus) onStatus('Nexus 2D TUI Ofis yeni pencerede açıldı (Python/ANSI)');
  } else {
    // macOS / Linux
    const child = spawn('python3', [officePath], {
      detached: true,
      stdio: 'inherit',
      cwd: officeDir,
    });
    child.unref();
    if (onStatus) onStatus('Nexus 2D TUI Ofis başlatıldı');
  }
}
