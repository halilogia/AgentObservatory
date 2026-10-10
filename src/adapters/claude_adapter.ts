import { BaseAdapter } from './base_adapter.ts';
import type { BuiltCommand, CommandOptions } from './base_adapter.ts';
import type { EventStore } from '../core/event_store.ts';
import { createEvent } from '../core/types.ts';
import { resolveBinary, validateCwd } from '../core/paths.ts';

export class ClaudeAdapter extends BaseAdapter {
  constructor() {
    super('claude');
  }

  buildCommand(opts: CommandOptions): BuiltCommand {
    const { prompt, cwd, sessionId, dangerouslySkipPermissions = false } = opts;
    const validatedCwd = validateCwd(cwd);

    const args: string[] = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];

    // Only grant dangerous skip permissions if explicitly set to true
    if (dangerouslySkipPermissions === true) {
      args.push('--dangerously-skip-permissions');
    }

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    return {
      exe: resolveBinary('claude'),
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

    const etype = event.type;

    if (etype === 'system' && event.subtype === 'init') {
      const sessionId = event.session_id;
      const model = event.model || 'claude-sonnet-5-5';
      store.recordEvent(createEvent({
        taskId,
        sessionId,
        agent: 'claude',
        tier: 1,
        type: 'task.started',
        data: { model, tools: event.tools || [] }
      }));
    } else if (etype === 'assistant') {
      const msg = event.message || {};
      const content = msg.content || [];
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'tool_use') {
            store.recordEvent(createEvent({
              taskId,
              sessionId: event.session_id,
              agent: 'claude',
              tier: 1,
              type: 'tool.invoked',
              data: {
                id: item.id,
                name: item.name,
                input: item.input
              }
            }));
          } else if (item.type === 'text') {
            store.recordEvent(createEvent({
              taskId,
              sessionId: event.session_id,
              agent: 'claude',
              tier: 1,
              type: 'message.delta',
              data: { text: item.text }
            }));
          }
        }
      }
    } else if (etype === 'result') {
      const usage = event.usage || {};
      store.recordEvent(createEvent({
        taskId,
        sessionId: event.session_id,
        agent: 'claude',
        tier: 1,
        type: 'usage.updated',
        data: {
          usage: {
            inputTokens: usage.input_tokens || 0,
            cachedTokens: usage.cache_read_input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
            reasoningTokens: (usage.output_tokens_details && usage.output_tokens_details.thinking_tokens) || 0
          }
        }
      }));

      // NOTE: event.result is already streamed incrementally in 'assistant' content.
      // We do not re-emit message.delta here to prevent duplicate response text.
    }
  }
}
