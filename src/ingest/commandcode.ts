// Command Code oturum kayıtları: ~/.commandcode/projects/<proje>/<oturum>.jsonl
// İlk satır oturum başlığıdır: {"type":"session","id","cwd","timestamp"}
// Sonraki satırlar mesajdır: {"type":"message","timestamp","message":{"role","content":[...]}}
// Asistan içeriği thinking / text / tool_use blokları; kullanıcı içeriği text / tool_result blokları taşır.
import { flattenOutput, isInjectedText, parseJson, shortId } from './core.ts';
import type { ExtEvent, LineParser, ManagedCheck } from './core.ts';

/** Oturum dosyası adı UUID'dir (dosya sonundan izlemeye başlansa bile oturum kimliği gerekir). */
export function commandCodeSessionIdFromPath(file: string): string {
  const base = (file.split(/[\\/]/).pop() || '').replace(/\.checkpoints\.jsonl$/, '').replace(/\.jsonl$/, '');
  return base;
}

/** Dosya sonundan izlemeye başlarken tur numarasını doğru sürdürmek için önceki istemleri sayar. */
export function countCommandCodeTurns(chunk: string): number {
  let turns = 0;
  for (const line of chunk.split('\n')) {
    const o = parseJson(line);
    if (!o || o.type !== 'message' || o.message?.role !== 'user') continue;
    const content = o.message.content;
    const blocks: any[] = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : [];
    const hasPrompt = blocks.some((b) => b.type === 'text' && typeof b.text === 'string' && !isInjectedText(b.text));
    if (hasPrompt) turns++;
  }
  return turns;
}

export class CommandCodeLineParser implements LineParser {
  private sessionId = '';
  private turn = 0;
  private open = false;
  private skip = false;
  private cwd = '';
  private lastTs = 0;

  private readonly isManaged: ManagedCheck;

  constructor(isManaged: ManagedCheck = () => false, sessionId = '', initialTurn = 0) {
    this.isManaged = isManaged;
    this.sessionId = sessionId;
    this.turn = initialTurn;
  }

  private taskId(): string { return `ext_commandcode_${shortId(this.sessionId)}_${this.turn}`; }

  private ev(type: ExtEvent['type'], data: Record<string, unknown>, ts: number, seed: string): ExtEvent {
    return { taskId: this.taskId(), sessionId: this.sessionId || null, agent: 'commandcode', type, data, ts, seed };
  }

  push(line: string, key: string): ExtEvent[] {
    const o = parseJson(line);
    if (!o || typeof o !== 'object') return [];

    if (o.type === 'session') {
      if (o.id) this.sessionId = String(o.id);
      if (o.cwd) this.cwd = String(o.cwd);
      return [];
    }
    if (o.type !== 'message' || !o.message) return [];

    const ts = Date.parse(o.timestamp) || this.lastTs || Date.now();
    this.lastTs = ts;
    const out: ExtEvent[] = [];
    const role = o.message.role;
    const c = o.message.content;
    const blocks: any[] = typeof c === 'string' ? [{ type: 'text', text: c }] : Array.isArray(c) ? c : [];

    if (role === 'user') {
      for (const [i, b] of blocks.entries()) {
        if (b.type === 'tool_result' && this.open && !this.skip) {
          out.push(this.ev('tool.completed', { toolUseId: b.tool_use_id, output: flattenOutput(b.content) }, ts, `${key}:r${i}`));
        }
      }
      const prompt = blocks
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .filter((t) => !isInjectedText(t))
        .join('\n')
        .trim();
      if (prompt) {
        // stop_reason alanı yok: yeni istem gelmesi önceki turun bittiğini gösterir
        if (this.open && !this.skip) out.push(this.ev('task.completed', { exitCode: 0 }, ts, `${key}:prevDone`));
        this.turn++;
        this.skip = this.isManaged('commandcode', prompt, ts);
        this.open = !this.skip;
        if (!this.skip) out.push(this.ev('task.started', { prompt, cwd: this.cwd }, ts, `${key}:start`));
      }
      return out;
    }

    if (role === 'assistant' && this.open && !this.skip) {
      let hasTool = false;
      for (const [i, b] of blocks.entries()) {
        if (b.type === 'thinking' && b.thinking) {
          out.push(this.ev('message.delta', { thinking: String(b.thinking) }, ts, `${key}:k${i}`));
        } else if (b.type === 'text' && b.text) {
          out.push(this.ev('message.delta', { text: String(b.text) }, ts, `${key}:t${i}`));
        } else if (b.type === 'tool_use') {
          hasTool = true;
          out.push(this.ev('tool.invoked', { id: b.id, name: b.name, input: b.input ?? {} }, ts, `${key}:u${i}`));
        }
      }
      // Araç çağrısı içermeyen asistan mesajı turun nihai yanıtıdır; aksi hâlde görev sonsuz "sürüyor" görünür.
      if (!hasTool) {
        out.push(this.ev('task.completed', { exitCode: 0 }, ts, `${key}:end`));
        this.open = false;
      }
    }
    return out;
  }
}
