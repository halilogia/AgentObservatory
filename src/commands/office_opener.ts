import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * TUI içinden [O] tuşuna basıldığında Halil Emre'nin TrueColor 2D TUI AI Office'ini
 * bağımsız bir terminal penceresinde başlatır.
 *
 * ES Module uyumlu güvenli dosya yolu çözümlemesi kullanır ve host sürecin
 * (Observatory TUI) asla çökmemesi için tam hata yakalama garantisi verir.
 */
export function openOfficeTui(onStatus?: (msg: string) => void): void {
  try {
    let scriptDir = '';
    try {
      scriptDir = path.dirname(fileURLToPath(import.meta.url));
    } catch {
      scriptDir = process.cwd();
    }

    const possiblePaths = [
      path.resolve(scriptDir, '..', '..', 'nexus_ai_office', 'tui_office', 'main.py'),
      path.resolve(scriptDir, '..', 'nexus_ai_office', 'tui_office', 'main.py'),
      path.resolve(process.cwd(), 'nexus_ai_office', 'tui_office', 'main.py'),
      path.resolve('C:\\Users\\Halil Emre\\Desktop\\GitHub\\Public\\AgentObservatory\\nexus_ai_office\\tui_office\\main.py'),
    ];

    const officePath = possiblePaths.find((p) => fs.existsSync(p));

    if (!officePath) {
      if (onStatus) onStatus('2D AI Ofis dosyasi bulunamadi: nexus_ai_office/tui_office/main.py');
      return;
    }

    const officeDir = path.dirname(officePath);

    if (process.platform === 'win32') {
      // Windows: Temiz ASCII başlık ve /D parametresi ile bağımsız konsol penceresi aç.
      // cmd.exe start sözdiziminde ilk tırnaklı argüman pencere başlığı sayılır.
      // cmd.exe /c içinde && ayrıştırma sorunlarını önlemek için /D ile çalışma dizini doğrudan verilir.
      const cmdArgs = ['/c', 'start', 'Nexus AI 2D Office', '/D', officeDir, 'cmd.exe', '/k', 'python main.py'];
      const child = spawn('cmd.exe', cmdArgs, {
        cwd: officeDir,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.on('error', (err) => {
        if (onStatus) onStatus(`Ofis baslatma hatasi: ${err.message}`);
      });
      child.unref();
      if (onStatus) onStatus('Nexus 2D TUI Ofis yeni pencerede acildi');
    } else {
      // macOS / Linux
      const child = spawn('python3', [officePath], {
        detached: true,
        stdio: 'ignore',
        cwd: officeDir,
      });
      child.on('error', (err) => {
        if (onStatus) onStatus(`Ofis baslatma hatasi: ${err.message}`);
      });
      child.unref();
      if (onStatus) onStatus('Nexus 2D TUI Ofis baslatildi');
    }
  } catch (err: any) {
    if (onStatus) onStatus(`2D Ofis hatasi: ${err?.message || err}`);
  }
}
