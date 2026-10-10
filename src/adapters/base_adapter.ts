import type { EventStore } from '../core/event_store.ts';
import type { AgentType } from '../core/types.ts';

export interface CommandOptions {
  prompt: string;
  cwd?: string;
  sessionId?: string | null;
  dangerouslySkipPermissions?: boolean;
  sandbox?: string;
  timeoutSeconds?: number;
}

export interface BuiltCommand {
  exe: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export abstract class BaseAdapter {
  readonly name: AgentType;

  constructor(name: AgentType) {
    this.name = name;
  }

  abstract buildCommand(opts: CommandOptions): BuiltCommand;

  abstract handleStdoutLine(line: string, taskId: string, store: EventStore): void;

  handleExit(code: number | null, taskId: string, store: EventStore, stderr: string): void {
    const task = store.getTask(taskId);
    if (!task) return;

    if (code === 0 && task.status !== 'failed') {
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
      store.recordEvent({
        id: `evt_err_${taskId}`,
        taskId,
        sessionId: task.sessionId,
        agent: this.name,
        tier: 1,
        type: 'task.failed',
        data: { exitCode: code, error: stderr.trim() || `Süreç çıkış kodu: ${code}` },
        timestamp: Date.now()
      });
    }
  }
}
