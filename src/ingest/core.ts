// Tier 3: Observatory dışında (elle) başlatılan oturumların kayıt dosyalarından olay üretimi.
// Her kullanıcı istemi bir "görev" olur: taskId = ext_<ajan>_<oturum>_<tur>. Olay kimlikleri belirlidir (aynı satır iki kez yazılmaz).
import crypto from 'node:crypto';
import type { AgentType, EventType, TaskEvent } from '../core/types.ts';

export interface ExtEvent {
  taskId: string;
  sessionId: string | null;
  agent: AgentType;
  type: EventType;
  data: Record<string, unknown>;
  ts: number;
  /** olay kimliğinin tohumu: aynı tohum = aynı olay (INSERT OR IGNORE ile tekrar yazılmaz) */
  seed: string;
}

/** Observatory kendi başlattığı görevi zaten kaydetti mi? (ajan, istem, zaman) */
export type ManagedCheck = (agent: string, prompt: string, ts: number) => boolean;

export interface LineParser {
  push(line: string, key: string): ExtEvent[];
}

export function toTaskEvent(e: ExtEvent): TaskEvent {
  return {
    id: 'ext_' + crypto.createHash('sha1').update(e.seed).digest('hex').slice(0, 16),
    taskId: e.taskId,
    sessionId: e.sessionId,
    agent: e.agent,
    tier: 3,
    type: e.type,
    data: { ...e.data, external: true },
    timestamp: e.ts
  };
}

export function shortId(s: string): string {
  return String(s).replace(/[^a-z0-9]/gi, '').slice(0, 10) || 'x';
}

/** Araç çıktısını düz metne indirger (string | [{type:'text',text}] | nesne). */
export function flattenOutput(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x: any) => (typeof x === 'string' ? x : x?.text ?? x?.content ?? JSON.stringify(x))).join('\n');
  return JSON.stringify(v);
}

/** Sistemin eklediği istem parçaları gerçek kullanıcı metni değildir. */
export function isInjectedText(t: string): boolean {
  if (/^\s*<(system-reminder|ide_|command-|environment_context|user_instructions|local-command)/i.test(t) || /^\s*# AGENTS\.md instructions/.test(t)) return true;
  // genel kural: <etiket ...> ile başlayıp </etiket> ile biten blok, ajanın eklediği bağlamdır (ör. <recommended_plugins>)
  const m = /^\s*<([a-z][\w-]*)[^>]*>/i.exec(t);
  return !!m && t.includes(`</${m[1]}>`);
}

export function parseJson(line: string): any | null {
  try { return JSON.parse(line); } catch { return null; }
}
