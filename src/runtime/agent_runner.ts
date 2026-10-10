import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import { EventStore, globalStore } from '../core/event_store.ts';
import { createEvent } from '../core/types.ts';
import type { TaskSummary } from '../core/types.ts';
import { BaseAdapter } from '../adapters/base_adapter.ts';
import { ClaudeAdapter } from '../adapters/claude_adapter.ts';
import { CodexAdapter } from '../adapters/codex_adapter.ts';
import { AgyAdapter } from '../adapters/agy_adapter.ts';

export interface RunTaskOptions {
  agent: string;
  prompt: string;
  cwd?: string;
  sessionId?: string | null;
  timeoutSeconds?: number;
  dangerouslySkipPermissions?: boolean;
}

interface ActiveProcessEntry {
  child: ChildProcess;
  timer: NodeJS.Timeout;
  options: RunTaskOptions;
}

export class AgentRunner {
  private store: EventStore;
  private adapters: Map<string, BaseAdapter> = new Map();
  private activeProcesses: Map<string, ActiveProcessEntry> = new Map();

  constructor(store: EventStore = globalStore) {
    this.store = store;
    this.registerAdapter(new ClaudeAdapter());
    this.registerAdapter(new CodexAdapter());
    this.registerAdapter(new AgyAdapter());
  }

  registerAdapter(adapter: BaseAdapter): void {
    this.adapters.set(adapter.name.toLowerCase(), adapter);
  }

  getAdapter(agentName: string): BaseAdapter | null {
    return this.adapters.get(String(agentName).toLowerCase()) || null;
  }

  async runTask(options: RunTaskOptions): Promise<TaskSummary> {
    const {
      agent,
      prompt,
      cwd,
      sessionId = null,
      timeoutSeconds = 300
    } = options;

    const adapter = this.getAdapter(agent);
    if (!adapter) {
      throw new Error(`Desteklenmeyen veya tanımlanmamış ajan: "${agent}"`);
    }

    const taskId = 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

    this.store.recordEvent(createEvent({
      taskId,
      sessionId,
      agent: adapter.name,
      tier: 1,
      type: 'task.started',
      data: { prompt, cwd: cwd || process.cwd(), timeoutSeconds }
    }));

    const cmd = adapter.buildCommand(options);

    return new Promise<TaskSummary>((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = spawn(cmd.exe, cmd.args, {
          cwd: cmd.cwd,
          env: cmd.env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        });
      } catch (err: any) {
        this.store.recordEvent(createEvent({
          taskId,
          sessionId,
          agent: adapter.name,
          tier: 1,
          type: 'task.failed',
          data: { error: `Süreç başlatılamadı: ${err.message}` }
        }));
        return reject(err);
      }

      let stderr = '';

      const timer = setTimeout(() => {
        this.cancelTask(taskId, `Zaman aşımı (${timeoutSeconds}s)`);
      }, timeoutSeconds * 1000);

      this.activeProcesses.set(taskId, { child, timer, options });

      if (child.stdout) {
        const rl = readline.createInterface({ input: child.stdout, terminal: false });
        rl.on('line', (line) => {
          try {
            adapter.handleStdoutLine(line, taskId, this.store);
          } catch {
            // Stream parse safety
          }
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString('utf8');
        });
      }

      child.on('error', (err) => {
        clearTimeout(timer);
        this.activeProcesses.delete(taskId);
        this.store.recordEvent(createEvent({
          taskId,
          sessionId,
          agent: adapter.name,
          tier: 1,
          type: 'task.failed',
          data: { error: err.message }
        }));
        reject(err);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        this.activeProcesses.delete(taskId);

        adapter.handleExit(code, taskId, this.store, stderr);

        const summary = this.store.getTask(taskId);
        if (summary) {
          resolve(summary);
        } else {
          reject(new Error(`Görev özeti bulunamadı: ${taskId}`));
        }
      });
    });
  }

  cancelTask(taskId: string, reason: string = 'Kullanıcı tarafından iptal edildi'): boolean {
    const entry = this.activeProcesses.get(taskId);
    if (!entry) return false;

    clearTimeout(entry.timer);
    try {
      if (process.platform === 'win32' && entry.child.pid) {
        spawn('taskkill', ['/pid', String(entry.child.pid), '/T', '/F']);
      } else {
        entry.child.kill('SIGTERM');
      }
    } catch {
      entry.child.kill();
    }

    this.activeProcesses.delete(taskId);

    this.store.recordEvent(createEvent({
      taskId,
      agent: entry.options.agent as any,
      tier: 1,
      type: 'task.cancelled',
      data: { reason }
    }));

    return true;
  }

  getActiveTasks(): string[] {
    return Array.from(this.activeProcesses.keys());
  }
}

export const globalRunner = new AgentRunner(globalStore);
