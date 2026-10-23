import { BaseAdapter } from './base_adapter.ts';
import type { BuiltCommand, CommandOptions } from './base_adapter.ts';
import type { EventStore } from '../core/event_store.ts';
import { createEvent } from '../core/types.ts';
import { resolveBinary, validateCwd } from '../core/paths.ts';

export class FreebuffAdapter extends BaseAdapter {
  constructor() {
    super('freebuff');
  }

  buildCommand(opts: CommandOptions): BuiltCommand {
    // Gerçek denemeyle doğrulandı (freebuff 0.2.29, 2026-10-23): CLI yalnızca etkileşimlidir. Konumsal argüman olarak
    // yalnızca `login` kabul eder; istem verilince "invalid for argument 'command'" hatası verir. Headless mod yok.
    // Sessizce başarısız olmak yerine açık hata: işi başka motora ver.
    if (process.env.OBSERVATORY_FREEBUFF_EXPERIMENTAL !== '1') {
      throw new Error('Freebuff komut satırından istem verilen (headless) modu desteklemiyor; yalnızca etkileşimli çalışır. Başka bir motor kullan.');
    }
    const { prompt, cwd, sessionId, dangerouslySkipPermissions = false } = opts;
    const validatedCwd = validateCwd(cwd);

    const args: string[] = [];

    // CI / Automated agent mode: trust repo's agents & mcp without manual prompt
    if (dangerouslySkipPermissions === true) {
      args.push('--trust-agents');
    }

    if (sessionId) {
      args.push('--continue', sessionId);
    }

    if (validatedCwd) {
      args.push('--cwd', validatedCwd);
    }

    if (prompt) {
      args.push(prompt);
    }

    return {
      exe: resolveBinary('freebuff'),
      args,
      cwd: validatedCwd,
      env: Object.assign({}, process.env)
    };
  }

  handleStdoutLine(line: string, taskId: string, store: EventStore): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Non-JSON standard terminal line
      // Check for tool call pattern (e.g. file edit, bash run)
      if (trimmed.startsWith('Running ') || trimmed.startsWith('Editing ') || trimmed.startsWith('Reading ')) {
        const parts = trimmed.split(' ');
        const toolName = parts[0].toLowerCase();
        const target = parts.slice(1).join(' ');

        store.recordEvent(createEvent({
          taskId,
          agent: 'freebuff',
          tier: 1,
          type: 'tool.invoked',
          data: {
            tool: toolName,
            input: { target }
          }
        }));
      }

      store.recordEvent(createEvent({
        taskId,
        agent: 'freebuff',
        tier: 1,
        type: 'message.delta',
        data: { text: trimmed + '\n' }
      }));
      return;
    }

    const task = store.getTask(taskId);
    const sessionId = task ? task.sessionId : null;

    if (parsed.type === 'tool_use' || parsed.type === 'tool_call') {
      store.recordEvent(createEvent({
        taskId,
        sessionId,
        agent: 'freebuff',
        tier: 1,
        type: 'tool.invoked',
        data: {
          tool: parsed.name || parsed.tool,
          input: parsed.input || parsed.parameters || {}
        }
      }));
    } else if (parsed.type === 'tool_result') {
      store.recordEvent(createEvent({
        taskId,
        sessionId,
        agent: 'freebuff',
        tier: 1,
        type: 'tool.completed',
        data: {
          tool: parsed.name || parsed.tool,
          result: parsed.content || parsed.result
        }
      }));
    } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
      store.recordEvent(createEvent({
        taskId,
        sessionId,
        agent: 'freebuff',
        tier: 1,
        type: 'message.delta',
        data: { text: parsed.delta.text }
      }));
    } else if (parsed.message) {
      store.recordEvent(createEvent({
        taskId,
        sessionId,
        agent: 'freebuff',
        tier: 1,
        type: 'message.delta',
        data: { text: typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed.message) }
      }));
    }
  }
}
