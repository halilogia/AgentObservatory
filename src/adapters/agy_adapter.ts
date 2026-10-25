import { BaseAdapter } from './base_adapter.ts';
import type { BuiltCommand, CommandOptions } from './base_adapter.ts';
import type { EventStore } from '../core/event_store.ts';
import { createEvent } from '../core/types.ts';
import { resolveBinary, validateCwd } from '../core/paths.ts';

/** agy araç adlarını/parametrelerini ortak TUI'nin tanıdığı biçime çevirir (read_file → Read, run_command → Bash ...). */
export function normalizeAgyTool(name: string, p: Record<string, any>): { name: string; input: Record<string, any> } {
  const file = p.Path ?? p.AbsolutePath ?? p.TargetFile ?? p.FilePath ?? p.path;
  switch (name) {
    case 'read_file': case 'view_file': case 'view_file_outline':
      return { name: 'Read', input: { file_path: file } };
    case 'write_to_file':
      return { name: 'Write', input: { file_path: file } };
    case 'replace_file_content': case 'multi_replace_file_content': case 'edit_file':
      return { name: 'Edit', input: { file_path: file } };
    case 'run_command': case 'run_shell_command':
      return { name: 'Bash', input: { command: p.CommandLine ?? p.Command ?? p.command ?? '' } };
    case 'grep_search': case 'search_in_file':
      return { name: 'Grep', input: { pattern: p.Query ?? p.Pattern ?? '', path: p.SearchPath ?? p.Path } };
    case 'list_dir': case 'find_by_name':
      return { name: 'Glob', input: { pattern: p.Pattern ?? p.DirectoryPath ?? p.SearchDirectory ?? file ?? '' } };
    default:
      return { name, input: p };
  }
}

/** agy kullanım alanları (snake_case) → depo alanları (camelCase). */
export function mapAgyUsage(u: Record<string, any>): Record<string, number> {
  return {
    inputTokens: Number(u.input_tokens ?? 0),
    cachedTokens: Number(u.cache_read_tokens ?? 0),
    outputTokens: Number(u.output_tokens ?? 0),
    reasoningTokens: Number(u.thinking_tokens ?? 0)
  };
}

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
      if (su.step_type === 'tool') {
        // Araç adımı: ACTIVE = çağrıldı (tool_name + tool_info.parameters), DONE/ERROR = bitti. Adım numarası araç kimliği olur.
        const id = `${su.conversation_id}:${su.step_index}`;
        if (su.state === 'ACTIVE' && su.tool_name) {
          const t = normalizeAgyTool(String(su.tool_name), su.tool_info?.parameters ?? {});
          store.recordEvent(createEvent({ taskId, sessionId: su.conversation_id, agent: 'agy', tier: 1, type: 'tool.invoked', data: { id, name: t.name, input: t.input } }));
        } else if (su.state === 'DONE' || su.state === 'ERROR') {
          store.recordEvent(createEvent({ taskId, sessionId: su.conversation_id, agent: 'agy', tier: 1, type: 'tool.completed', data: { toolUseId: id, isError: su.state === 'ERROR', durationMs: Math.round((su.duration_seconds ?? 0) * 1000) } }));
        }
      }
      return;
    }
    if (event.event === 'result' && event.result && event.result.usage) {
      store.recordEvent(createEvent({ taskId, agent: 'agy', tier: 1, type: 'usage.updated', data: { usage: mapAgyUsage(event.result.usage) } }));
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
