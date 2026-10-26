// Ofis kayıt defteri: aktif projeler, masa ızgarası ve zemin büyüklüğü. Saf mantık, sıfır bağımlılık.
// Project = proje adacığı (masa), Agent = robot, Model = rozet. Hiçbiri koda gömülü değildir.

export type ModelId = 'claude' | 'gemini' | 'chatgpt' | 'codex' | 'antigravity' | 'nexus' | 'barista' | 'courier' | 'gravityguard' | 'generic';
export type IconKind = 'globe' | 'phone' | 'doc' | 'book' | 'gamepad' | 'heart' | 'cube';

export interface AgentSpec {
  id: string;
  name: string;
  model: ModelId;
  /** seçilen somut model kimliği (ör. 'gemini-3.8-flash'); rozet/ad bundan türetilir */
  modelId?: string;
  role?: string;
  /** çekmecede "Şu anki görev" olarak görünür */
  task?: string;
}

export interface ProjectSpec {
  id: string;
  name: string;
  /** 0xRRGGBB vurgu rengi */
  color: number;
  icon: IconKind;
  /** One occupied seat per agent, up to four per desk. */
  agents: AgentSpec[];
}

export interface Slot { index: number; col: 0 | 1; row: number; x: number; z: number }

export type RegistryEvent =
  | { type: 'added'; project: ProjectSpec; slot: Slot }
  | { type: 'removed'; project: ProjectSpec; slot: Slot }
  | { type: 'agent_added' | 'agent_removed'; project: ProjectSpec; slot: Slot; agent: AgentSpec }
  | { type: 'floor'; extraDepth: number };

export const MAX_AGENTS_PER_DESK = 16;

/** masa ızgarası: iki sütun (sol/sağ), ortada ferah yürüme koridoru; her satır 5.2 birim */
const COL_X = [-5.2, 5.2];
const ROW0_Z = -0.6;
export const ROW_STEP = 5.2;
/** başlangıç zemini 2 satır taşır; sonrası için her ek satır zemini ROW_STEP kadar uzatır */
/** başlangıç zemininin ön kenarı (z) ve güney koltuk sırası için gereken pay */
export const FLOOR_FRONT0 = 6;
export const FLOOR_MARGIN = 2.3;

export function slotAt(index: number): Slot {
  const row = Math.floor(index / 2), col = (index % 2) as 0 | 1;
  return { index: index, col: col, row: row, x: COL_X[col], z: ROW0_Z + ROW_STEP * row };
}

type Listener = (e: RegistryEvent) => void;

export class OfficeRegistry {
  private readonly bySlot = new Map<number, ProjectSpec>();
  private readonly listeners: Listener[] = [];
  private extra = 0;

  on(l: Listener): void { this.listeners.push(l); }
  private emit(e: RegistryEvent): void { this.listeners.forEach(function (l) { l(e); }); }

  projects(): ProjectSpec[] {
    const out: ProjectSpec[] = [];
    this.bySlot.forEach(function (p) { out.push(p); });
    return out;
  }
  slotOf(projectId: string): Slot | null {
    let found: Slot | null = null;
    this.bySlot.forEach(function (p, i) { if (p.id === projectId) found = slotAt(i); });
    return found;
  }
  get floorExtraDepth(): number { return this.extra; }

  /** projeyi ilk boş masaya yerleştirir; gerekirse zemini büyütür */
  addProject(spec: ProjectSpec): Slot {
    if (this.slotOf(spec.id)) throw new Error('Proje zaten var: ' + spec.id);
    if (spec.agents.length < 1 || spec.agents.length > MAX_AGENTS_PER_DESK) throw new Error('Bir masada 1-' + MAX_AGENTS_PER_DESK + ' ajan olmalı');
    const ids = new Set(spec.agents.map(a => a.id));
    if (ids.size !== spec.agents.length || spec.agents.some(a => this.hasAgent(a.id))) throw new Error('Duplicate agent ID');
    let i = 0; while (this.bySlot.has(i)) i++;
    const slot = slotAt(i);
    this.bySlot.set(i, spec);
    // sıranın güney koltukları (z+1.3, sandalye yarıçapı 0.43) ve 0.5 pay zeminin içinde kalmalı; 0.5'lik adımlarla yukarı yuvarlanır
    const need = Math.max(0, Math.ceil((slot.z + FLOOR_MARGIN - FLOOR_FRONT0) * 2) / 2);
    if (need > this.extra) { this.extra = need; this.emit({ type: 'floor', extraDepth: need }); }
    this.emit({ type: 'added', project: spec, slot: slot });
    return slot;
  }

  private hasAgent(id: string): boolean {
    return this.projects().some(p => p.agents.some(a => a.id === id));
  }

  addAgent(projectId: string, agent: AgentSpec): boolean {
    const slot = this.slotOf(projectId); if (!slot) return false;
    const project = this.bySlot.get(slot.index)!;
    if (project.agents.length >= MAX_AGENTS_PER_DESK || this.hasAgent(agent.id)) return false;
    project.agents.push(agent);
    this.emit({ type: 'agent_added', project, slot, agent });
    return true;
  }

  removeAgent(projectId: string, agentId: string): boolean {
    const slot = this.slotOf(projectId); if (!slot) return false;
    const project = this.bySlot.get(slot.index)!;
    const index = project.agents.findIndex(a => a.id === agentId);
    if (project.agents.length <= 1 || index < 0) return false;
    const [agent] = project.agents.splice(index, 1);
    this.emit({ type: 'agent_removed', project, slot, agent });
    return true;
  }

  /** projeyi kaldırır; boşalan masa sonraki projeye açılır */
  removeProject(projectId: string): boolean {
    const slot = this.slotOf(projectId); if (!slot) return false;
    const spec = this.bySlot.get(slot.index)!;
    this.bySlot.delete(slot.index);
    this.emit({ type: 'removed', project: spec, slot: slot });
    return true;
  }
}
