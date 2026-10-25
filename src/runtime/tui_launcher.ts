import { spawn, execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const LAUNCH_GUI_PS1 = process.env.OBSERVATORY_LAUNCH_GUI || path.join(os.homedir(), 'MasterBrain', 'tools', 'launch_gui.ps1');
const LOCK_FILE = path.join(os.tmpdir(), 'agent_observatory_tui.lock');
const DEBOUNCE_MS = 15000;

// Açılan pencere: varsayılan "tree" = birden fazla ajanı ajan başına 2 satırla gösteren ağaç paneli (Enter ayrıntı, O tam sohbet).
// OBSERVATORY_TUI_MODE=chat: son oturumu ajanın CLI görünümünde canlı gösterir; =watch: eski pano.
const VIEW_ARGS = process.env.OBSERVATORY_TUI_MODE === 'watch' ? 'watch'
  : process.env.OBSERVATORY_TUI_MODE === 'chat' ? 'chat latest --follow'
  : 'tree';

let lastLaunchAt = 0;

function resolveCliPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', 'cli.ts');
}

/** Unconditionally spawns the visible TUI watcher window (non-blocking). */
export function launchTuiWindow(): void {
  const tuiPath = resolveCliPath();
  if (fs.existsSync(LAUNCH_GUI_PS1)) {
    spawn('pwsh', [
      '-ExecutionPolicy', 'Bypass',
      '-File', LAUNCH_GUI_PS1,
      '-ExePath', 'C:\\Windows\\System32\\cmd.exe',
      '-Arguments', `/c node --experimental-strip-types "${tuiPath}" ${VIEW_ARGS}`
    ], { stdio: 'ignore', windowsHide: false });
  } else {
    spawn('cmd.exe', ['/c', 'start', 'node', '--experimental-strip-types', tuiPath, ...VIEW_ARGS.split(' ')], { stdio: 'ignore', windowsHide: false });
  }
}

function isDisabled(): boolean {
  if (process.env.OBSERVATORY_NO_AUTO_TUI === '1') return true;
  if (process.env.NODE_ENV === 'test') return true;
  if (process.platform !== 'win32') return true;
  // Test suite entry points (npm test / test:integration) run files under test/
  const entry = String(process.argv[1] || '').replace(/\\/g, '/');
  if (/\/test\//.test(entry) || process.execArgv.includes('--test')) return true;
  return false;
}

function isLockFresh(): boolean {
  try {
    return Date.now() - fs.statSync(LOCK_FILE).mtimeMs < DEBOUNCE_MS;
  } catch {
    return false;
  }
}

/**
 * Opens the TUI monitor when a task starts, unless a watcher is already running
 * or was just spawned. Never throws, never blocks.
 */
export function autoLaunchTui(): void {
  try {
    if (isDisabled()) return;
    const now = Date.now();
    if (now - lastLaunchAt < DEBOUNCE_MS || isLockFresh()) return;
    lastLaunchAt = now;
    try { fs.writeFileSync(LOCK_FILE, String(process.pid)); } catch {}

    // Detect an already running watcher process (async, so the task path is never blocked)
    const query = "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'cli\\.ts\"?\\s+(watch|chat)' } | Measure-Object | Select-Object -ExpandProperty Count";
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', query], { windowsHide: true, timeout: 8000 }, (err, stdout) => {
      try {
        if (!err && parseInt(String(stdout).trim(), 10) > 0) return;
        launchTuiWindow();
      } catch {
        // swallow
      }
    });
  } catch {
    // Auto-launch must never affect the task path
  }
}
