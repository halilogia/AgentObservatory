// Hata metninden hata türünü çıkarır. Orkestratör (ve 3D ofis) kota dolan motoru ayırt edebilmeli:
// kota hatası "ajan bozuk" değil "ajan bekliyor" demektir.

export type FailureKind = 'rate_limit' | 'auth' | 'model_unsupported' | 'permission' | 'spawn_failed' | 'unknown';

const RATE_LIMIT_RE = /rate.?limit|quota|usage limit|\b429\b|resource_exhausted|too many requests|limit reached|exhausted/i;
const AUTH_RE = /not logged in|login required|unauthori[sz]ed|\b401\b|invalid api key|no active credentials/i;
const MODEL_RE = /model .{0,60}(not supported|not found)|unsupported model/i;
const PERMISSION_RE = /permission.{0,40}(denied|required)|no output produced/i;
const SPAWN_RE = /\b(ENOENT|EINVAL|EACCES|EPERM)\b|spawn .{0,60}(failed|error)|Süreç başlatılamadı/i;

/** Bekleme süresi tahmini (ms): "try again in 20 minutes" gibi ipuçlarını okur, yoksa 30 dk. */
const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;

export function classifyFailure(text: string, now: Date = new Date()): { kind: FailureKind; cooldownMs?: number } {
  if (!text) return { kind: 'unknown' };
  if (RATE_LIMIT_RE.test(text)) {
    const m = /(?:in|after)\s+(\d+)\s*(second|minute|hour|sn|dk|saat)/i.exec(text);
    let cooldownMs = DEFAULT_COOLDOWN_MS;
    // "try again at 2:29 AM" (Codex): yerel saatte bir sonraki o saate kadar
    const at = /try again at\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(text);
    if (at && !m) {
      const t = new Date(now);
      t.setHours((Number(at[1]) % 12) + (at[3].toUpperCase() === 'PM' ? 12 : 0), Number(at[2]), 0, 0);
      if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
      cooldownMs = t.getTime() - now.getTime();
    }
    if (m) {
      const n = Number(m[1]);
      const unit = m[2].toLowerCase();
      cooldownMs = n * (unit.startsWith('s') && unit !== 'saat' ? 1000 : unit.startsWith('h') || unit === 'saat' ? 3600000 : 60000);
    }
    return { kind: 'rate_limit', cooldownMs };
  }
  if (MODEL_RE.test(text)) return { kind: 'model_unsupported' };
  if (AUTH_RE.test(text)) return { kind: 'auth' };
  if (PERMISSION_RE.test(text)) return { kind: 'permission' };
  if (SPAWN_RE.test(text)) return { kind: 'spawn_failed' };
  return { kind: 'unknown' };
}

/** `task.failed` olayının `data` alanı: hata metni + tür (+ kota ise bekleme süresi). */
export function failureData(error: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const f = classifyFailure(error);
  return { ...extra, error, errorKind: f.kind, ...(f.cooldownMs ? { cooldownMs: f.cooldownMs } : {}) };
}
