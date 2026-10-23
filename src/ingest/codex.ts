// Codex kayıtları: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
import { flattenOutput, isInjectedText, parseJson, shortId } from './core.ts';
import { failureData } from '../core/failure.ts';
import type { ExtEvent, LineParser, ManagedCheck } from './core.ts';

export class CodexLineParser implements LineParser {
  private sessionId = '';
  private turn = 0;
  private open = false;
  private skip = false;
  /** koruyucu (guardian) inceleme alt oturumları kullanıcı işi değildir */
  private ignore = false;
  private cwd = '';
  private model = '';
  private lastTs = 0;

  private readonly isManaged: ManagedCheck;

  constructor(isManaged: ManagedCheck = () => false) { this.isManaged = isManaged; }

  private taskId(): string { return `ext_codex_${shortId(this.sessionId)}_${this.turn}`; }

  private ev(type: ExtEvent['type'], data: Record<string, unknown>, ts: number, seed: string): ExtEvent {
    return { taskId: this.taskId(), sessionId: this.sessionId || null, agent: 'codex', type, data, ts, seed };
  }

  push(line: string, key: string): ExtEvent[] {
    const o = parseJson(line);
    if (!o || !o.payload) return [];
    const p = o.payload;
    const ts = Date.parse(o.timestamp) || this.lastTs || Date.now();
    this.lastTs = ts;
    const out: ExtEvent[] = [];

    if (o.type === 'session_meta') { this.sessionId = p.id || this.sessionId; this.cwd = p.cwd || this.cwd; return out; }
    if (o.type === 'turn_context') { this.cwd = p.cwd || this.cwd; this.model = p.model || this.model; return out; }
    if (o.type === 'event_msg' && p.type === 'task_started' && p.turn_attribution?.turn_trigger === 'guardian_review') { this.ignore = true; return out; }
    if (this.ignore || !this.sessionId) return out;

    if (o.type === 'response_item') {
      if (p.type === 'message') {
        const parts: any[] = Array.isArray(p.content) ? p.content : [];
        if (p.role === 'user') {
          const prompt = parts.filter((c) => c.type === 'input_text').map((c) => String(c.text)).filter((t) => !isInjectedText(t)).join('\n').trim();
          if (!prompt) return out;
          if (this.open && !this.skip) out.push(this.ev('task.cancelled', { reason: 'yeni istem geldi' }, ts, `${key}:cancel`));
          this.turn++;
          this.skip = this.isManaged('codex', prompt, ts);
          this.open = !this.skip;
          if (!this.skip) out.push(this.ev('task.started', { prompt, cwd: this.cwd, model: this.model }, ts, `${key}:start`));
        } else if (p.role === 'assistant' && this.open && !this.skip) {
          const text = parts.filter((c) => c.type === 'output_text').map((c) => String(c.text)).join('\n');
          if (text) out.push(this.ev('message.delta', { text }, ts, `${key}:msg`));
        }
        return out;
      }
      if (!this.open || this.skip) return out;
      if (p.type === 'function_call' || p.type === 'custom_tool_call') {
        let input: unknown = p.input ?? {};
        if (typeof p.arguments === 'string') { try { input = JSON.parse(p.arguments); } catch { input = { arguments: p.arguments }; } }
        out.push(this.ev('tool.invoked', { id: p.call_id, name: p.name, input }, ts, `${key}:call`));
      } else if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') {
        out.push(this.ev('tool.completed', { toolUseId: p.call_id, output: flattenOutput(p.output) }, ts, `${key}:out`));
      }
      return out;
    }

    if (o.type === 'event_msg' && this.open && !this.skip) {
      if (p.type === 'token_count' && p.info?.last_token_usage) {
        const u = p.info.last_token_usage;
        out.push(this.ev('usage.updated', { usage: { input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0 } }, ts, `${key}:tok`));
      } else if (p.type === 'task_complete') {
        // kota / hata görev sonunda `error.message` ile gelir (ör. "You've hit your usage limit ...")
        if (p.error?.message) out.push(this.ev('task.failed', failureData(String(p.error.message), { exitCode: 1 }), ts, `${key}:end`));
        else out.push(this.ev('task.completed', { exitCode: 0 }, ts, `${key}:end`));
        this.open = false;
      }
    }
    return out;
  }
}
