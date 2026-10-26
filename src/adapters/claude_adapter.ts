import { BaseAdapter } from './base_adapter.ts';
import type { BuiltCommand, CommandOptions } from './base_adapter.ts';
import type { EventStore } from '../core/event_store.ts';
import { createEvent } from '../core/types.ts';
import { resolveBinary, validateCwd } from '../core/paths.ts';
import { resolveClaudeSessionId, updateClaudeSessionId } from '../core/claude_session_manager.ts';

export class ClaudeAdapter extends BaseAdapter {
  private taskCwdMap: Map<string, string> = new Map();

  constructor() {
    super('claude');
  }

  buildCommand(opts: CommandOptions): BuiltCommand {
    const { prompt, cwd, sessionId, dangerouslySkipPermissions = false, taskId } = opts;
    const validatedCwd = validateCwd(cwd);

    if (taskId) {
      this.taskCwdMap.set(taskId, validatedCwd);
    }

    const args: string[] = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];

    // Only grant dangerous skip permissions if explicitly set to true
    if (dangerouslySkipPermissions === true) {
      args.push('--dangerously-skip-permissions');
    } else {
      // By default accept edits within project, but Bash/system calls require interactive approval
      args.push('--permission-mode', 'acceptEdits');
    }

    const effectiveSessionId = resolveClaudeSessionId(validatedCwd, sessionId);
    if (effectiveSessionId) {
      args.push('--resume', effectiveSessionId);
    }

    if (opts.effort) {
      args.push('--effort', opts.effort);
    }

    if (opts.model) {
      args.push('--model', opts.model);
    }

    return {
      exe: resolveBinary('claude'),
      args,
      cwd: validatedCwd,
      env: Object.assign({}, process.env)
    };
  }

  override handleExit(code: number | null, taskId: string, store: EventStore, stderr: string): void {
    this.taskCwdMap.delete(taskId);
    super.handleExit(code, taskId, store, stderr);
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

    if (etype === 'system' && event.subtype === 'permission_denied') {
      store.recordEvent(createEvent({
        taskId,
        sessionId: event.session_id,
        agent: 'claude',
        tier: 1,
        type: 'permission.resolved',
        data: {
          id: event.tool_use_id,
          tool: event.tool_name,
          approved: false,
          reason: event.decision_reason || event.message || 'Reddedildi'
        }
      }));
    } else if (etype === 'system' && event.subtype === 'init') {
      const sessionId = event.session_id;
      const model = event.model || 'claude-sonnet-5-5';
      const taskCwd = this.taskCwdMap.get(taskId) || process.cwd();
      if (sessionId) {
        updateClaudeSessionId(taskCwd, sessionId);
      }
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

            // Sensitive actions triggering interactive user approval in acceptEdits mode
            const sensitiveTools = ['Bash', 'PowerShell', 'exec', 'kill'];
            if (sensitiveTools.includes(item.name)) {
              store.recordEvent(createEvent({
                taskId,
                sessionId: event.session_id,
                agent: 'claude',
                tier: 1,
                type: 'permission.requested',
                data: {
                  id: item.id,
                  tool: item.name,
                  input: item.input,
                  summary: (item.input && (item.input.command || item.input.description)) || item.name
                }
              }));
            }
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
    } else if (etype === 'user') {
      const msg = event.message || {};
      const content = msg.content || [];
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'tool_result') {
            const rawContent = typeof item.content === 'string' ? item.content : JSON.stringify(item.content || '');
            store.recordEvent(createEvent({
              taskId,
              sessionId: event.session_id,
              agent: 'claude',
              tier: 1,
              type: 'tool.completed',
              data: {
                toolUseId: item.tool_use_id,
                output: rawContent.slice(0, 300),
                isError: !!item.is_error
              }
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
