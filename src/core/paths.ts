import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export function resolveBinary(name: string): string {
  const envKey = `${name.toUpperCase()}_BIN`;
  if (process.env[envKey] && fs.existsSync(process.env[envKey]!)) {
    return process.env[envKey]!;
  }

  const home = os.homedir();
  if (name === 'commandcode') {
    // Prefer the requested name; also accept the official command-code package binary.
    const names = process.platform === 'win32'
      ? ['commandcode.exe', 'commandcode.cmd', 'commandcode', 'command-code.exe', 'command-code.cmd', 'command-code']
      : ['commandcode', 'command-code'];
    const dirs = [
      ...(process.env.PATH || '').split(path.delimiter).filter(Boolean).map((p) => p.replace(/^"|"$/g, '')),
      ...(process.platform === 'win32' ? [path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'npm')] : [])
    ];
    for (const binary of names) {
      for (const dir of dirs) {
        const candidate = path.resolve(dir, binary);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      }
    }
    return 'commandcode';
  }
  const candidates: Record<string, string[]> = {
    claude: [
      path.join(home, '.local', 'bin', 'claude.exe'),
      path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
      path.join(home, 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
      'claude'
    ],
    codex: [
      path.join(home, 'AppData', 'Local', 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'),
      'codex'
    ],
    agy: [
      path.join(home, 'AppData', 'Local', 'agy', 'bin', 'agy.exe'),
      'agy'
    ],
    opencode: [
      path.join(home, '.opencode', 'bin', 'opencode.exe'),
      // npm paketinin gerçek exe'si: .cmd kabuk istediği için Node spawn'ı EINVAL verir
      path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'),
      path.join(home, 'AppData', 'Roaming', 'npm', 'opencode.cmd'),
      'opencode'
    ],
    freebuff: [
      path.join(home, 'AppData', 'Roaming', 'npm', 'freebuff.cmd'),
      path.join(home, '.freebuff', 'bin', 'freebuff.exe'),
      'freebuff'
    ]
  };

  for (const candidate of candidates[name] || []) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
    } else {
      return candidate; // System PATH fallback
    }
  }

  return name;
}

export function validateCwd(cwd?: string): string {
  if (!cwd) return process.cwd();

  const resolved = path.resolve(cwd);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Geçersiz veya bulunamayan çalışma dizini (cwd): "${cwd}"`);
  }

  // Deny execution directly in sensitive root system directories
  const normalized = resolved.toLowerCase().replace(/\\/g, '/');
  const blockedPrefixes = ['c:/windows', 'c:/windows/system32', 'c:/program files/windows'];
  if (blockedPrefixes.some((b) => normalized === b || normalized.startsWith(b + '/'))) {
    throw new Error(`Sistem dizinlerinde görev çalıştırmak güvenlik nedeniyle engellendi: "${resolved}"`);
  }

  return resolved;
}
