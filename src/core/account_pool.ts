import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export type PooledAgent = 'agy' | 'claude';

export interface AccountEntry {
  name: string;
  agent: PooledAgent;
  label?: string;
  createdAt: number;
  updatedAt: number;
  cooldownUntil?: number;
  lastError?: string;
  /** agy: base64-encoded Windows Credential Manager blob for LegacyGeneric:target=gemini:antigravity */
  credentialBase64?: string;
  /** claude: isolated CLAUDE_CONFIG_DIR path */
  configDir?: string;
}

export interface AccountPoolState {
  activeAccount: Partial<Record<PooledAgent, string>>;
  accounts: AccountEntry[];
}

export interface CredentialAdapter {
  readAgyCredential(): string | null;
  writeAgyCredential(base64Blob: string): boolean;
}

const AGY_CRED_TARGET = 'gemini:antigravity';

const PS_CRED_HELPER = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class AgyCredHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CredRead(string target, uint type, uint reservedFlag, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CredWrite([In] ref CREDENTIAL userCredential, [In] uint flags);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree([In] IntPtr cred);

    public static string ReadBase64(string target) {
        IntPtr ptr;
        if (!CredRead(target, 1, 0, out ptr)) return "";
        try {
            CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
            if (cred.CredentialBlobSize == 0 || cred.CredentialBlob == IntPtr.Zero) return "";
            byte[] bytes = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, bytes, 0, (int)cred.CredentialBlobSize);
            return Convert.ToBase64String(bytes);
        } finally {
            CredFree(ptr);
        }
    }

    public static bool WriteBase64(string target, string b64) {
        byte[] bytes = Convert.FromBase64String(b64);
        IntPtr blob = Marshal.AllocHGlobal(bytes.Length);
        try {
            Marshal.Copy(bytes, 0, blob, bytes.Length);
            CREDENTIAL cred = new CREDENTIAL();
            cred.Flags = 0;
            cred.Type = 1; // CRED_TYPE_GENERIC
            cred.TargetName = target;
            cred.CredentialBlobSize = (uint)bytes.Length;
            cred.CredentialBlob = blob;
            cred.Persist = 2; // CRED_PERSIST_LOCAL_MACHINE
            cred.UserName = "antigravity";
            return CredWrite(ref cred, 0);
        } finally {
            Marshal.FreeHGlobal(blob);
        }
    }
}
"@
`;

export class WindowsCredentialAdapter implements CredentialAdapter {
  readAgyCredential(): string | null {
    if (process.platform !== 'win32') return null;
    try {
      const script = `${PS_CRED_HELPER}\n[AgyCredHelper]::ReadBase64('${AGY_CRED_TARGET}')`;
      const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true
      }).trim();
      return out.length > 0 ? out : null;
    } catch (err) {
      if (process.env.DEBUG_ACCOUNTS) console.error('[AccountPool] readAgyCredential error:', err);
      return null;
    }
  }

  writeAgyCredential(base64Blob: string): boolean {
    if (process.platform !== 'win32' || !base64Blob) return false;
    try {
      const safeB64 = base64Blob.replace(/[^A-Za-z0-9+/=]/g, '');
      const script = `${PS_CRED_HELPER}\nif ([AgyCredHelper]::WriteBase64('${AGY_CRED_TARGET}', '${safeB64}')) { 'OK' } else { 'FAIL' }`;
      const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true
      }).trim();
      return out.endsWith('OK');
    } catch (err) {
      if (process.env.DEBUG_ACCOUNTS) console.error('[AccountPool] writeAgyCredential error:', err);
      return false;
    }
  }
}

export class AccountPoolManager {
  private baseDir: string;
  private stateFile: string;
  private credAdapter: CredentialAdapter;
  private now: () => number;

  constructor(opts?: { baseDir?: string; credAdapter?: CredentialAdapter; now?: () => number }) {
    this.baseDir = opts?.baseDir || path.join(os.homedir(), '.agent-observatory');
    this.stateFile = path.join(this.baseDir, 'accounts.json');
    this.credAdapter = opts?.credAdapter || new WindowsCredentialAdapter();
    this.now = opts?.now || Date.now;
  }

  private loadState(): AccountPoolState {
    try {
      if (fs.existsSync(this.stateFile)) {
        const raw = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        if (raw && Array.isArray(raw.accounts)) {
          return {
            activeAccount: raw.activeAccount || {},
            accounts: raw.accounts
          };
        }
      }
    } catch (err) {
      if (process.env.DEBUG_ACCOUNTS) console.error('[AccountPool] loadState fallback to empty state:', err);
    }
    return { activeAccount: {}, accounts: [] };
  }

  private saveState(state: AccountPoolState): void {
    fs.mkdirSync(this.baseDir, { recursive: true });
    const tmp = `${this.stateFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, this.stateFile);
  }

  /** Mevcut agy (Windows Credential Manager) veya claude oturumunu verilen adla havuza kaydeder. */
  saveAccount(agent: PooledAgent, name: string, label?: string): AccountEntry {
    const cleanName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!cleanName) throw new Error('Geçerli bir hesap adı belirtilmelidir.');
    const state = this.loadState();
    const now = this.now();
    let existing = state.accounts.find((a) => a.agent === agent && a.name === cleanName);

    if (agent === 'agy') {
      const blob = this.credAdapter.readAgyCredential();
      if (!blob) {
        throw new Error('Windows Credential Manager üzerinde aktif agy.exe oturumu (gemini:antigravity) bulunamadı. Önce `agy` içinde giriş yapın.');
      }
      if (!existing) {
        existing = { name: cleanName, agent: 'agy', label, createdAt: now, updatedAt: now, credentialBase64: blob };
        state.accounts.push(existing);
      } else {
        existing.credentialBase64 = blob;
        if (label !== undefined) existing.label = label;
        existing.updatedAt = now;
        delete existing.cooldownUntil;
        delete existing.lastError;
      }
      state.activeAccount.agy = cleanName;
    } else {
      const configDir = path.join(this.baseDir, 'accounts', 'claude', cleanName);
      fs.mkdirSync(configDir, { recursive: true });
      if (!existing) {
        existing = { name: cleanName, agent: 'claude', label, createdAt: now, updatedAt: now, configDir };
        state.accounts.push(existing);
      } else {
        existing.configDir = configDir;
        if (label !== undefined) existing.label = label;
        existing.updatedAt = now;
        delete existing.cooldownUntil;
        delete existing.lastError;
      }
      if (!state.activeAccount.claude) state.activeAccount.claude = cleanName;
    }

    this.saveState(state);
    return existing;
  }

  listAccounts(agent?: PooledAgent): Array<AccountEntry & { isActive: boolean; isAvailable: boolean; remainingCooldownMs: number }> {
    const state = this.loadState();
    const now = this.now();
    return state.accounts
      .filter((a) => !agent || a.agent === agent)
      .map((a) => {
        const rem = Math.max(0, (a.cooldownUntil || 0) - now);
        return {
          ...a,
          isActive: state.activeAccount[a.agent] === a.name,
          isAvailable: rem === 0,
          remainingCooldownMs: rem
        };
      });
  }

  getActiveAccount(agent: PooledAgent): AccountEntry | null {
    const state = this.loadState();
    const activeName = state.activeAccount[agent];
    if (!activeName) return null;
    return state.accounts.find((a) => a.agent === agent && a.name === activeName) || null;
  }

  switchAccount(agent: PooledAgent, name: string): AccountEntry {
    const state = this.loadState();
    const target = state.accounts.find((a) => a.agent === agent && a.name === name);
    if (!target) {
      throw new Error(`${agent} için "${name}" adlı hesap bulunamadı.`);
    }
    if (agent === 'agy') {
      if (!target.credentialBase64) {
        throw new Error(`"${name}" hesabında kayıtlı agy kimlik bilgisi yok.`);
      }
      const ok = this.credAdapter.writeAgyCredential(target.credentialBase64);
      if (!ok) {
        throw new Error(`"${name}" hesabı Windows Credential Manager'a yazılamadı.`);
      }
    }
    state.activeAccount[agent] = target.name;
    target.updatedAt = this.now();
    this.saveState(state);
    return target;
  }

  markExhausted(agent: PooledAgent, name: string, cooldownMs: number, error?: string): void {
    const state = this.loadState();
    const target = state.accounts.find((a) => a.agent === agent && a.name === name);
    if (!target) return;
    target.cooldownUntil = this.now() + Math.max(1000, cooldownMs);
    if (error) target.lastError = error.slice(0, 300);
    target.updatedAt = this.now();
    this.saveState(state);
  }

  clearCooldown(agent: PooledAgent, name: string): boolean {
    const state = this.loadState();
    const target = state.accounts.find((a) => a.agent === agent && a.name === name);
    if (!target) return false;
    delete target.cooldownUntil;
    delete target.lastError;
    target.updatedAt = this.now();
    this.saveState(state);
    return true;
  }

  removeAccount(agent: PooledAgent, name: string): boolean {
    const state = this.loadState();
    const idx = state.accounts.findIndex((a) => a.agent === agent && a.name === name);
    if (idx < 0) return false;
    state.accounts.splice(idx, 1);
    if (state.activeAccount[agent] === name) {
      const next = state.accounts.find((a) => a.agent === agent);
      state.activeAccount[agent] = next ? next.name : undefined;
    }
    this.saveState(state);
    return true;
  }

  /**
   * Mevcut hesabı kota doldu olarak işaretler ve havuzda uygun (cooldown'da olmayan)
   * bir sonraki hesaba otomatik geçiş yapar. Uygun hesap yoksa null döner.
   */
  failoverToNext(agent: PooledAgent, cooldownMs: number, errorText?: string, currentAccountName?: string): AccountEntry | null {
    const state = this.loadState();
    const now = this.now();
    const curName = currentAccountName || state.activeAccount[agent];
    if (curName) {
      const cur = state.accounts.find((a) => a.agent === agent && a.name === curName);
      if (cur) {
        cur.cooldownUntil = now + Math.max(1000, cooldownMs);
        if (errorText) cur.lastError = errorText.slice(0, 300);
        cur.updatedAt = now;
      }
    }

    const candidates = state.accounts.filter(
      (a) => a.agent === agent && a.name !== curName && (!a.cooldownUntil || a.cooldownUntil <= now)
    );
    this.saveState(state);
    if (candidates.length === 0) return null;

    const next = candidates[0];
    try {
      return this.switchAccount(agent, next.name);
    } catch (err) {
      if (process.env.DEBUG_ACCOUNTS) console.error('[AccountPool] switchAccount during failover failed:', err);
      return null;
    }
  }

  /** Görev başlatılırken seçilecek hesap için ortam değişkenlerini ve aktif hesabı hazırlar. */
  prepareAccountForTask(agent: string, requestedAccount?: string): { accountName?: string; env: Record<string, string> } {
    if (agent !== 'agy' && agent !== 'claude') return { env: {} };
    const pooled = agent as PooledAgent;
    const state = this.loadState();
    const now = this.now();

    let chosen: AccountEntry | undefined;
    if (requestedAccount) {
      chosen = state.accounts.find((a) => a.agent === pooled && a.name === requestedAccount);
      if (!chosen) {
        throw new Error(`${pooled} havuzunda "${requestedAccount}" adlı hesap bulunamadı.`);
      }
    } else {
      const activeName = state.activeAccount[pooled];
      const active = activeName ? state.accounts.find((a) => a.agent === pooled && a.name === activeName) : undefined;
      if (active && (!active.cooldownUntil || active.cooldownUntil <= now)) {
        chosen = active;
      } else {
        chosen = state.accounts.find((a) => a.agent === pooled && (!a.cooldownUntil || a.cooldownUntil <= now));
      }
    }

    if (!chosen) return { env: {} };

    if (pooled === 'agy' && state.activeAccount.agy !== chosen.name) {
      this.switchAccount('agy', chosen.name);
    } else if (pooled === 'claude' && state.activeAccount.claude !== chosen.name) {
      state.activeAccount.claude = chosen.name;
      this.saveState(state);
    }

    const env: Record<string, string> = {};
    if (pooled === 'claude' && chosen.configDir) {
      env.CLAUDE_CONFIG_DIR = chosen.configDir;
    }
    return { accountName: chosen.name, env };
  }
}

export const globalAccountPool = new AccountPoolManager();
