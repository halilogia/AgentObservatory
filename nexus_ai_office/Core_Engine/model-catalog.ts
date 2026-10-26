// Model kataloğu: sağlayıcı (motor) → güncel modeller. Görünen adlar sabit yazılmaz, model kimliğinden türetilir.
// Saf veri: sıfır bağımlılık (localStorage yalnızca varsa kullanılır).

export type EngineId = 'antigravity' | 'claude' | 'codex' | 'chatgpt';

export interface ModelEntry { id: string; label: string }
export interface EngineEntry { id: EngineId; label: string; defaultModel: string; models: ModelEntry[] }

/** Not: Claude satırı projenin model matrisine uyar (aktif amiral gemisi Claude Sonnet 5.5; eski 3.x sürümleri listelenmez). */
export const ENGINES: EngineEntry[] = [
  {
    id: 'antigravity', label: 'Antigravity', defaultModel: 'gemini-3.8-flash',
    models: [{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }, { id: 'gemini-3.8-pro', label: 'Gemini 3.8 Pro' }, { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }]
  },
  {
    id: 'claude', label: 'Claude', defaultModel: 'claude-sonnet-5-5',
    models: [{ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' }, { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' }, { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' }]
  },
  {
    id: 'codex', label: 'Codex', defaultModel: 'gpt-6-astra',
    models: [{ id: 'gpt-6-astra', label: 'GPT-6 Astra' }, { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' }, { id: 'codex-5.2', label: 'Codex 5.2' }]
  },
  {
    id: 'chatgpt', label: 'ChatGPT', defaultModel: 'gpt-4o',
    models: [{ id: 'gpt-4o', label: 'GPT-4o' }, { id: 'o3-mini', label: 'o3-mini' }, { id: 'o1', label: 'o1' }]
  }
];

/** Yönetici (Office Manager) için varsayılan model */
export const MANAGER_DEFAULT_MODEL = 'gemini-3.8-flash';
const MANAGER_KEY = 'nexus.managerModel';

export function engineOf(engine: EngineId): EngineEntry {
  return ENGINES.filter(function (e) { return e.id === engine; })[0];
}

export function engineOfModel(modelId: string): EngineId | undefined {
  for (let i = 0; i < ENGINES.length; i++) if (ENGINES[i].models.some(function (m) { return m.id === modelId; })) return ENGINES[i].id;
  return undefined;
}

/** Bilinen modelde katalog adı; bilinmeyende kimlik okunur biçime çevrilir. */
export function modelLabel(modelId: string): string {
  for (let i = 0; i < ENGINES.length; i++) {
    const m = ENGINES[i].models.filter(function (x) { return x.id === modelId; })[0];
    if (m) return m.label;
  }
  return modelId.split('-').map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(' ');
}

export function getManagerModel(): string {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(MANAGER_KEY) : null;
    if (v && engineOfModel(v)) return v;
  } catch (e) { /* kalıcılık yoksa varsayılan */ }
  return MANAGER_DEFAULT_MODEL;
}

export function setManagerModel(modelId: string): boolean {
  if (!engineOfModel(modelId)) return false;
  try { localStorage.setItem(MANAGER_KEY, modelId); } catch (e) { /* yoksay */ }
  return true;
}
