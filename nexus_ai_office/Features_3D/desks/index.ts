// Dinamik proje masaları: OfficeRegistry olaylarına göre masa + ajan botları spawn / söküm animasyonuyla eklenir.
import * as THREE from 'three';
import {
  rbox, cyl, at, slab, decal, mesh, codeScreen, label, onTick, beginScope, endScope, disposeTree,
  registerInspectable, unregisterInspectable, projectSignal, inspectables, OfficeRegistry, getDeskSeats
} from '../../core';
import type { ProjectSpec, Slot, Scope } from '../../core';
import { chair, monitor, mug, steam, cactus } from '../../shared';
import { holo, ICONS } from './icons';

const MANAGER_POINT = { x: 0, z: -5.4 }; // koridor merkezi: akış şeritleri buradan masalara iner
const SPAWN_MS = 950, DESPAWN_MS = 600, STAGGER_MS = 380;

/** proje rengine uyumlu zemin halısı (ucuz pastel) */
function rugColor(c: number): number { return new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.78).getHex(); }

/** masa yere indiğinde / sökülmeden önce ajan sistemine verilen bilgi */
export interface DeskInfo { spec: ProjectSpec; slot: Slot; screens: THREE.MeshBasicMaterial[] }
export interface DeskHooks {
  /** masa yere indi: ajanlar (bağımsız robotlar) oluşturulabilir */
  landed(info: DeskInfo): void;
  changed(info: DeskInfo): void;
  /** masa sökülecek: robotlar kaldırılır, bitince done() çağrılır */
  removing(info: DeskInfo, done: () => void): void;
}

interface Desk { id: string; root: THREE.Group; body: THREE.Group; scope: Scope; bodyScope: Scope; info: DeskInfo; landed: boolean }
const desks = new Map<string, Desk>();

// ---- basit animasyon yürütücüsü (spawn / despawn) ----
interface Anim { t0: number; dur: number; step: (p: number) => void; done?: () => void }
const anims: Anim[] = [];
function animate(delayMs: number, dur: number, step: (p: number) => void, done?: () => void): void {
  anims.push({ t0: performance.now() + delayMs, dur: dur, step: step, done: done });
}
onTick(function () {
  const now = performance.now();
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i]; if (now < a.t0) continue;
    const p = Math.min(1, (now - a.t0) / a.dur); a.step(p);
    if (p >= 1) { anims.splice(i, 1); if (a.done) a.done(); }
  }
});
const outBack = function (p: number): number { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
const outCubic = function (p: number): number { return 1 - Math.pow(1 - p, 3); };

function buildDeskBody(spec: ProjectSpec, body: THREE.Group): THREE.MeshBasicMaterial[] {
  const c = spec.color;
  const screens: THREE.MeshBasicMaterial[] = [];
  const agentCount = Math.max(1, spec.agents.length);
  const k = Math.max(1, Math.ceil(agentCount / 2));
  // Dinamik masa: hem sağa (+X) hem aşağı yönde (+Z) büyür
  const w = k === 1 ? 2.9 : k * 1.45 + 1.2;
  const rugW = w + 1.2;
  const depthExtra = 0; // koltuklar masanın iki uzun kenarında durur: derinlik büyürse tabla koltuklarla iç içe geçer, bu yüzden yalnızca genişlik artar
  const depth = 1.55 + depthExtra;
  const zCenter = depthExtra * 0.5; // aşağıya doğru uzama merkezi
  const rugD = 3.4 + depthExtra * 1.2;
  const rugZ = zCenter;

  // zemin kaplamaları (hacimsiz): hem yana hem aşağıya doğru genişleyen halı
  body.add(at(decal(rugW, rugD, 0.9, rugColor(c), 1), 0, 0, rugZ));

  // masa: tabla alt yüzü 0.78'de, bacaklar tam 0.78'e kadar, derinlik aşağıya doğru genişler
  body.add(at(slab(w, 0.12, depth, 0xfff1dc, 0.25), 0, 0.84, zCenter));
  const legX = w / 2 - 0.15;
  const legD = depth - 0.25;
  [-1, 1].forEach(function (s) {
    body.add(at(rbox(0.12, 0.78, legD, 0xe8c9a0, 0.04), s * legX, 0.39, zCenter));
  });
  // ön ve arka yüze yaslı LED neon şeritler
  body.add(at(rbox(w - 0.6, 0.06, 0.02, c, 0.01, { emissive: c, emissiveIntensity: 0.35 }), 0, 0.84, zCenter - depth / 2 + 0.01));
  body.add(at(rbox(w - 0.6, 0.06, 0.02, c, 0.01, { emissive: c, emissiveIntensity: 0.35 }), 0, 0.84, zCenter + depth / 2 - 0.01));

  // K >= 2 ise aşağı yönde modüler çekmece/ekipman dolapları ve orta ayaklar
  if (k >= 2) {
    for (let b = 1; b < k; b++) {
      const bx = (b - k / 2) * 1.45;
      body.add(at(rbox(0.10, 0.78, legD * 0.88, 0xe8c9a0, 0.04), bx, 0.39, zCenter));
    }
    // Aşağı yönde genişleyen yan kabin / çekmece blokları
    [-1, 1].forEach(function (s) {
      body.add(at(rbox(0.36, 0.72, 0.45 + depthExtra * 0.3, 0x241d3b, 0.03), s * (w / 2 - 0.45), 0.36, zCenter + depth / 4));
    });
  }

  // hologram yayıcı (tablanın üstünde, halka tabanın üstünde, merkez zCenter'da)
  body.add(at(cyl(0.36, 0.42, 0.06, 0x555a70, 24), 0, 0.93, zCenter));
  const ringE = mesh(new THREE.TorusGeometry(0.34, 0.02, 6, 32), c, { emissive: c, emissiveIntensity: 1.2, unique: true }, true);
  ringE.rotation.x = Math.PI / 2; ringE.position.set(0, 0.985, zCenter); body.add(ringE);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.55, 24, 1, true), holo(c, 0.14, { side: THREE.DoubleSide }));
  beam.position.set(0, 1.26, zCenter); body.add(beam);
  const icon = ICONS[spec.icon](c);
  const iconBase = new THREE.Group(); iconBase.userData.unit = 'icon'; iconBase.position.set(0, 1.7, zCenter); iconBase.scale.setScalar(1.3); iconBase.add(icon.obj); body.add(iconBase);
  const lbl = label(spec.name, '#' + new THREE.Color(c).getHexString(), 2.1); lbl.position.set(0, 3.3, zCenter); body.add(lbl);
  const ph = (spec.id.length * 1.7) % 6;
  onTick(function (t) {
    iconBase.rotation.y = t * 0.8 + ph; iconBase.position.y = 1.7 + Math.sin(t * 1.6 + ph) * 0.07;
    (ringE.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + Math.sin(t * 3 + ph) * 0.35;
    // zayıf sinyal: bağlantısı kopan ajanı olan masada hologram kesintili görünür
    const sig = projectSignal.get(spec.id);
    const weak = sig !== undefined && sig < 1;
    beam.material.opacity = (0.12 + Math.sin(t * 2 + ph) * 0.03) * (weak ? 0.35 : 1);
    iconBase.visible = !weak || Math.sin(t * 31 + ph) > -0.35 + 0.0 * t && Math.sin(t * 5 + ph) > -0.6;
    icon.tick(t);
  });

  // masa üstü: hepsi tabla yüzeyinde (y = 0.9)
  const seats = getDeskSeats(spec.agents.length);
  spec.agents.forEach(function (_a, i) {
    const st = seats[i];
    const monZ = st.sz < 0 ? -0.32 : (0.32 + depthExtra * 0.7);
    const m = monitor(0.95, 0.6, codeScreen(c));
    m.position.set(st.sx, 0.9, monZ);
    m.rotation.y = st.ry;
    body.add(m);
    screens.push(m.userData.screen as THREE.MeshBasicMaterial);
  });

  const mg = mug(0xffffff); mg.position.set(0.4, 0.9, 0.5 + depthExtra * 0.5); body.add(mg); steam(mg, 0.14);
  const bk = rbox(0.34, 0.05, 0.25, c, 0.03); bk.position.set(-w / 2 + 0.35, 0.925, -0.45); bk.rotation.y = 0.4; body.add(bk);
  const kct = cactus(); kct.position.set(w / 2 - 0.35, 0.9, 0.55 + depthExtra * 0.5); body.add(kct);

  // koltuklar masaya aittir ve sabittir; robotlar bağımsız dünya nesneleridir (features/agents)
  seats.forEach(function (st) {
    const ch = chair(c); ch.position.set(st.sx, 0, st.sz); ch.rotation.y = st.ry; body.add(ch);
  });
  return screens;
}

/** manager'dan masaya akan ışık şeridi + noktalar (zemin kaplaması; hacimsiz) */
function buildFlow(root: THREE.Group, slot: Slot, color: number): THREE.Group {
  const g = new THREE.Group();
  const a = MANAGER_POINT, dir = slot.x < 0 ? 1 : -1, b = { x: slot.x + dir * 1.5, z: slot.z };
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), ang = Math.atan2(dx, dz);
  const strip = decal(0.1, len, 0.04, color, 4, { transparent: true, opacity: 0.4, emissive: color, emissiveIntensity: 0.4 });
  strip.rotation.y = ang; strip.position.x = (a.x + b.x) / 2; strip.position.z = (a.z + b.z) / 2; g.add(strip);
  // ışık noktaları da zemin kaplaması: botların/bitkilerin içinden geçen hacimli nesne olmaz
  const dots: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const d = decal(0.22, 0.22, 0.11, color, 5, { emissive: color, emissiveIntensity: 0.6 });
    g.add(d); dots.push(d);
  }
  onTick(function (t) {
    dots.forEach(function (d, i) {
      const p = (t * 0.18 + i / dots.length) % 1;
      d.position.x = a.x + dx * p; d.position.z = a.z + dz * p; d.scale.setScalar(0.7 + Math.sin(p * Math.PI) * 0.6);
    });
  });
  root.add(g); return g;
}

function spawnRing(root: THREE.Group, slot: Slot, color: number, delay: number): void {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(slot.x, 0.12, slot.z); root.add(ring);
  animate(delay, 900, function (p) {
    ring.scale.setScalar(0.5 + p * 2.6); (ring.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.7;
  }, function () { root.remove(ring); ring.geometry.dispose(); (ring.material as THREE.Material).dispose(); });
}

/** Registry'yi dinler: masaları ekler/söker. Dönüş: mevcut masa sayısı sorgusu. */
export function initDesks(scene: THREE.Scene, registry: OfficeRegistry, hooks: DeskHooks): void {
  let spawnIndex = 0; // aynı anda eklenen masalar sırayla belirir
  let lastAdd = 0;

  registry.on(function (e) {
    if (e.type === 'added') {
      const spec = e.project, slot = e.slot;
      const root = new THREE.Group(), body = new THREE.Group();
      root.add(body); body.position.set(slot.x, 0, slot.z); scene.add(root);
      const bodyScope = beginScope();
      const screens = buildDeskBody(spec, body);
      endScope();
      const scope = beginScope();
      const flow = buildFlow(root, slot, spec.color);
      endScope();
      const info: DeskInfo = { spec: spec, slot: slot, screens: screens };
      const desk: Desk = { id: spec.id, root: root, body: body, scope: scope, bodyScope, info: info, landed: false };
      desks.set(spec.id, desk);

      registerInspectable({
        id: spec.id, kind: 'project', projectId: spec.id, title: spec.name, subtitle: 'Proje masası', color: spec.color, object: body,
        focusOffset: new THREE.Vector3(0, 1.1, 0), radius: 2.3,
        agents: spec.agents.map(function (a, i) { return { id: a.id, name: a.name, role: a.role || (i === 0 ? 'Ana ajan' : 'Yardımcı ajan') }; })
      });

      // spawn: yukarıdan bırakılan, hafif sıçrayan masa; ardından halka dalgası
      const now = performance.now();
      if (now - lastAdd > 1500) spawnIndex = 0;
      lastAdd = now;
      const delay = spawnIndex++ * STAGGER_MS;
      body.visible = false; flow.visible = false; body.scale.setScalar(0.001);
      animate(delay, 1, function () { body.visible = true; }, function () { spawnRing(root, slot, spec.color, 0); });
      animate(delay, SPAWN_MS, function (p) {
        body.scale.setScalar(Math.max(0.001, outBack(p)));
        body.position.y = (1 - outCubic(p)) * 3.2;
      }, function () {
        body.position.y = 0; body.scale.setScalar(1); flow.visible = true;
        if (desks.get(spec.id) === desk) { desk.landed = true; hooks.landed(info); }
      });
    } else if (e.type === 'agent_added' || e.type === 'agent_removed') {
      const d = desks.get(e.project.id); if (!d) return;
      d.bodyScope.dispose(); disposeTree(d.body); d.body.clear();
      d.bodyScope = beginScope();
      d.info.screens = buildDeskBody(e.project, d.body);
      endScope();
      const target = inspectables.find(i => i.id === e.project.id);
      if (target) target.agents = e.project.agents.map(a => ({ id: a.id, name: a.name, role: a.role || a.model }));
      if (d.landed) hooks.changed(d.info);

      // Masa büyüme / küçülme animasyonu ve neon halka dalgası
      if (e.type === 'agent_added') {
        spawnRing(d.root, d.info.slot, e.project.color, 0);
        d.body.scale.set(0.85, 0.85, 0.85);
        animate(0, 420, function (p) {
          const s = 0.85 + outBack(p) * 0.15;
          d.body.scale.set(s, s, s);
        }, function () {
          d.body.scale.set(1, 1, 1);
        });
      } else {
        d.body.scale.set(1.12, 1.12, 1.12);
        animate(0, 320, function (p) {
          const s = 1.12 - p * 0.12;
          d.body.scale.set(s, s, s);
        }, function () {
          d.body.scale.set(1, 1, 1);
        });
      }
    } else if (e.type === 'removed') {
      const d = desks.get(e.project.id); if (!d) return;
      desks.delete(e.project.id);
      unregisterInspectable(e.project.id);
      d.root.children.forEach(function (c) { if (c !== d.body) c.visible = false; }); // akış şeridi hemen kapanır
      const shrink = function (): void {
        animate(0, DESPAWN_MS, function (p) {
          d.body.scale.setScalar(Math.max(0.001, 1 - p * p)); d.body.position.y = p * 0.9;
        }, function () {
          d.scope.dispose(); d.bodyScope.dispose(); scene.remove(d.root); disposeTree(d.root);
        });
      };
      if (d.landed) hooks.removing(d.info, shrink); else shrink(); // robotlar önce küçülüp kaybolur
    }
  });
}
