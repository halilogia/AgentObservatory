import fs from 'node:fs';
import path from 'node:path';
import { BaseAdapter } from './base_adapter.ts';
import type { BuiltCommand, CommandOptions } from './base_adapter.ts';
import type { EventStore } from '../core/event_store.ts';
import { createEvent } from '../core/types.ts';
import type { EventType } from '../core/types.ts';
import { classifyFailure } from '../core/failure.ts';
import { resolveBinary, validateCwd } from '../core/paths.ts';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const EXIT_ERRORS: Record<number, string> = {
  3: 'Login required', 4: 'Permission denied', 5: 'Rate limit exceeded',
  6: 'Network failure', 7: 'API server error', 8: 'Max turns reached',
  9: 'Model produced no response', 10: 'Usage quota exhausted: insufficient credits', 130: 'Interrupted'
};
const isObject = (value: any): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const errorText = (value: any): string => typeof value === 'string' ? value : isObject(value) && typeof value.message === 'string' ? value.message : JSON.stringify(value) || '';

// Protocol: https://commandcode.ai/docs/headless and /docs/mods (AgentEvent catalog).
export class CommandCodeAdapter extends BaseAdapter {
  private streamErrors = new Map<string, string>();

  constructor() { super('commandcode'); }

  buildCommand(opts: CommandOptions): BuiltCommand {
    const cwd = validateCwd(opts.cwd);
    const args = ['--print', opts.prompt, '--output-format', 'json', '--skip-onboarding', '--no-auto-update'];
    if (opts.sessionId) args.push('--resume', opts.sessionId);
    if (opts.model) args.push('--model', opts.model);
    if (opts.effort) args.push('--effort', opts.effort);
    if (opts.sandbox === 'read-only') args.push('--permission-mode', 'plan');
    else if (opts.dangerouslySkipPermissions === true) args.push('--yolo');

    const exe = resolveBinary('commandcode');
    // Node cannot spawn npm .cmd shims directly. Resolve their package entry point
    // without a shell, keeping prompts (including quotes/metacharacters) as argv.
    if (/\.cmd$/i.test(exe)) {
      for (const pkgName of ['command-code', 'commandcode']) {
        const pkgDir = path.join(path.dirname(exe), 'node_modules', pkgName);
        const manifest = path.join(pkgDir, 'package.json');
        if (!fs.existsSync(manifest)) continue;
        const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.commandcode || pkg.bin?.['command-code'];
        if (typeof bin === 'string' && fs.existsSync(path.resolve(pkgDir, bin))) {
          return { exe: process.execPath, args: [path.resolve(pkgDir, bin), ...args], cwd, env: { ...process.env } };
        }
      }
      throw new Error('Command Code npm entry point not found; set COMMANDCODE_BIN to an executable or reinstall command-code.');
    }
    return { exe, args, cwd, env: { ...process.env } };
  }

  handleStdoutLine(line: string, taskId: string, store: EventStore): void {
    if (!line.trim() || TERMINAL.has(store.getTask(taskId)?.status || '')) return;
    let frame: any;
    try { frame = JSON.parse(line); } catch {
      store.recordEvent(createEvent({ taskId, sessionId: store.getTask(taskId)?.sessionId, agent: this.name, type: 'message.delta', data: { text: line + '\n' } }));
      return;
    }
    if (!isObject(frame)) return;
    const event = frame.type === 'event' ? frame.event : frame;
    if (!isObject(event)) return;
    const sessionId = (typeof event.sessionId === 'string' && event.sessionId) || store.getTask(taskId)?.sessionId;
    const record = (type: EventType, data: Record<string, any> = {}) => store.recordEvent(createEvent({ taskId, sessionId, agent: this.name, type, data }));

    switch (event.type) {
      case 'run_start': record('turn.started'); break;
      case 'text_delta': {
        const text = event.delta ?? event.text;
        if (typeof text === 'string' && text) record('message.delta', { text });
        break;
      }
      case 'tool_queued':
      case 'tool_running': {
        // queued carries input; running adds progress for the same call, not a second invocation.
        const id = event.toolCallId;
        if (id && store.getTask(taskId)?.toolsUsed.some((tool) => tool.id === id)) break;
        record('tool.invoked', { id, name: event.toolName || 'unknown', input: isObject(event.input) ? event.input : {} });
        break;
      }
      case 'tool_completed':
      case 'tool_errored':
      case 'tool_denied':
      case 'tool_hook_blocked':
        record('tool.completed', { id: event.toolCallId, name: event.toolName || 'unknown',
          result: event.result ?? event.error ?? event.hookOutput ?? '', error: event.type !== 'tool_completed' });
        break;
      case 'run_error':
        this.streamErrors.set(taskId, errorText(event.error) || 'Command Code run failed');
        break;
      case 'result': {
        if (event.usage && isObject(event.usage)) record('usage.updated', { usage: event.usage });
        const text = event.finalText;
        if (typeof text === 'string' && text && !store.getTask(taskId)?.assistantText.endsWith(text)) record('message.delta', { text });
        if (event.subtype === 'error' || event.subtype === 'max_turns') {
          this.streamErrors.set(taskId, errorText(event.error) || (event.subtype === 'max_turns' ? EXIT_ERRORS[8] : 'Command Code run failed'));
        }
        // Process exit remains authoritative: a success frame must not hide a later nonzero exit.
        record('turn.completed', { subtype: event.subtype, stopReason: event.stopReason });
        break;
      }
      // Unknown events (including partial message snapshots) are forward-compatible.
    }
  }

  override handleExit(code: number | null, taskId: string, store: EventStore, stderr: string): void {
    const streamError = this.streamErrors.get(taskId);
    this.streamErrors.delete(taskId);
    const task = store.getTask(taskId);
    if (!task || TERMINAL.has(task.status)) return;
    if (code === 0 && !streamError) { super.handleExit(code, taskId, store, stderr); return; }
    const error = [stderr.trim(), streamError, code === null ? 'Process terminated without an exit code' : EXIT_ERRORS[code]].filter(Boolean).join('\n') || `Process exit code: ${code}`;
    const failure = classifyFailure(`${error}\n${task.assistantText}`);
    store.recordEvent(createEvent({ taskId, sessionId: task.sessionId, agent: this.name, type: 'task.failed',
      data: { exitCode: code, error, errorKind: failure.kind, ...(failure.cooldownMs ? { cooldownMs: failure.cooldownMs } : {}) } }));
  }
}
