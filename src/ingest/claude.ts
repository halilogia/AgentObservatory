// Claude Code kayıtları: ~/.claude/projects/<proje>/<oturum>.jsonl
import { flattenOutput, isInjectedText, parseJson, shortId } from './core.ts';
import type { ExtEvent, LineParser, ManagedCheck } from './core.ts';

export class ClaudeLineParser implements LineParser {
  private sessionId = '';
  private turn = 0;
  private open = false;
  private skip = false;
  private lastMsgId = '';
  private cwd = '';
  private lastTs = 0;

  private readonly isManaged: ManagedCheck;

  // Node'un tür silme kipi "constructor parametre özelliklerini" desteklemez: alan açıkça tanımlanır
  /** Task/Agent aracı çağrısı kimliği -> o çağrıyı yapan ana görevin kimliği (alt ajan dosyaları bununla ebeveynine bağlanır) */
  private readonly toolTurns: Map<string, string>;

  constructor(isManaged: ManagedCheck = () => false, toolTurns: Map<string, string> = new Map()) { this.isManaged = isManaged; this.toolTurns = toolTurns; }

  private taskId(): string { return `ext_claude_${shortId(this.sessionId)}_${this.turn}`; }

  private ev(type: ExtEvent['type'], data: Record<string, unknown>, ts: number, seed: string): ExtEvent {
    return { taskId: this.taskId(), sessionId: this.sessionId || null, agent: 'claude', type, data, ts, seed };
  }

  push(line: string, key: string): ExtEvent[] {
    const o = parseJson(line);
    if (!o || o.isSidechain || !o.message) return [];
    if (o.sessionId) this.sessionId = o.sessionId;
    if (o.cwd) this.cwd = o.cwd;
    const ts = Date.parse(o.timestamp) || this.lastTs || Date.now();
    this.lastTs = ts;
    const out: ExtEvent[] = [];

    if (o.type === 'user') {
      const c = o.message.content;
      const blocks: any[] = typeof c === 'string' ? [{ type: 'text', text: c }] : Array.isArray(c) ? c : [];
      const results = blocks.filter((b) => b.type === 'tool_result');
      for (const [i, b] of results.entries()) {
        if (this.open && !this.skip) out.push(this.ev('tool.completed', { toolUseId: b.tool_use_id, output: flattenOutput(b.content) }, ts, `${key}:r${i}`));
      }
      const texts = blocks.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text as string).filter((t) => !isInjectedText(t));
      const prompt = texts.join('\n').trim();
      if (!results.length && prompt && this.sessionId) {
        if (this.open && !this.skip) out.push(this.ev('task.cancelled', { reason: 'yeni istem geldi' }, ts, `${key}:cancel`));
        this.turn++;
        this.skip = this.isManaged('claude', prompt, ts);
        this.open = !this.skip;
        if (!this.skip) out.push(this.ev('task.started', { prompt, cwd: this.cwd }, ts, `${key}:start`));
      }
      return out;
    }

    if (o.type === 'assistant' && this.open && !this.skip) {
      const m = o.message;
      const blocks: any[] = Array.isArray(m.content) ? m.content : [];
      for (const [i, b] of blocks.entries()) {
        if (b.type === 'text' && b.text) out.push(this.ev('message.delta', { text: String(b.text) }, ts, `${key}:t${i}`));
        else if (b.type === 'tool_use') {
          if (b.id && (b.name === 'Task' || b.name === 'Agent')) this.toolTurns.set(String(b.id), this.taskId());
          out.push(this.ev('tool.invoked', { id: b.id, name: b.name, input: b.input ?? {} }, ts, `${key}:u${i}`));
        }
      }
      if (m.usage && m.id && m.id !== this.lastMsgId) {
        this.lastMsgId = m.id;
        // model adı yalnızca asistan satırlarında bulunur; depo boş modeli ilk gelen olayla doldurur (sqlite_store: existing.model || event.data.model)
        out.push(this.ev('usage.updated', { usage: { input_tokens: m.usage.input_tokens ?? 0, output_tokens: m.usage.output_tokens ?? 0 }, ...(m.model ? { model: String(m.model) } : {}) }, ts, `${key}:usage`));
      }
      if (m.stop_reason === 'end_turn') {
        out.push(this.ev('task.completed', { exitCode: 0 }, ts, `${key}:end`));
        this.open = false;
      }
    }
    return out;
  }
}

/**
 * Claude Code alt ajan kaydı: ~/.claude/projects/<proje>/<oturum>/subagents/agent-<id>.jsonl (+ agent-<id>.meta.json: toolUseId).
 * Her dosya tek bir alt görevdir: taskId = ext_claude_sub_<agentId>, parentTaskId = onu başlatan Task/Agent turu.
 */
export class ClaudeSubagentParser implements LineParser {
  private open = false;
  private started = false;
  private lastMsgId = '';
  private lastTs = 0;
  private readonly taskId: string;
  private readonly parentTaskId: string;

  constructor(agentId: string, parentTaskId: string) {
    this.parentTaskId = parentTaskId;
    this.taskId = `ext_claude_sub_${shortId(agentId)}`;
  }

  private ev(sessionId: string, type: ExtEvent['type'], data: Record<string, unknown>, ts: number, seed: string): ExtEvent {
    return { taskId: this.taskId, sessionId: sessionId || null, agent: 'claude', type, data, ts, seed, parentTaskId: this.parentTaskId };
  }

  push(line: string, key: string): ExtEvent[] {
    const o = parseJson(line);
    if (!o || !o.message) return [];
    const sid = String(o.sessionId || '');
    const ts = Date.parse(o.timestamp) || this.lastTs || Date.now();
    this.lastTs = ts;
    const out: ExtEvent[] = [];
    const c = o.message.content;
    const blocks: any[] = typeof c === 'string' ? [{ type: 'text', text: c }] : Array.isArray(c) ? c : [];

    if (o.type === 'user') {
      for (const [i, b] of blocks.entries()) {
        if (b.type === 'tool_result' && this.open) out.push(this.ev(sid, 'tool.completed', { toolUseId: b.tool_use_id, output: flattenOutput(b.content) }, ts, `${key}:r${i}`));
      }
      if (!this.started) {
        const prompt = blocks.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text as string).filter((t) => !isInjectedText(t)).join('\n').trim();
        if (prompt) {
          this.started = true;
          this.open = true;
          out.push(this.ev(sid, 'task.started', { prompt, cwd: o.cwd ?? '' }, ts, `${key}:start`));
        }
      }
      return out;
    }

    if (o.type === 'assistant' && this.open) {
      const m = o.message;
      for (const [i, b] of blocks.entries()) {
        if (b.type === 'text' && b.text) out.push(this.ev(sid, 'message.delta', { text: String(b.text) }, ts, `${key}:t${i}`));
        else if (b.type === 'tool_use') out.push(this.ev(sid, 'tool.invoked', { id: b.id, name: b.name, input: b.input ?? {} }, ts, `${key}:u${i}`));
      }
      if (m.usage && m.id && m.id !== this.lastMsgId) {
        this.lastMsgId = m.id;
        out.push(this.ev(sid, 'usage.updated', { usage: { input_tokens: m.usage.input_tokens ?? 0, output_tokens: m.usage.output_tokens ?? 0 }, ...(m.model ? { model: String(m.model) } : {}) }, ts, `${key}:usage`));
      }
      if (m.stop_reason === 'end_turn') {
        out.push(this.ev(sid, 'task.completed', { exitCode: 0 }, ts, `${key}:end`));
        this.open = false;
      }
    }
    return out;
  }
}
