import { BaseAdapter } from './base_adapter.ts';
import type { BuiltCommand, CommandOptions } from './base_adapter.ts';
import type { EventStore } from '../core/event_store.ts';
import { createEvent } from '../core/types.ts';
import { resolveBinary, validateCwd } from '../core/paths.ts';

export class CodexAdapter extends BaseAdapter {
  // Task-level session isolation to prevent cross-task collision in parallel runs
  private taskSessions: Map<string, string> = new Map();

  constructor() {
    super('codex');
  }

  buildCommand(opts: CommandOptions): BuiltCommand {
    const { taskId, prompt, cwd, sessionId, sandbox = 'workspace-write' } = opts;

    if (taskId && sessionId) {
      this.taskSessions.set(taskId, sessionId);
    }

    const validatedCwd = validateCwd(cwd);

    let args: string[];
    if (sessionId) {
      args = ['exec', 'resume', sessionId, prompt, '--json', '--skip-git-repo-check', '--sandbox', sandbox];
    } else {
      args = ['exec', prompt, '--json', '--skip-git-repo-check', '--sandbox', sandbox];
    }

    return {
      exe: resolveBinary('codex'),
      args,
      cwd: validatedCwd,
      env: Object.assign({}, process.env)
    };
  }

  handleStdoutLine(line: string, taskId: string, store: EventStore): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event: any;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }

    const dtype = event.type;
    const currentSession = this.taskSessions.get(taskId) || null;

    if (dtype === 'thread.started') {
      const threadId = event.thread_id;
      if (threadId) {
        this.taskSessions.set(taskId, threadId);
      }
      store.recordEvent(createEvent({
        taskId,
        sessionId: threadId,
        agent: 'codex',
        tier: 1,
        type: 'task.started',
        data: { threadId }
      }));
    } else if (dtype === 'turn_context') {
      const model = event.model || 'gpt-6-astra';
      store.recordEvent(createEvent({
        taskId,
        sessionId: currentSession,
        agent: 'codex',
        tier: 1,
        type: 'task.started',
        data: { model }
      }));
    } else if (dtype === 'item.started' || dtype === 'item.created') {
      const item = event.item || {};
      const itype = item.type;
      if (itype === 'command_execution' || itype === 'tool_call' || itype === 'mcp_tool_call') {
        const toolName = item.name || (itype === 'command_execution' ? 'bash' : itype);
        const inputCmd = item.command || (item.input ? JSON.stringify(item.input) : '') || '';
        store.recordEvent(createEvent({
          taskId,
          sessionId: currentSession,
          agent: 'codex',
          tier: 1,
          type: 'tool.invoked',
          data: {
            name: toolName,
            input: { command: inputCmd }
          }
        }));
      }
    } else if (dtype === 'item.completed') {
      const item = event.item || {};
      const itype = item.type;

      if (itype === 'agent_message') {
        store.recordEvent(createEvent({
          taskId,
          sessionId: currentSession,
          agent: 'codex',
          tier: 1,
          type: 'message.delta',
          data: { text: item.text || '' }
        }));
      } else if (itype === 'command_execution' || itype === 'tool_call' || itype === 'mcp_tool_call') {
        const toolName = item.name || (itype === 'command_execution' ? 'bash' : itype);
        const rawOutput = item.aggregated_output || item.output || (item.result ? JSON.stringify(item.result) : '') || '';
        store.recordEvent(createEvent({
          taskId,
          sessionId: currentSession,
          agent: 'codex',
          tier: 1,
          type: 'tool.completed',
          data: {
            name: toolName,
            exitCode: item.exit_code,
            output: String(rawOutput).slice(0, 300)
          }
        }));
      } else if (itype === 'error' || itype === 'error_message') {
        store.recordEvent(createEvent({
          taskId,
          sessionId: currentSession,
          agent: 'codex',
          tier: 1,
          type: 'task.failed',
          data: { error: item.message || JSON.stringify(item) }
        }));
      }
    } else if (dtype === 'turn.failed') {
      const err = (event.error && event.error.message) || event.reason || 'Codex turn failed';
      store.recordEvent(createEvent({
        taskId,
        sessionId: currentSession,
        agent: 'codex',
        tier: 1,
        type: 'task.failed',
        data: { error: err }
      }));
    } else if (dtype === 'turn.completed') {
      const usage = event.usage || {};
      store.recordEvent(createEvent({
        taskId,
        sessionId: currentSession,
        agent: 'codex',
        tier: 1,
        type: 'usage.updated',
        data: {
          usage: {
            inputTokens: usage.input_tokens || 0,
            cachedTokens: usage.cached_input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
            reasoningTokens: usage.reasoning_output_tokens || 0
          }
        }
      }));
    }
  }

  override handleExit(code: number | null, taskId: string, store: EventStore, stderr: string): void {
    super.handleExit(code, taskId, store, stderr);
    this.taskSessions.delete(taskId);
  }
}
