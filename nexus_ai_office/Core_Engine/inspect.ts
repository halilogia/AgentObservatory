// Tıklanabilir 3D nesne kaydı: feature'lar kendini kaydeder, inspector bunu okur (çapraz import yok).
import * as THREE from 'three';
import type { AgentRuntimeState, Activity } from './agent-runtime';

export interface InspectAgent { id: string; name: string; role: string }

export type InspectKind = 'project' | 'server' | 'staff' | 'manager' | 'room' | 'board';

export interface Inspectable {
  id: string;
  /** çekmecedeki eylemleri belirler */
  kind: InspectKind;
  /** kind === 'project' ise kayıt defterindeki proje kimliği */
  projectId?: string;
  title: string;
  subtitle: string;
  color: number;
  object: THREE.Object3D;
  /** kamera odağı: nesnenin dünya konumuna eklenen ofset */
  focusOffset: THREE.Vector3;
  /** seçim halkası yarıçapı */
  radius: number;
  /** kamera yakınlaşma düzeyi (varsayılan 1.9; odalar için daha uzak) */
  zoom?: number;
  agents: InspectAgent[];
  /** "Şu anki görev" altında gösterilen operasyonel metrik (demo verisi); fonksiyon ise canlı hesaplanır */
  metric?: string | (() => string);
  /** talimat kutusu yer tutucusu */
  placeholder?: string;
  /** verilirse varsayılan eylemlerin yerine bu eylemler gösterilir */
  actions?: InspectAction[];
  /** Opens a dedicated surface after the camera starts focusing. */
  onSelect?: () => void;
}

/** Çekmecede gösterilen simüle eylem: günlüğe satır yazar, isteğe bağlı olarak botu hızlandırır */
export interface InspectAction {
  label: string;
  /** shared/icons.ts anahtarı (emoji yok, SVG) */
  icon?: string;
  log?: ['info' | 'ok' | 'warn' | 'cmd', string][];
  effect?: 'boost';
  onClick?: () => void;
}

export const inspectables: Inspectable[] = [];
/** proje kimliği → hologram sinyal gücü (0..1); bağlantısı kopan ajanı olan masada zayıflar */
export const projectSignal = new Map<string, number>();
/** inspectable'ın hiyerarşisinde olmayan ama onu temsil eden nesneler (ör. masadan bağımsız yürüyen robotlar) */
export const pickables: { object: THREE.Object3D; inspectId: string }[] = [];

export function registerInspectable(i: Inspectable): void {
  i.object.userData.inspectId = i.id;
  inspectables.push(i);
}

export function unregisterInspectable(id: string): void {
  const i = inspectables.findIndex(function (x) { return x.id === id; });
  if (i >= 0) { delete inspectables[i].object.userData.inspectId; inspectables.splice(i, 1); }
}

export function registerPickable(object: THREE.Object3D, inspectId: string): void {
  object.userData.inspectId = inspectId;
  pickables.push({ object: object, inspectId: inspectId });
}
export function unregisterPickable(object: THREE.Object3D): void {
  const i = pickables.findIndex(function (x) { return x.object === object; });
  if (i >= 0) { delete object.userData.inspectId; pickables.splice(i, 1); }
}

/** ajan botuna bağlanır: bota tıklayınca çekmecede o ajan açılır */
export function tagAgent(obj: THREE.Object3D, agentId: string): void {
  obj.userData.agentId = agentId;
}

/** Çekmece ↔ ajan çalışma zamanı köprüsü (inspector, robot/navigasyon feature'ını doğrudan tanımaz). */
export interface AgentControl {
  has(agentId: string): boolean;
  getState(agentId: string): AgentRuntimeState | undefined;
  /** robot şu an masasından ayrıysa (yürüyor/dinleniyor) 3B nesnesi; masadaysa undefined */
  awayObject(agentId: string): THREE.Object3D | undefined;
  /** kotayı doldur (demo): robot masadan kalkıp lounge'a gider */
  rateLimit(agentId: string, cooldownMs: number): void;
  /** masaya çağır / göreve başlat */
  recall(agentId: string): void;
  setActivity(agentId: string, activity: Activity): void;
  /** personel botunu geçici hızlandırır (zaman damgası tabanlı, robot başına) */
  boost(agentId: string, mul: number, ms: number): void;
  /** demo: CLI onayı iste / karara bağla */
  requestApproval(agentId: string, command: string): void;
  approve(agentId: string, decision: 'approve' | 'reject', note?: string): void;
  /** demo: bağlantıyı kopar / geri getir, görevi başarısız / tamamlanmış işaretle */
  setConnection(agentId: string, lost: boolean): void;
  setExecution(agentId: string, execution: 'failed' | 'completed'): void;
  onChange(cb: (agentId: string) => void): void;
}
