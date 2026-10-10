import fs from 'node:fs';
import { BaseAdapter } from './base_adapter.ts';
import type { BuiltCommand, CommandOptions } from './base_adapter.ts';
import type { EventStore } from '../core/event_store.ts';
import { createEvent } from '../core/types.ts';

const AGY_BIN = 'C:\\Users\\Halil Emre\\AppData\\Local\\agy\\bin\\agy.exe';

export class AgyAdapter extends BaseAdapter {
  constructor() {
    super('agy');
  }

  buildCommand(opts: CommandOptions): BuiltCommand {
    const { prompt, cwd, sessionId, dangerouslySkipPermissions = true } = opts;
    const args: string[] = ['-p', prompt, '--output-format', 'stream-json'];

    if (dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    if (sessionId) {
      args.push('--conversation', sessionId);
    }

    return {
      exe: fs.existsSync(AGY_BIN) ? AGY_BIN : 'agy',
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
      store.recordEvent(createEvent({
        taskId,
        agent: 'agy',
        tier: 1,
        type: 'message.delta',
        data: { text: trimmed + '\n' }
      }));
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
