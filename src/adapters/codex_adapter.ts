import fs from 'node:fs';
import { BaseAdapter } from './base_adapter.ts';
import type { BuiltCommand, CommandOptions } from './base_adapter.ts';
import type { EventStore } from '../core/event_store.ts';
import { createEvent } from '../core/types.ts';

const CODEX_BIN = 'C:\\Users\\Halil Emre\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe';

export class CodexAdapter extends BaseAdapter {
  private currentSessionId: string | null = null;

  constructor() {
    super('codex');
  }

  buildCommand(opts: CommandOptions): BuiltCommand {
    const { prompt, cwd, sessionId, sandbox = 'danger-full-access' } = opts;
    this.currentSessionId = sessionId || null;

    let args: string[];
    if (sessionId) {
      args = ['exec', 'resume', sessionId, prompt, '--json', '--skip-git-repo-check', '--sandbox', sandbox];
    } else {
      args = ['exec', prompt, '--json', '--skip-git-repo-check', '--sandbox', sandbox];
    }

    return {
      exe: fs.existsSync(CODEX_BIN) ? CODEX_BIN : 'codex',
      args,
      cwd: (cwd && fs.existsSync(cwd)) ? cwd : process.cwd(),
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

    if (dtype === 'thread.started') {
      this.currentSessionId = event.thread_id;
      store.recordEvent(createEvent({
        taskId,
        sessionId: this.currentSessionId,
        agent: 'codex',
        tier: 1,
        type: 'task.started',
        data: { threadId: this.currentSessionId }
      }));
    } else if (dtype === 'turn_context') {
      const model = event.model || 'gpt-6-astra';
      store.recordEvent(createEvent({
        taskId,
        sessionId: this.currentSessionId,
        agent: 'codex',
        tier: 1,
        type: 'task.started',
        data: { model }
      }));
    } else if (dtype === 'item.completed') {
      const item = event.item || {};
      const itype = item.type;

      if (itype === 'agent_message') {
        store.recordEvent(createEvent({
          taskId,
          sessionId: this.currentSessionId,
          agent: 'codex',
          tier: 1,
          type: 'message.delta',
          data: { text: item.text || '' }
        }));
      } else if (itype === 'command_execution' || itype === 'tool_call') {
        store.recordEvent(createEvent({
          taskId,
          sessionId: this.currentSessionId,
          agent: 'codex',
          tier: 1,
          type: 'tool.invoked',
          data: {
            name: item.type,
            input: { command: item.command || item.name }
          }
        }));
      } else if (itype === 'error' || itype === 'error_message') {
        store.recordEvent(createEvent({
          taskId,
          sessionId: this.currentSessionId,
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
        sessionId: this.currentSessionId,
        agent: 'codex',
        tier: 1,
        type: 'task.failed',
        data: { error: err }
      }));
    } else if (dtype === 'turn.completed') {
      const usage = event.usage || {};
      store.recordEvent(createEvent({
        taskId,
        sessionId: this.currentSessionId,
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
}
