// Antigravity (agy) kayıtları: ~/.gemini/antigravity/brain/<konuşma>/.system_generated/logs/transcript.jsonl
// Her satır bir JSON nesnesidir (USER_INPUT / PLANNER_RESPONSE / GENERIC).
import fs from 'node:fs';
import { flattenOutput, isInjectedText, parseJson, shortId } from './core.ts';
import type { ExtEvent, LineParser, ManagedCheck } from './core.ts';

/** transcript.jsonl yolundan konuşma (oturum) kimliğini çıkarır (Windows ve POSIX yolları). */
export function conversationIdFromPath(file: string): string {
  const parts = file.split(/[\\/]/).filter(Boolean);
  const logs = parts.lastIndexOf('logs');
  if (logs >= 2 && parts[logs - 1] === '.system_generated') return parts[logs - 2];
  const stem = (parts[parts.length - 1] || '').replace(/\.jsonl$/, '');
  return parts.length >= 2 ? parts[parts.length - 2] : stem;
}

/** Antigravity kullanıcı istemini saran <USER_REQUEST> / <ADDITIONAL_METADATA> etiketlerini temizler. */
export function extractAntigravityPrompt(raw: string): string {
  const m = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i.exec(raw);
  if (m) return m[1].trim();
  return raw.replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, '')
    .replace(/<\/?USER_REQUEST>/gi, '')
    .trim();
}

function toInput(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? {};
  try { return JSON.parse(value); } catch { return { arguments: value }; }
}

/** Antigravity transcriptinde seçili modeli çıkarır (örn: Gemini 3.8 Flash (High) -> gemini-3.8-flash). */
export function extractAntigravityModel(raw: string): string | null {
  const tagMatch = /<USER_SETTINGS_CHANGE>([\s\S]*?)<\/USER_SETTINGS_CHANGE>/i.exec(raw);
  const text = tagMatch ? tagMatch[1] : raw;
  const m = /`?Model Selection`?\s+from\s+.*?\s+to\s+(.+?)(?:\s*\([^)]*\))?\s*\.\s*(?:No need|\n|$)/i.exec(text);
  if (!m) return null;
  const cleaned = m[1].replace(/[`()]/g, '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'none') return null;
  return cleaned.toLowerCase().replace(/\s+/g, '-');
}

export class AntigravityLineParser implements LineParser {
  private sessionId = '';
  private turn = 0;
  private open = false;
  private skip = false;
  private cwd = '';
  private lastToolId = '';
  private lastTs = 0;
  private currentModel = 'gemini-3.8-flash';

  private readonly isManaged: ManagedCheck;

  constructor(isManaged: ManagedCheck = () => false, sessionId = '', filePath?: string) {
    this.isManaged = isManaged;
    this.sessionId = sessionId;
    if (filePath) {
      try {
        if (fs.existsSync(filePath)) {
          const fd = fs.openSync(filePath, 'r');
          const buf = Buffer.alloc(16384);
          const bytesRead = fs.readSync(fd, buf, 0, 16384, 0);
          fs.closeSync(fd);
          const chunk = buf.toString('utf8', 0, bytesRead);
          const detected = extractAntigravityModel(chunk);
          if (detected) this.currentModel = detected;
        }
      } catch (err) {
        // Dosya okuma veya başlık erişim hatasında varsayılan gemini-3.8-flash modeli korunur
        this.currentModel = this.currentModel || 'gemini-3.8-flash';
      }
    }
  }

  private taskId(): string { return `ext_agy_${shortId(this.sessionId)}_${this.turn}`; }

  private ev(type: ExtEvent['type'], data: Record<string, unknown>, ts: number, seed: string): ExtEvent {
    return { taskId: this.taskId(), sessionId: this.sessionId || null, agent: 'agy', type, data, ts, seed };
  }

  private timestamp(o: any): number {
    const raw = o?.timestamp ?? o?.created_at ?? o?.createdAt ?? o?.ts ?? o?.time;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw > 1e12 ? raw : raw * 1000;
    if (typeof raw === 'string' && raw) {
      const parsed = Date.parse(raw);
      if (Number.isFinite(parsed)) return parsed;
      const num = Number(raw);
      if (Number.isFinite(num)) return num > 1e12 ? num : num * 1000;
    }
    return this.lastTs || Date.now();
  }

  /** Anahtar bir konuşma kimliği taşıyorsa (ör. UUID) oturumu ondan türet. */
  private sessionFromKey(key: string): string {
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(key);
    if (uuid) return uuid[0];
    const first = (key.split(/[\\/]/)[0] || '').split(':')[0];
    return first.length > 1 && !/\.jsonl$/i.test(first) ? first : '';
  }

  push(line: string, key: string): ExtEvent[] {
    const o = parseJson(line);
    if (!o || typeof o !== 'object') return [];
    if (!this.sessionId) this.sessionId = this.sessionFromKey(key);
    const ts = this.timestamp(o);
    this.lastTs = ts;
    const out: ExtEvent[] = [];

    if (o.type === 'USER_INPUT') {
      if (o.cwd) this.cwd = String(o.cwd);
      const rawPrompt = flattenOutput(o.content).trim();
      const detectedModel = extractAntigravityModel(rawPrompt);
      if (detectedModel) this.currentModel = detectedModel;
      const prompt = extractAntigravityPrompt(rawPrompt);
      if (!prompt || isInjectedText(prompt)) return out;
      if (this.open && !this.skip) out.push(this.ev('task.completed', { exitCode: 0 }, ts, `${key}:done`));
      this.turn++;
      this.skip = this.isManaged('agy', prompt, ts);
      this.open = !this.skip;
      if (!this.skip) out.push(this.ev('task.started', { prompt, cwd: this.cwd, model: this.currentModel }, ts, `${key}:start`));
      return out;
    }

    if (!this.open || this.skip) return out;

    if (o.type === 'PLANNER_RESPONSE') {
      const calls: any[] = Array.isArray(o.tool_calls) ? o.tool_calls : [];
      for (const [i, tool] of calls.entries()) {
        const id = String(tool?.id ?? tool?.tool_use_id ?? tool?.call_id ?? `${key}:call${i}`);
        const name = String(tool?.name ?? tool?.tool ?? 'tool');
        this.lastToolId = id;
        out.push(this.ev('tool.invoked', { id, name, input: toInput(tool?.args ?? tool?.parameters ?? tool?.input ?? tool?.arguments) }, ts, `${key}:u${i}`));
      }

      if (o.input_tokens != null || o.output_tokens != null) {
        const input_tokens = Number(o.input_tokens) || 0;
        const output_tokens = Number(o.output_tokens) || 0;
        // Kök alanlar ingest sözleşmesi; usage nesnesi TUI/depo uyumluluğu için.
        out.push(this.ev('usage.updated', {
          input_tokens,
          output_tokens,
          usage: { input_tokens, output_tokens, inputTokens: input_tokens, outputTokens: output_tokens }
        }, ts, `${key}:usage`));
      }

      const content = flattenOutput(o.content).trim();
      const thinking = flattenOutput(o.thinking).trim();
      const text = content || thinking;
      if (text) out.push(this.ev('message.delta', { text }, ts, `${key}:msg`));

      // Araç çağrısı olmayan nihai yanıt: tur tamamlandı (aksi halde görev sonsuz "sürüyor" görünür).
      if (calls.length === 0 && (o.status === 'DONE' || content)) {
        out.push(this.ev('task.completed', { exitCode: 0 }, ts, `${key}:end`));
        this.open = false;
      }
      return out;
    }

    if (o.type === 'GENERIC') {
      const toolUseId = String(o.tool_use_id ?? o.toolUseId ?? o.tool_call_id ?? o.call_id ?? o.id ?? this.lastToolId ?? '');
      const output = flattenOutput(o.content ?? o.output ?? o.result ?? '');
      out.push(this.ev('tool.completed', { toolUseId, output }, ts, `${key}:out`));
      return out;
    }

    return out;
  }
}
