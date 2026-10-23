import { BaseAdapter } from './base_adapter.ts';
import type { BuiltCommand, CommandOptions } from './base_adapter.ts';
import type { EventStore } from '../core/event_store.ts';
import { createEvent } from '../core/types.ts';
import { resolveBinary, validateCwd } from '../core/paths.ts';

export class AgyAdapter extends BaseAdapter {
  constructor() {
    super('agy');
  }

  buildCommand(opts: CommandOptions): BuiltCommand {
    const { prompt, cwd, sessionId, dangerouslySkipPermissions = false } = opts;
    const validatedCwd = validateCwd(cwd);

    const args: string[] = ['-p', prompt, '--output-format', 'stream-json'];

    // Only grant dangerous skip permissions if explicitly set to true
    if (dangerouslySkipPermissions === true) {
      args.push('--dangerously-skip-permissions');
    }

    if (sessionId) {
      args.push('--conversation', sessionId);
    }

    if (opts.model) {
      args.push('--model', opts.model);
    }

    return {
      exe: resolveBinary('agy'),
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
      store.recordEvent(createEvent({
        taskId,
        agent: 'agy',
        tier: 1,
        type: 'message.delta',
        data: { text: trimmed + '\n' }
      }));
      return;
    }

    // Gerçek `agy --output-format stream-json` biçimi: {event:'init'|'step_update'|'result', ...}
    if (event.event === 'init' && event.init) {
      store.recordEvent(createEvent({ taskId, sessionId: event.conversation_id, agent: 'agy', tier: 1, type: 'task.started', data: { model: event.init.model } }));
      return;
    }
    if (event.event === 'step_update' && event.step_update) {
      const su = event.step_update;
      if (su.step_type === 'agent_response' && su.text_delta) {
        store.recordEvent(createEvent({ taskId, sessionId: su.conversation_id, agent: 'agy', tier: 1, type: 'message.delta', data: { text: su.text_delta } }));
      }
      return;
    }
    if (event.event === 'result' && event.result && event.result.usage) {
      store.recordEvent(createEvent({ taskId, agent: 'agy', tier: 1, type: 'usage.updated', data: { usage: event.result.usage } }));
      return;
    }

    const etype = event.type;
    if (etype === 'PLANNER_RESPONSE' || etype === 'assistant') {
      if (event.content) {
        store.recordEvent(createEvent({
          taskId,
          agent: 'agy',
          tier: 1,
          type: 'message.delta',
          data: { text: event.content }
        }));
      }
      if (event.tool_calls && Array.isArray(event.tool_calls)) {
        for (const tc of event.tool_calls) {
          store.recordEvent(createEvent({
            taskId,
            agent: 'agy',
            tier: 1,
            type: 'tool.invoked',
            data: {
              name: tc.name,
              input: tc.parameters
            }
          }));
        }
      }
    }
  }
}
