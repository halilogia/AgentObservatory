import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import { EventStore, globalStore } from '../core/event_store.ts';
import { createEvent } from '../core/types.ts';
import type { TaskSummary } from '../core/types.ts';
import { BaseAdapter } from '../adapters/base_adapter.ts';
import { ClaudeAdapter } from '../adapters/claude_adapter.ts';
import { CodexAdapter } from '../adapters/codex_adapter.ts';
import { AgyAdapter } from '../adapters/agy_adapter.ts';
import { validateCwd } from '../core/paths.ts';

export interface RunTaskOptions {
  agent: string;
  prompt: string;
  cwd?: string;
  sessionId?: string | null;
  timeoutSeconds?: number;
  dangerouslySkipPermissions?: boolean;
  sandbox?: string;
}

interface ActiveProcessEntry {
  child: ChildProcess;
  timer: NodeJS.Timeout;
  options: RunTaskOptions;
  isCancelled: boolean;
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

  startTask(options: RunTaskOptions): { taskId: string; promise: Promise<TaskSummary> } {
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
    const validatedCwd = validateCwd(cwd);

    const cmd = adapter.buildCommand({
      ...options,
      taskId,
      cwd: validatedCwd
    });

    const promise = new Promise<TaskSummary>((resolve, reject) => {
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

      // Record task.started WITH child.pid for process tree tracking
      this.store.recordEvent(createEvent({
        taskId,
        sessionId,
        agent: adapter.name,
        tier: 1,
        type: 'task.started',
        data: { prompt, cwd: cmd.cwd, timeoutSeconds, pid: child.pid }
      }), child.pid);

      let stderr = '';

      const timer = setTimeout(() => {
        this.cancelTask(taskId, `Zaman aşımı (${timeoutSeconds}s)`);
      }, timeoutSeconds * 1000);

      const entry: ActiveProcessEntry = {
        child,
        timer,
        options,
        isCancelled: false
      };
      this.activeProcesses.set(taskId, entry);

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
        if (!entry.isCancelled) {
          this.store.recordEvent(createEvent({
            taskId,
            sessionId,
            agent: adapter.name,
            tier: 1,
            type: 'task.failed',
            data: { error: err.message }
          }));
        }
        reject(err);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        this.activeProcesses.delete(taskId);

        // If the task was cancelled, do NOT let handleExit overwrite with task.failed
        if (!entry.isCancelled) {
          adapter.handleExit(code, taskId, this.store, stderr);
        }

        const summary = this.store.getTask(taskId);
        if (summary) {
          resolve(summary);
        } else {
          reject(new Error(`Görev özeti bulunamadı: ${taskId}`));
        }
      });
    });

    // Safety handler: Prevents unhandled promise rejection crashes in Node.js when startTask is called fire-and-forget
    promise.catch((_err) => {
      // The failure is already recorded to eventStore/SQLite above via task.failed
    });

    return { taskId, promise };
  }

  async runTask(options: RunTaskOptions): Promise<TaskSummary> {
    return this.startTask(options).promise;
  }

  getTask(taskId: string): TaskSummary | null {
    return this.store.getTask(taskId);
  }

  cancelTask(taskId: string, reason: string = 'Kullanıcı tarafından iptal edildi'): boolean {
    const entry = this.activeProcesses.get(taskId);
    if (entry) {
      entry.isCancelled = true;
      clearTimeout(entry.timer);

      // Record cancellation FIRST so any subsequent exit code is ignored
      this.store.recordEvent(createEvent({
        taskId,
        agent: entry.options.agent as any,
        tier: 1,
        type: 'task.cancelled',
        data: { reason }
      }));

      // Synchronously terminate full process tree on Windows
      if (process.platform === 'win32' && entry.child.pid) {
        try {
          execFileSync('taskkill', ['/pid', String(entry.child.pid), '/T', '/F'], { stdio: 'ignore' });
        } catch {
          try { entry.child.kill('SIGTERM'); } catch {}
        }
      } else {
        try { entry.child.kill('SIGTERM'); } catch {}
      }

      this.activeProcesses.delete(taskId);
      return true;
    }

    // Cross-process fallback via SQLite
    return this.store.cancelTask ? this.store.cancelTask(taskId, reason) : false;
  }

  getActiveTasks(): string[] {
    return Array.from(this.activeProcesses.keys());
  }
}

export const globalRunner = new AgentRunner(globalStore);
