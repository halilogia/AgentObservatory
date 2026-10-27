import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import type { EventStore } from '../core/event_store.ts';
import type { AgentType } from '../core/types.ts';
import type { AgentCapability, AgentDescriptor } from '../core/mission_types.ts';
import { classifyFailure } from '../core/failure.ts';
import { resolveBinary } from '../core/paths.ts';

export interface CommandOptions {
  taskId?: string;
  prompt: string;
  cwd?: string;
  sessionId?: string | null;
  dangerouslySkipPermissions?: boolean;
  sandbox?: string;
  timeoutSeconds?: number;
  effort?: string;
  model?: string;
}

export interface BuiltCommand {
  exe: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export abstract class BaseAdapter {
  readonly name: AgentType;

  constructor(name: AgentType) {
    this.name = name;
  }

  abstract buildCommand(opts: CommandOptions): BuiltCommand;

  abstract handleStdoutLine(line: string, taskId: string, store: EventStore): void;

  getCapabilities(): AgentCapability[] {
    return [];
  }

  supports(cap: AgentCapability): boolean {
    return this.getCapabilities().includes(cap);
  }

  protected probeBinary(name: string): { isAvailable: boolean; version?: string; exePath?: string } {
    try {
      const exe = resolveBinary(name);
      const exists = fs.existsSync(exe);
      if (!exists) {
        return { isAvailable: false, exePath: exe };
      }
      const viaShell = /\.(cmd|bat)$/i.test(exe);
      const r = viaShell
        ? spawnSync(`"${exe}" --version`, { encoding: 'utf8', timeout: 5000, shell: true, windowsHide: true })
        : spawnSync(exe, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
      const version = ((r.stdout || '') + (r.stderr || '')).trim().split('\n')[0] || undefined;
      return {
        isAvailable: true,
        version: version && !r.error ? version : undefined,
        exePath: exe
      };
    } catch {
      return { isAvailable: false };
    }
  }

  protected cachedDescriptor?: AgentDescriptor;

  async probe(forceRefresh = false): Promise<AgentDescriptor> {
    if (!forceRefresh && this.cachedDescriptor) {
      return this.cachedDescriptor;
    }
    const info = this.probeBinary(this.name);
    const desc: AgentDescriptor = {
      agent: this.name,
      displayName: this.name,
      version: info.version,
      executablePath: info.exePath,
      isAvailable: info.isAvailable,
      capabilities: this.getCapabilities(),
      supportedControls: {
        canPause: false,
        canResume: false,
        canInspectDiff: false,
        supportsStructuredApproval: false,
        supportsStreamingJson: false,
        supportsModelSwitching: false
      },
      probedAt: Date.now()
    };
    this.cachedDescriptor = desc;
    return desc;
  }

  handleExit(code: number | null, taskId: string, store: EventStore, stderr: string): void {
    const task = store.getTask(taskId);
    if (!task) return;

    // Do NOT overwrite immutable terminal states (e.g. if the task was already cancelled)
    if (TERMINAL_STATUSES.has(task.status)) {
      return;
    }

    if (code === 0) {
      store.recordEvent({
        id: `evt_exit_${taskId}`,
        taskId,
        sessionId: task.sessionId,
        agent: this.name,
        tier: 1,
        type: 'task.completed',
        data: { exitCode: code, result: task.assistantText },
        timestamp: Date.now()
      });
    } else {
      // Kota / kimlik / model hatası ayrımı: orkestratör ve 3D ofis "bozuk" ile "bekliyor"u ayırt eder
      const failure = classifyFailure(`${stderr}\n${task.assistantText || ''}`);
      store.recordEvent({
        id: `evt_err_${taskId}`,
        taskId,
        sessionId: task.sessionId,
        agent: this.name,
        tier: 1,
        type: 'task.failed',
        data: { exitCode: code, error: stderr.trim() || `Süreç çıkış kodu: ${code}`, errorKind: failure.kind, ...(failure.cooldownMs ? { cooldownMs: failure.cooldownMs } : {}) },
        timestamp: Date.now()
      });
    }
  }
}
