// Ajan çalışma durumu: kota/uygunluk, yürütme, faaliyet ve konum DURUMLARI AYRI tutulur (ChatGPT denetimi).
// "resting" tek başına kotanın dolduğunu kanıtlamaz; faaliyet bilinmiyorsa kesin bir eylem gibi gösterilmez.
// Saf mantık: sıfır bağımlılık. source: 'demo' olaylar her zaman açıkça etiketlenir.

export type Availability = 'available' | 'rate_limited' | 'offline' | 'unknown';
export type Execution = 'idle' | 'running' | 'awaiting_approval' | 'completed' | 'failed';
export type Activity = 'reading' | 'coding' | 'reasoning' | 'testing' | 'writing' | 'ops' | 'planning' | 'obsidian' | 'web_chatgpt' | 'none';

/** kitap okuma görünümü (kitap + kütüphane) gerektiren faaliyetler: dosya okuma, Obsidian ve ChatGPT Web MCP'leri */
export function isReadingLike(a: string): boolean {
  return a === 'reading' || a === 'obsidian' || a === 'web_chatgpt';
}
export type NavigationState = 'seated' | 'standing' | 'walking' | 'resting';
export type EventSource = 'live' | 'demo';

export interface AgentRuntimeState {
  agentId: string;
  availability: Availability;
  execution: Execution;
  activity: Activity;
  navigation: NavigationState;
  cooldownUntil?: number;
  /** 'lost': bağlantı kopması (kota beklemesinden ayrı tutulur) */
  connection?: 'lost';
  /** onay bekleyen CLI işlemi (awaiting_approval iken dolu) */
  approval?: { command: string };
  currentTaskId?: string;
  source: EventSource;
}

export type AgentEvent =
  | { type: 'rate_limit'; agentId: string; cooldownMs: number; at: number }
  /** süre doldu: kota henüz DOĞRULANMADI → availability 'unknown' */
  | { type: 'cooldown_elapsed'; agentId: string; at: number }
  | { type: 'quota_verified'; agentId: string; at: number }
  | { type: 'activity'; agentId: string; activity: Activity; at: number }
  | { type: 'execution'; agentId: string; execution: Execution; at: number }
  | { type: 'navigation'; agentId: string; navigation: NavigationState; at: number }
  | { type: 'approval_required'; agentId: string; command: string; at: number }
  | { type: 'approval_resolved'; agentId: string; decision: 'approve' | 'reject'; note?: string; at: number }
  | { type: 'connection_lost'; agentId: string; at: number }
  | { type: 'connection_restored'; agentId: string; at: number };

export function initialState(agentId: string, source: EventSource): AgentRuntimeState {
  return { agentId: agentId, availability: 'available', execution: 'idle', activity: 'none', navigation: 'seated', source: source };
}

/** Saf indirgeyici: (durum, olay) → yeni durum. Girdiyi değiştirmez. */
export function reduce(s: AgentRuntimeState, e: AgentEvent): AgentRuntimeState {
  const n: AgentRuntimeState = Object.assign({}, s);
  switch (e.type) {
    case 'rate_limit':
      n.availability = 'rate_limited'; n.cooldownUntil = e.at + e.cooldownMs;
      n.execution = n.execution === 'awaiting_approval' ? 'awaiting_approval' : 'idle'; // onay bekleyen işlem sessizce iptal edilmez
      n.activity = 'none';
      break;
    case 'cooldown_elapsed':
      if (n.availability === 'rate_limited') { n.availability = 'unknown'; n.cooldownUntil = undefined; }
      break;
    case 'quota_verified':
      if (n.availability === 'unknown' || n.availability === 'rate_limited') { n.availability = 'available'; n.cooldownUntil = undefined; }
      break;
    case 'activity':
      if (n.availability !== 'available') break; // kotası dolan / bağlantısı kopan ajan çalışıyor gösterilmez
      n.activity = e.activity; n.execution = e.activity === 'none' ? 'idle' : 'running';
      break;
    case 'execution':
      if (n.availability !== 'available' && e.execution === 'running') break;
      n.execution = e.execution; if (e.execution !== 'running') n.activity = 'none';
      if (e.execution !== 'awaiting_approval') n.approval = undefined;
      break;
    case 'navigation':
      n.navigation = e.navigation; break;
    case 'connection_lost':
      // bağlantı kopması başarı/boşta anlamına gelmez: yalnızca belirsiz işaretlenir
      n.connection = 'lost';
      if (n.availability === 'available') n.availability = 'unknown';
      break;
    case 'connection_restored':
      n.connection = undefined;
      if (n.availability === 'unknown' && n.cooldownUntil === undefined) n.availability = 'available';
      break;
    case 'approval_required':
      if (n.availability !== 'available') break; // çalışamayan ajan onay istemez
      n.execution = 'awaiting_approval'; n.activity = 'none'; n.approval = { command: e.command };
      break;
    case 'approval_resolved':
      if (n.execution !== 'awaiting_approval') break;
      n.approval = undefined;
      if (e.decision === 'approve') { n.execution = 'running'; n.activity = 'coding'; } else { n.execution = 'idle'; n.activity = 'none'; }
      break;
  }
  return n;
}

export type RuntimeListener = (next: AgentRuntimeState, prev: AgentRuntimeState, event: AgentEvent) => void;

export class AgentRuntimeStore {
  private readonly states = new Map<string, AgentRuntimeState>();
  private readonly listeners: RuntimeListener[] = [];

  ensure(agentId: string, source: EventSource): AgentRuntimeState {
    let s = this.states.get(agentId);
    if (!s) { s = initialState(agentId, source); this.states.set(agentId, s); }
    return s;
  }
  get(agentId: string): AgentRuntimeState | undefined { return this.states.get(agentId); }
  remove(agentId: string): void { this.states.delete(agentId); }
  ids(): string[] { return Array.from(this.states.keys()); }
  on(l: RuntimeListener): void { this.listeners.push(l); }

  dispatch(e: AgentEvent): AgentRuntimeState | undefined {
    const prev = this.states.get(e.agentId); if (!prev) return undefined;
    const next = reduce(prev, e);
    this.states.set(e.agentId, next);
    this.listeners.forEach(function (l) { l(next, prev, e); });
    return next;
  }
}

/**
 * Hedef oda çözümleyici: durumdan, ajanın OLMASI GEREKEN yeri çıkarır (fiziksel konumdan bağımsız).
 * Yalnızca kota (rate_limited) lounge'a gönderir; Failed/Awaiting Approval masada kalır; unknown/offline hareket ettirmez.
 */
export type DesiredPlace = 'desk' | 'lounge' | 'stay';
export function desiredPlace(s: AgentRuntimeState, atLounge: boolean): DesiredPlace {
  if (s.availability === 'rate_limited') return 'lounge';
  if (s.availability === 'available') return atLounge ? 'desk' : 'stay';
  return 'stay';
}
