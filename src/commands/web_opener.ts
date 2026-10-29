import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import type { Server } from 'node:http';

let activeWebServer: Server | null = null;
const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

/**
 * TUI içinden tek tuşla veya parametreyle Web panelini açar.
 * Port 8788 zaten dinleniyorsa doğrudan tarayıcıyı açar; dinlenmiyorsa arka planda
 * startWeb() başlatıp tarayıcıya yönlendirir.
 * 
 * Web dosyaları (web/ veya web.ts) mevcut değilse TUI kesinlikle çökmez;
 * durumu kullanıcıya zarifçe bildirip TUI'ın bağımsız çalışmasını sürdürür.
 */
export async function openWebPanel(port = 8788, onStatus?: (msg: string) => void): Promise<void> {
  const indexHtml = path.join(WEB_DIR, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    if (onStatus) onStatus('Web modülü (web/ klasörü) bulunamadı; TUI bağımsız olarak çalışmaya devam ediyor.');
    return;
  }

  const url = `http://127.0.0.1:${port}`;

  const isRunning = await new Promise<boolean>((resolve) => {
    const req = http.get(`${url}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });

  if (!isRunning && !activeWebServer) {
    try {
      const { startWeb } = await import('./web.ts');
      const { server } = startWeb({ port });
      activeWebServer = server;
      await new Promise<void>((resolve) => {
        if (server.listening) return resolve();
        server.once('listening', () => resolve());
      });
      if (onStatus) onStatus(`Web sunucusu başlatıldı (Port ${port})`);
    } catch (err: any) {
      if (err.code !== 'EADDRINUSE') {
        if (onStatus) onStatus(`Web sunucu başlatılamadı: ${err.message}`);
        return;
      }
    }
  }

  const openCmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
    ? `open "${url}"`
    : `xdg-open "${url}"`;

  exec(openCmd, (err) => {
    if (err && onStatus) onStatus(`Tarayıcı açılamadı: ${err.message}`);
    else if (onStatus) onStatus(`Web paneli açıldı: ${url}`);
  });
}
