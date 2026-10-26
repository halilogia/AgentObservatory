// Çok odalı kampüs: bölme duvarları (düşük taban + mat cam), kapı çerçeveleri ve tabelaları, oda zemin kaplamaları,
// dinlenme odası (lounge) mobilyaları ve oda odak noktaları (RoomFocus).
import * as THREE from 'three';
import { rbox, at, decal, canvasTex, roundRect, disposeTree, registerInspectable, ROOMS, DOORS, PARTITION_Z, PARTITION_XS, LOUNGE_FURNITURE, WORLD, WALK_COLOR, walkwayRects } from '../../core';
import type { RoomId } from '../../core';
import { sofa } from './furniture';
import { t, onLanguageChange } from '../../core/i18n';
import { buildLibraryStation, buildTestStation } from './stations';
import { buildLibrarian } from './librarian';
import { buildSecurityBot } from './security';

const T = 0.12, H_BASE = 0.5, H_TOP = 2.1, RAIL = 0.08;
const FRAME = 0xf6e6d0;
const glassMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });

/** x ekseni boyunca uzanan (z sabit) ya da z ekseni boyunca uzanan (x sabit) bölme parçası */
function partition(parent: THREE.Group, axis: 'x' | 'z', fixed: number, a: number, b: number, endPosts: [boolean, boolean]): void {
  const len = b - a, mid = (a + b) / 2;
  const place = function (o: THREE.Object3D, along: number, y: number): void {
    if (axis === 'x') o.position.set(along, y, fixed); else o.position.set(fixed, y, along);
  };
  const dims = function (l: number, h: number, t: number): [number, number, number] { return axis === 'x' ? [l, h, t] : [t, h, l]; };
  const d0 = dims(len, H_BASE, T); const base = rbox(d0[0], d0[1], d0[2], FRAME, 0.03); place(base, mid, H_BASE / 2); parent.add(base);
  const d1 = dims(len, RAIL, T); const rail = rbox(d1[0], d1[1], d1[2], FRAME, 0.03); place(rail, mid, H_TOP + RAIL / 2); parent.add(rail);
  const gd = dims(len, H_TOP - H_BASE, 0.04);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(gd[0], gd[1], gd[2]), glassMat); place(glass, mid, (H_BASE + H_TOP) / 2); glass.renderOrder = 3; parent.add(glass);
  [a, b].forEach(function (end, i) {
    if (!endPosts[i]) return;
    const off = (i === 0 ? -1 : 1) * 0.07; // parça ucunun hemen dışında (iç içe girmeden)
    const pd = dims(0.14, H_TOP + RAIL, 0.14); const post = rbox(pd[0], pd[1], pd[2], FRAME, 0.03); place(post, end + off, (H_TOP + RAIL) / 2); parent.add(post);
  });
}

const SIGN_ACCENT: Record<string, string> = { lounge: '#a78bfa', library: '#f59e0b', war: '#2dd4bf', testlab: '#6fe3a0', server: '#38bdf8' };
const SIGN_W = 1.0, SIGN_H = SIGN_W * 140 / 512;

function drawSign(ctx: CanvasRenderingContext2D, w: number, h: number, id: string): void {
  const accent = SIGN_ACCENT[id] || '#a78bfa';
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 6, 6, w - 12, h - 12, 30); ctx.fillStyle = '#fff7ea'; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = accent; ctx.stroke();
  const title = t('rooms.' + id + '.sign'), tag = t('rooms.' + id + '.tag');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#3a2d4a';
  let size = 62; ctx.font = '900 ' + size + 'px "Nunito",sans-serif';
  while (size > 28 && ctx.measureText(title).width > w - 70) { size -= 2; ctx.font = '900 ' + size + 'px "Nunito",sans-serif'; }
  ctx.fillText(title, w / 2, h * 0.37);
  ctx.font = '800 25px "Nunito",sans-serif';
  const tw = Math.min(w - 80, ctx.measureText(tag).width + 40);
  roundRect(ctx, (w - tw) / 2, h * 0.62, tw, 38, 19); ctx.fillStyle = accent; ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = '#4a3a55'; ctx.fillText(tag, w / 2, h * 0.62 + 20);
}

export interface RoomsApi {
  /** zemin uzadıkça yürüme halılarını (orta omurga, şeritler) yeni ön kenara kadar uzatır */
  setWalkwayExtra(extra: number): void;
  /** oda çekmecesindeki metriği canlı hesaplayan fonksiyon bağlar */
  setMetric(room: RoomId, fn: () => string): void;
}

export function buildRooms(scene: THREE.Scene): RoomsApi {
  const g = new THREE.Group(); scene.add(g);
  const z0 = WORLD.backZ, zF = PARTITION_Z;

  // ---- bölmeler ----
  // ön bölme (z = -6.5): kapı boşlukları arasında dört parça
  const xs: number[] = [WORLD.x0 + 0.08]; // sol duvarın süpürgeliğine (0.08) değer, içine girmez
  DOORS.forEach(function (d) { xs.push(d.x - d.width / 2, d.x + d.width / 2); });
  xs.push(WORLD.x1 - 0.14);
  for (let i = 0; i < xs.length; i += 2) {
    const a = xs[i], b = xs[i + 1];
    partition(g, 'x', zF, a, b, [i !== 0, true]);
  }
  // Door lintels
  DOORS.forEach(function (d) {
    const inner = d.width - 0.28;
    g.add(at(rbox(inner, RAIL, 0.14, FRAME, 0.03), d.x, H_TOP + RAIL / 2, zF)); // kapı üstü hizalı lintel
  });
  // yan bölmeler (x = ±2.7): arka duvardan ön bölmenin arka yüzüne
  PARTITION_XS.forEach(function (x) { partition(g, 'z', x, z0 + 0.08, zF - T / 2, [false, false]); }); // arka süpürgelik (0.08) hizası

  // ---- oda zemin kaplamaları (hacimsiz; tıklanınca oda odağı) ----
  const C = ROOMS.corridor;
  const mid = function (r: { x0: number; x1: number; z0: number; z1: number }): [number, number, number, number] {
    return [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, r.z1 - r.z0];
  };
  const tiles: { id: RoomId; color: number; accent: number }[] = [
    { id: 'lounge', color: 0xece4f7, accent: 0xa78bfa }, { id: 'library', color: 0xf4ecdc, accent: 0xf59e0b }, { id: 'war', color: 0xdcf1ee, accent: 0x2dd4bf },
    { id: 'testlab', color: 0xe3f4ea, accent: 0x6fe3a0 }, { id: 'server', color: 0xd9e1f2, accent: 0x38bdf8 }
  ];
  const metrics: Partial<Record<RoomId, () => string>> = {};
  const roomInfo: Record<string, { name: string; role: string; metric: string }> = {};
  tiles.forEach(function (tl) {
    roomInfo[tl.id] = { name: t('rooms.' + tl.id + '.name'), role: t('rooms.' + tl.id + '.role'), metric: t('rooms.' + tl.id + '.metric', { free: 6, total: 6, resting: 0, count: 0 }) };
  });
  tiles.forEach(function (t) {
    const r = ROOMS[t.id], m = mid(r);
    const floor = decal(m[2] - 0.1, m[3] - 0.1, 0.2, t.color, 1); floor.position.x = m[0]; floor.position.z = m[1]; g.add(floor);
    registerInspectable({
      id: 'room:' + t.id, kind: 'room', title: roomInfo[t.id].name, subtitle: roomInfo[t.id].role, color: t.accent, object: floor,
      focusOffset: new THREE.Vector3(0, 0.9, 0), radius: Math.min(m[2], m[3]) * 0.45, zoom: 1.3,
      agents: [{ id: 'room:' + t.id, name: roomInfo[t.id].name, role: roomInfo[t.id].role }],
      metric: function () { const f = metrics[t.id]; return f ? f() : roomInfo[t.id].metric; }, placeholder: 'Oda notu veya filtre...'
    });
  });
  const cm = mid(C);
  const cor = decal(cm[2] - 0.2, cm[3] - 0.1, 0.1, WALK_COLOR, 1); cor.position.x = cm[0]; cor.position.z = cm[1]; g.add(cor);

  // ---- lounge ----
  const rug = decal(3.6, 3.6, 0.9, 0xcdb8f0, 2); rug.position.x = -9.1; rug.position.z = -9.7; g.add(rug);
  const rugL = decal(3.4, 3.4, 0.5, 0xf1d9a8, 2); rugL.position.x = -4.56; rugL.position.z = -9.7; g.add(rugL);   // kütüphane halısı
  const rugT = decal(3.4, 3.4, 0.5, 0xbfe8cc, 2); rugT.position.x = 4.56; rugT.position.z = -9.7; g.add(rugT);    // laboratuvar zemin kaplaması
  LOUNGE_FURNITURE.forEach(function (f) {
    g.add(sofa(f, f.kind === 'sofa' ? 0x7aa9d9 : 0xe58fa6, f.kind === 'sofa' ? 0xffe2b8 : 0xfff0d9));
  });
  const lamp = new THREE.PointLight(0xffd29a, 0.8, 8, 2); lamp.position.set(-9.1, 2.3, -9.7); g.add(lamp);

  buildLibraryStation(g); buildTestStation(g); buildLibrarian(g); buildSecurityBot(g);

  // ---- yürüme halıları: omurga zeminle birlikte uzar ----
  let walk: THREE.Group | null = null;
  function buildWalkways(extra: number): void {
    if (walk) { g.remove(walk); disposeTree(walk); }
    walk = new THREE.Group(); walk.name = 'walkways';
    walkwayRects(extra).forEach(function (r) {
      const m = decal(r.w, r.d, 0.3, WALK_COLOR, r.layer); m.position.x = r.x; m.position.z = r.z; m.userData.walk = r.id; walk!.add(m);
    });
    g.add(walk);
  }
  buildWalkways(0);

  // ---- kapı tabelaları: kapının sağ üstünde, cam bölmeye yaslı; dil değişince yeniden çizilir ----
  const signZ = zF + 0.04; // çerçeve arka yüzü cam ön yüzünde (zF + 0.02 + 0.02), ön yüzü süpürgelik/korkuluk hizasında (zF + T / 2)
  DOORS.forEach(function (d) {
    const x = d.x + d.width / 2 + 0.06 + SIGN_W / 2; // kapı direğinin hemen sağı
    const frame = rbox(SIGN_W, SIGN_H, 0.04, 0x2e243b, 0.019); frame.position.set(x, 1.88, signZ); g.add(frame);
    const tex = canvasTex(512, 140, function (c, w, h) { drawSign(c, w, h, d.room); });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(SIGN_W - 0.06, (SIGN_W - 0.06) * 140 / 512), new THREE.MeshBasicMaterial({ map: tex }));
    plate.position.set(x, 1.88, signZ + 0.0205); plate.userData.sign = d.room; g.add(plate);
    onLanguageChange(function () { drawSign(tex.userData.ctx, 512, 140, d.room); tex.needsUpdate = true; });
  });

  return {
    setMetric: function (room, fn) { metrics[room] = fn; },
    setWalkwayExtra: function (extra) { buildWalkways(extra); }
  };
}
