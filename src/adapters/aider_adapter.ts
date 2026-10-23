import { BaseAdapter } from './base_adapter.ts';
import type { BuiltCommand, CommandOptions } from './base_adapter.ts';
import type { EventStore } from '../core/event_store.ts';
import { createEvent } from '../core/types.ts';
import { resolveBinary, validateCwd } from '../core/paths.ts';

export class AiderAdapter extends BaseAdapter {
  constructor() {
    super('aider');
  }

  buildCommand(opts: CommandOptions): BuiltCommand {
    const { prompt, cwd } = opts;
    const validatedCwd = validateCwd(cwd);

    // Aider headless execution mode
    const args: string[] = ['--message', prompt, '--yes', '--no-auto-commits'];

    if (opts.model) {
      args.push('--model', opts.model);
    }

    return {
      exe: resolveBinary('aider'),
      args,
      cwd: validatedCwd,
      env: Object.assign({}, process.env)
    };
  }

  handleStdoutLine(line: string, taskId: string, store: EventStore): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    store.recordEvent(createEvent({
      taskId,
      agent: 'aider',
      tier: 1,
      type: 'message.delta',
      data: { text: trimmed + '\n' }
    }));
  }
}
