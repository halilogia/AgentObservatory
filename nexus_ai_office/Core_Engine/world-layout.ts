// Kampüs yerleşimi: odalar, kapılar, lounge mobilyaları ve navigasyon grafiği. Saf veri + grafik kurucular (Three.js yok).
import { NavGraph } from './navigation';
import { slotAt, ROW_STEP } from './office-registry';
import type { Slot } from './office-registry';

/** Bina genişliği 23 m: en geniş (16 koltuk) masa bile duvara değmez, dışarı taşmaz. */
export const WORLD = { x0: -11.5, x1: 11.5, backZ: -13, frontZ: 6 };

/** oda dikdörtgenleri (iç yüzey; bölme duvarları 0.12 kalın). Arka şerit: 5 müstakil oda + koridor; önde açık çalışma alanı. */
export const ROOMS = {
  lounge: { id: 'lounge', name: 'Dinlenme Odası', x0: -11.5, x1: -6.9, z0: -13, z1: -6.56 },
  library: { id: 'library', name: 'Kütüphane / Araştırma Odası', x0: -6.78, x1: -2.34, z0: -13, z1: -6.56 },
  war: { id: 'war', name: 'Plan Odası', x0: -2.22, x1: 2.22, z0: -13, z1: -6.56 },
  testlab: { id: 'testlab', name: 'Test Laboratuvarı', x0: 2.34, x1: 6.78, z0: -13, z1: -6.56 },
  server: { id: 'server', name: 'Sunucu Odası', x0: 6.9, x1: 11.5, z0: -13, z1: -6.56 },
  corridor: { id: 'corridor', name: 'Koridor', x0: -11.5, x1: 11.5, z0: -6.44, z1: -5 },
  workspace: { id: 'workspace', name: 'Açık Çalışma Alanı', x0: -11.5, x1: 11.5, z0: -5, z1: 6 }
} as const;
export type RoomId = keyof typeof ROOMS;

export const PARTITION_Z = -6.5;
/** oda arası bölmeler (x ekseninde, soldan sağa) */
export const PARTITION_XS = [-6.84, -2.28, 2.28, 6.84];
/** kapılar soldan sağa; her biri odanın tam ortasında */
export const DOORS: { room: RoomId; x: number; width: number }[] = [
  { room: 'lounge', x: -9.2, width: 2.0 },
  { room: 'library', x: -4.56, width: 2.0 },
  { room: 'war', x: 0, width: 2.4 },
  { room: 'testlab', x: 4.56, width: 2.0 },
  { room: 'server', x: 9.2, width: 2.0 }
];

export interface SeatFurniture {
  id: string;
  kind: 'sofa' | 'armchair';
  /** yerel genişlik (x) ve oturak sayısı */
  w: number; seats: number;
  x: number; z: number; ry: number;
}

/** lounge mobilyaları: model yerel +z'ye bakar; ry mobilyayı döndürür */
export const LOUNGE_FURNITURE: SeatFurniture[] = [
  { id: 'sofaW', kind: 'sofa', w: 2.4, seats: 2, x: -10.95, z: -9.4, ry: Math.PI / 2 },
  { id: 'sofaB', kind: 'sofa', w: 2.4, seats: 2, x: -8.15, z: -12.45, ry: 0 },
  { id: 'armA1', kind: 'armchair', w: 1.4, seats: 1, x: -7.65, z: -8.4, ry: -Math.PI / 2 },
  { id: 'armA2', kind: 'armchair', w: 1.4, seats: 1, x: -7.65, z: -10.4, ry: -Math.PI / 2 }
];

export const SOFA_ARM_W = 0.22;
export const SEAT_LOCAL_Y = 0.22;
export const SEAT_LOCAL_Z = 0.14;

export function cushionWidth(f: SeatFurniture): number { return (f.w - 2 * SOFA_ARM_W - 0.1) / f.seats; }

/** i. oturağın dünya konumu + bakış açısı (bot orijini) */
export function furnitureSeat(f: SeatFurniture, i: number): { x: number; z: number; y: number; ry: number } {
  const lx = (i - (f.seats - 1) / 2) * (cushionWidth(f) + 0.04), lz = SEAT_LOCAL_Z, c = Math.cos(f.ry), s = Math.sin(f.ry);
  return { x: f.x + lx * c + lz * s, z: f.z - lx * s + lz * c, y: SEAT_LOCAL_Y, ry: f.ry };
}

/** lounge'da her oturağın önündeki ayakta durma noktası */
const LOUNGE_STANDS: Record<string, [number, number][]> = {
  sofaW: [[-9.8, -8.9], [-9.8, -9.9]], // oturak i ile aynı sırada: çaprazlama yok
  sofaB: [[-8.65, -11.4], [-7.65, -11.4]],
  armA1: [[-8.7, -8.4]],
  armA2: [[-8.7, -10.4]]
};

export const POST_NODES = {
  loungePost: 'lounge:post',          // Standby Bekçisi
  loungeCoffee: 'lounge:coffee',      // Context Compactor kahve köşesi
  warServe: 'war:door_in'
};

export const SPINE_X = 0;
/** istasyon mobilyaları (arka şerit, +z'ye bakar) ve robotun durduğu z */
export const STATION_LIBRARY = { x: -4.56, z: -10.4 };
export const STATION_TEST = { x: 4.56, z: -10.4 };
export const STATION_STAND_Z = -9.5;

/** Faaliyet → gidilecek istasyon düğümü (masada kalan faaliyetler için undefined) */
export function stationFor(activity: string): string | undefined {
  const a = (activity || '').toLowerCase();
  // Kütüphane (Obsidian bilgi kasası + ChatGPT Web kütüphanecisi): dosya okuma, araştırma, doküman, Obsidian / ChatGPT Web MCP
  if (a === 'reading' || a === 'web_search' || a === 'research' || a === 'docs' || a === 'dokuman_inceleme' ||
    a === 'obsidian' || a === 'memory' || a === 'universal_memory' || a === 'chatgpt' || a === 'webchatgpt' || a === 'web_chatgpt') return 'station:library';
  // Test Laboratuvarı (QA Lab): testing, run_tests, lint, typecheck
  if (a === 'testing' || a === 'run_tests' || a === 'lint' || a === 'typecheck') return 'station:test';
  // Sunucu Odası (Server Room): provider_connect, ops, kota telemetrisi
  if (a === 'ops' || a === 'provider_connect' || a === 'telemetry' || a === 'server') return 'server:rack';
  // Plan Odası: planning, mimari denetim
  if (a === 'planning' || a === 'plan' || a === 'architecture_review' || a === 'mimari_denetim') return 'war:door_in';
  // Açık Çalışma Alanı (Workspace): coding, reasoning, dosya düzenleme -> masada kalır
  return undefined;
}
export const LANE_X = 2.1;

export interface DeskSeat { sx: number; sz: number; ry: number }

/** Koltuk sayısına göre masadaki oturma pozisyonlarını hesaplar (N ajan için dinamik genişleme) */
export function getDeskSeats(seatCount: number): DeskSeat[] {
  const count = Math.max(1, seatCount);
  const k = Math.max(1, Math.ceil(count / 2));
  const out: DeskSeat[] = [];
  const SPACING = 1.5;

  for (let i = 0; i < count; i++) {
    const isNorth = i % 2 === 0;
    const col = isNorth ? i / 2 : (i - 1) / 2;
    const sx = (col - (k - 1) / 2) * SPACING;
    const sz = isNorth ? -1.3 : 1.3;
    const ry = isNorth ? 0 : Math.PI;
    out.push({ sx, sz, ry });
  }
  return out;
}

/** masa yerel koltuk konumları (varsayılan 16 kapasiteli dizi) */
export const DESK_SEATS: DeskSeat[] = getDeskSeats(16);
const SEAT_Y_DESK = 0.32;

export function spineZ(k: number): number { return slotAt(0).z - 1.6 + ROW_STEP * (k + 1); }

/** koridor, kapılar, oda içi düğümler ve çalışma alanı omurgası */
export function buildStaticGraph(g: NavGraph): void {
  const add = function (id: string, x: number, z: number, room: string): void { g.addNode({ id: id, x: x, z: z, room: room }); };

  // koridor: her kapının önünde bir düğüm (soldan sağa)
  add('corr:LL', -9.2, -5.4, 'corridor'); add('corr:L', -4.56, -5.4, 'corridor'); add('corr:M', 0, -5.4, 'corridor');
  add('corr:R', 4.56, -5.4, 'corridor'); add('corr:RR', 9.2, -5.4, 'corridor');
  g.link('corr:LL', 'corr:L'); g.link('corr:L', 'corr:M'); g.link('corr:M', 'corr:R'); g.link('corr:R', 'corr:RR');

  // lounge
  add('lounge:door', -9.2, -6.5, 'lounge'); add('lounge:in', -9.6, -7.5, 'lounge');
  add(POST_NODES.loungePost, -7.5, -7.2, 'lounge'); add(POST_NODES.loungeCoffee, -10.45, -11.2, 'lounge');
  g.link('corr:LL', 'lounge:door'); g.link('lounge:door', 'lounge:in'); g.link('lounge:in', POST_NODES.loungePost);
  LOUNGE_FURNITURE.forEach(function (f) {
    const stands = LOUNGE_STANDS[f.id];
    for (let i = 0; i < f.seats; i++) {
      const st = stands[i], seat = furnitureSeat(f, i);
      add('lounge:stand:' + f.id + ':' + i, st[0], st[1], 'lounge');
      g.addNode({ id: 'lounge:seat:' + f.id + ':' + i, x: seat.x, z: seat.z, room: 'lounge', seat: { y: seat.y, ry: seat.ry } });
      g.link('lounge:stand:' + f.id + ':' + i, 'lounge:seat:' + f.id + ':' + i, 'seat');
    }
  });
  g.link('lounge:in', 'lounge:stand:sofaW:0'); g.link('lounge:in', 'lounge:stand:armA1:0');
  g.link('lounge:stand:sofaW:0', 'lounge:stand:sofaW:1');
  g.link('lounge:stand:sofaW:1', POST_NODES.loungeCoffee);
  g.link('lounge:stand:sofaW:1', 'lounge:stand:armA2:0');
  g.link('lounge:stand:armA2:0', 'lounge:stand:sofaB:0');
  g.link('lounge:stand:sofaB:0', 'lounge:stand:sofaB:1');
  g.link(POST_NODES.loungeCoffee, 'lounge:stand:sofaB:0');

  // kütüphane ve test laboratuvarı: kapıdan içeri, istasyon düğümü masaya bakar
  [['library', -4.56, 'corr:L', STATION_LIBRARY.x], ['testlab', 4.56, 'corr:R', STATION_TEST.x]].forEach(function (r) {
    const id = r[0] as string, x = r[1] as number;
    add(id + ':door', x, -6.5, id); add(id + ':in', x, -7.6, id);
    g.link(r[2] as string, id + ':door'); g.link(id + ':door', id + ':in');
    g.addNode({ id: id === 'library' ? 'station:library' : 'station:test', x: r[3] as number, z: STATION_STAND_Z, room: id, face: Math.PI });
    g.link(id + ':in', id === 'library' ? 'station:library' : 'station:test');
  });

  // plan odası: kapıdan içeri brifing noktası (gelen robot yönetici masasına bakar)
  add('war:door', 0, -6.5, 'war');
  g.addNode({ id: POST_NODES.warServe, x: 0, z: -7.7, room: 'war', face: -Math.PI });
  g.link('corr:M', 'war:door'); g.link('war:door', POST_NODES.warServe);

  // sunucu odası: robot sunucu kabinine bakar
  add('server:door', 9.2, -6.5, 'server'); add('server:in', 9.2, -7.7, 'server'); add('server:mid', 9.2, -9.4, 'server');
  g.addNode({ id: 'server:rack', x: 9.2, z: -10.6, room: 'server', face: -Math.PI });
  g.link('corr:RR', 'server:door'); g.link('server:door', 'server:in'); g.link('server:in', 'server:mid'); g.link('server:mid', 'server:rack');

  // çalışma alanı omurgası
  add('spine:top', SPINE_X, -4.0, 'workspace'); g.link('corr:M', 'spine:top');
  ensureSpine(g, 0);
}

/** yürüme halısı rengi (koridor halısıyla aynı: birleşim dikişsiz görünür) */
export const WALK_COLOR = 0xf6eedf;
export interface WalkRect { id: string; x: number; z: number; w: number; d: number; layer: number }
/** satır aralığı yürüme şeritlerinin ilk merkezi: 0. satırın güney koltukları ile 1. satırın kuzey koltukları arası */
const AISLE0_Z = slotAt(0).z + 2.6;

/**
 * Robot yollarının zemin halıları (hacimsiz): orta omurga (koridordan zeminin ön kenarına, zemin uzadıkça uzar),
 * kapı eşikleri ve masa sıraları arası yatay şeritler. Üst üste binenler farklı katmandadır (z-fighting yok).
 */
export function walkwayRects(extra: number): WalkRect[] {
  const front = WORLD.frontZ + extra, out: WalkRect[] = [];
  const z0 = -5.4, z1 = front - 0.2; // koridor halısının 0.3 m üstüne biner: dikişsiz birleşim
  out.push({ id: 'spine', x: SPINE_X, z: (z0 + z1) / 2, w: 2.0, d: z1 - z0, layer: 3 });
  DOORS.forEach(function (d) { out.push({ id: 'door:' + d.room, x: d.x, z: -6.55, w: d.width - 0.3, d: 0.8, layer: 3 }); });
  for (let k = -1; AISLE0_Z + ROW_STEP * k + 0.6 <= front - 0.2; k++) {
    out.push({ id: 'aisle:' + k, x: 0, z: AISLE0_Z + ROW_STEP * k, w: 16, d: 1.2, layer: 2 });
  }
  return out;
}

/** omurga düğümlerini -1..k aralığında oluşturur */
export function ensureSpine(g: NavGraph, k: number): void {
  for (let i = -1; i <= k; i++) {
    const id = 'spine:' + i;
    if (g.has(id)) continue;
    g.addNode({ id: id, x: SPINE_X, z: spineZ(i), room: 'workspace' });
    if (i === -1) g.link('spine:top', id); else g.link('spine:' + (i - 1), id);
  }
}

export interface DeskSeatInfo {
  index: number;
  /** bot orijini (oturur konum) */
  x: number; z: number; y: number; ry: number;
  seatNode: string;
}

const deskNode = function (deskId: string, suffix: string): string { return 'desk:' + deskId + ':' + suffix; };

/** Masaya bağlı koltukları ve koridor erişim düğümlerini ekler (N koltuk için ölçeklenir). */
export function addDeskNodes(g: NavGraph, deskId: string, slot: Slot, seatCount = 4): DeskSeatInfo[] {
  if (!Number.isInteger(seatCount) || seatCount < 1) throw new RangeError('Invalid seat count');
  ensureSpine(g, slot.row);
  const toward = slot.x < 0 ? 1 : -1;
  const out: DeskSeatInfo[] = [];
  const seats = getDeskSeats(seatCount);
  seats.forEach(function (s, i) {
    const cx = slot.x + s.sx, cz = slot.z + s.sz;
    const bx = cx + Math.sin(s.ry) * 0.12, bz = cz + Math.cos(s.ry) * 0.12; // sırtlıktan baş dönüşü payı
    const seat = deskNode(deskId, 'seat' + i), step = deskNode(deskId, 'step' + i), lane = deskNode(deskId, s.sz < 0 ? 'lane:N' : 'lane:S');
    g.addNode({ id: seat, x: bx, z: bz, room: 'workspace', seat: { y: SEAT_Y_DESK, ry: s.ry } });
    const stepZ = cz + (s.sz < 0 ? -0.8 : 0.8);
    g.addNode({ id: step, x: cx, z: stepZ, room: 'workspace' });
    if (!g.has(lane)) g.addNode({ id: lane, x: -toward * LANE_X, z: cz, room: 'workspace' });
    g.link(seat, step, 'seat'); g.link(step, lane);
    g.link(lane, 'spine:' + (s.sz < 0 ? slot.row - 1 : slot.row));
    out.push({ index: i, x: bx, z: bz, y: SEAT_Y_DESK, ry: s.ry, seatNode: seat });
  });
  return out;
}

export function removeDeskNodes(g: NavGraph, deskId: string): void { g.removeByPrefix('desk:' + deskId + ':'); }

export function deskSeatNode(deskId: string, index: number): string { return deskNode(deskId, 'seat' + index); }

/** lounge'daki tüm oturak düğümleri */
export function loungeSeatNodes(g: NavGraph): string[] {
  const out: string[] = [];
  g.nodes.forEach(function (_n, id) { if (id.indexOf('lounge:seat:') === 0) out.push(id); });
  return out;
}
/** lounge'da oturağı olmayan bekleme noktaları (oturak doluyken) */
export function loungeWaitNodes(): string[] {
  return ['lounge:stand:sofaB:1', 'lounge:stand:armA2:0', 'lounge:stand:armA1:0'];
}

/** lounge hedeflerini yakından uzağa sıralar: önce boş oturaklar, sonra (hepsi doluysa) ayakta bekleme noktaları */
export function rankLoungeDestinations(g: NavGraph, from: string): string[] {
  const len = function (id: string): number { const p = g.findPath(from, id); return p ? g.pathLength(p) : Infinity; };
  const seats = loungeSeatNodes(g).sort(function (a, b) { return len(a) - len(b); });
  const waits = loungeWaitNodes().sort(function (a, b) { return len(a) - len(b); });
  return seats.concat(waits).filter(function (id) { return len(id) < Infinity; });
}
