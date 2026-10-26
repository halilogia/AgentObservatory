// Faaliyet istasyonları (çalışma alanının arka şeridi): araştırma/kütüphane masası ve test istasyonu.
// Robot, faaliyetine göre buraya yürür (core/world-layout: station:library, station:test). Parçalar birbirine yaslanır.
import * as THREE from 'three';
import { rbox, slab, cyl, sphere, at, mesh, onTick, canvasTex, STATION_LIBRARY, STATION_TEST } from '../../core';
import { monitor, mug } from '../../shared';

function benchGroup(x: number, z: number, unit: string): THREE.Group {
  const g = new THREE.Group(); g.userData.unit = unit; g.position.set(x, 0, z);
  g.add(at(slab(2.2, 0.1, 0.8, 0xfff1dc, 0.18), 0, 0.85, 0));            // tabla 0.80 .. 0.90
  [-1, 1].forEach(function (s) { g.add(at(rbox(0.1, 0.8, 0.7, 0xe8c9a0, 0.04), s * 0.95, 0.4, 0)); }); // bacaklar tabla altına kadar
  return g;
}

const OBSIDIAN = 0x7c3aed;
const BACK_WALL_Z = -13;

/** kitaplık: gövde arka duvara yaslı (z = merkez), kitap sırtları gövdenin ön yüzüne yaslı; genişliğe göre sırt sayısı değişir */
function shelfUnit(g: THREE.Group, cx: number, w: number, zc: number): void {
  const cols = [0xff7eb6, 0x4fd8ff, 0xffc65a, 0xa66bff, 0x6fcf8f, 0xff8a65];
  g.add(at(rbox(w, 1.7, 0.25, 0xc98d5b, 0.03), cx, 0.85, zc));
  const n = Math.max(2, Math.round((w - 0.4) / 0.3) + 1), x0 = cx - (n - 1) * 0.15;
  for (let r = 0; r < 3; r++) for (let i = 0; i < n; i++) {
    g.add(at(rbox(0.2, 0.36, 0.04, cols[(i + r) % cols.length], 0.01), x0 + i * 0.3, 0.3 + r * 0.5 + 0.18, zc + 0.145));
  }
}

/** Obsidian bilgi ağı (Graph View): mor ve camgöbeği düğümler, bağlantı çizgileri; yavaşça süzülür */
function drawVaultGraph(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  ctx.fillStyle = '#140a2b'; ctx.fillRect(0, 0, w, h);
  const N = 16, pts: [number, number, boolean][] = [];
  for (let i = 0; i < N; i++) {
    const a = i * 2.399 + 0.6, r = 0.18 + ((i * 37) % 100) / 100 * 0.62;
    pts.push([w / 2 + Math.cos(a + Math.sin(t * 0.25 + i) * 0.12) * r * w * 0.5, h / 2 + 8 + Math.sin(a * 1.3 + Math.cos(t * 0.3 + i * 1.7) * 0.12) * r * h * 0.42, i % 3 !== 0]);
  }
  ctx.lineWidth = 1.5;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
    if (d < w * 0.26) { ctx.strokeStyle = 'rgba(167,139,250,' + (0.55 - d / (w * 0.26) * 0.4).toFixed(2) + ')'; ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke(); }
  }
  pts.forEach(function (p, i) {
    const col = p[2] ? '#7c3aed' : '#22d3ee', rad = 6 + (i % 4) * 2.5 + Math.sin(t * 1.6 + i) * 0.8;
    const g = ctx.createRadialGradient(p[0], p[1], 1, p[0], p[1], rad * 2.6);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(124,58,237,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], rad * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0], p[1], rad * 0.7, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = '#c4b5fd'; ctx.font = '800 20px "Nunito",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('OBSIDIAN VAULT', 16, 12);
  ctx.fillStyle = '#67e8f9'; ctx.font = '700 13px "Nunito",sans-serif'; ctx.fillText('Graph View · 16 notes', 16, 36);
}

/** açık markdown araştırma belgesi: tabla üstüne yatan sayfa dokusu */
function drawMarkdownNote(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#fffdf7'; ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#6d28d9'; ctx.font = '800 22px "Cascadia Mono",Consolas,monospace'; ctx.fillText('# Research Note', 14, 24);
  const lines: [string, string][] = [['- [[Agent Memory]]', '#0e7490'], ['- [[MCP Tools]]', '#0e7490'], ['> sources: 12', '#64748b'], ['- [ ] verify claims', '#334155'], ['- [x] link vault', '#334155']];
  lines.forEach(function (l, i) { ctx.fillStyle = l[1]; ctx.font = '600 16px "Cascadia Mono",Consolas,monospace'; ctx.fillText(l[0], 14, 56 + i * 24); });
}

/** kütüphane (Obsidian bilgi kasası): arka duvarda bilgi ağı panosu, kitaplıklar, açık markdown belgesi ve kasa kristali; masanın arkasında kütüphaneci durur */
export function buildLibraryStation(parent: THREE.Object3D): void {
  const g = benchGroup(STATION_LIBRARY.x, STATION_LIBRARY.z, 'station');
  const zc = BACK_WALL_Z + 0.23 - STATION_LIBRARY.z; // arka duvara yaslı kitaplık merkezi (yerel z): gövde -12.895 .. -12.645
  shelfUnit(g, 0, 2.2, zc); shelfUnit(g, -1.65, 0.9, zc); shelfUnit(g, 1.65, 0.9, zc);
  g.add(at(rbox(0.5, 0.05, 0.36, 0x4fd8ff, 0.02), -0.4, 0.925, 0.05));    // kitap yığını
  g.add(at(rbox(0.46, 0.05, 0.34, 0xff7eb6, 0.02), -0.4, 0.975, 0.05));
  const note = at(rbox(0.5, 0.02, 0.36, 0xffffff, 0.01), 0.25, 0.91, 0.1); g.add(note);   // açık markdown belgesi (0.90 .. 0.92)
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.32), new THREE.MeshBasicMaterial({ map: canvasTex(256, 180, function (c, w, h) { drawMarkdownNote(c, w, h); }) }));
  sheet.rotation.x = -Math.PI / 2; sheet.position.set(0.25, 0.9215, 0.1); g.add(sheet);
  const lamp = new THREE.Group(); lamp.position.set(0.85, 0.9, -0.15); g.add(lamp);
  lamp.add(at(cyl(0.1, 0.12, 0.03, 0x555a70, 12), 0, 0.015, 0));
  lamp.add(at(cyl(0.012, 0.012, 0.34, 0x555a70, 6), 0, 0.2, 0));
  lamp.add(at(sphere(0.07, 0xfff0c2, 10, { emissive: 0xffd88a, emissiveIntensity: 1 }), 0, 0.41, 0));
  const m = mug(0xa66bff); m.position.set(0.55, 0.9, 0.2); g.add(m);
  // Obsidian kristali: kaide üstünde dönen mor sekizyüzlü
  g.add(at(cyl(0.09, 0.11, 0.05, 0x2b2d42, 14), -0.9, 0.925, 0.15));
  const gem = mesh(new THREE.OctahedronGeometry(0.11), OBSIDIAN, { emissive: OBSIDIAN, emissiveIntensity: 0.9, unique: true }, true);
  gem.scale.y = 1.4; gem.position.set(-0.9, 0.95 + 0.11 * 1.4, 0.15); g.add(gem);
  onTick(function (t) { gem.rotation.y = t * 0.9; });
  parent.add(g);

  // arka duvarda Obsidian bilgi ağı panosu (duvar iç yüzü z = -13'e yaslı)
  const px = STATION_LIBRARY.x, panel = new THREE.Group(); panel.position.set(px, 2.75, BACK_WALL_Z + 0.03); parent.add(panel);
  panel.add(rbox(2.3, 1.4, 0.06, 0x2e243b, 0.03));
  const tex = canvasTex(512, 300, function (c, w, h) { drawVaultGraph(c, w, h, 0); });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.18, 1.28), new THREE.MeshBasicMaterial({ map: tex }));
  board.position.z = 0.0305; panel.add(board);
  let acc = 0;
  onTick(function (t, dt) { acc += dt; if (acc < 0.1) return; acc = 0; drawVaultGraph(tex.userData.ctx, 512, 300, t); tex.needsUpdate = true; });
}

/** test istasyonu: iki ilerleme ekranı, deney şişesi ışığı */
export function buildTestStation(parent: THREE.Object3D): void {
  const g = benchGroup(STATION_TEST.x, STATION_TEST.z, 'station');
  const bars = canvasTex(128, 96, function (c) {
    c.fillStyle = '#10131f'; c.fillRect(0, 0, 128, 96);
    [0.9, 0.65, 1, 0.4].forEach(function (p, i) { c.fillStyle = i === 3 ? '#ffc65a' : '#6fe3a0'; c.fillRect(10, 14 + i * 20, 108 * p, 10); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(10 + 108 * p, 14 + i * 20, 108 * (1 - p), 10); });
  });
  const pass = canvasTex(128, 96, function (c) {
    c.fillStyle = '#0d3a22'; c.fillRect(0, 0, 128, 96); c.strokeStyle = '#6fe3a0'; c.lineWidth = 8; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(38, 48); c.lineTo(58, 68); c.lineTo(92, 28); c.stroke();
  });
  const a = monitor(0.9, 0.6, bars, 0xfff7ea); a.position.set(-0.5, 0.9, -0.05); g.add(a);
  const b = monitor(0.9, 0.6, pass, 0xfff7ea); b.position.set(0.55, 0.9, -0.05); g.add(b);
  g.add(at(cyl(0.12, 0.12, 0.04, 0x555a70, 14), 0.95, 0.92, 0.2));        // şişe tabanı 0.90 .. 0.94
  g.add(at(cyl(0.07, 0.11, 0.2, 0x9fe0ff, 14, { transparent: true, opacity: 0.7 }), 0.95, 1.04, 0.2));
  g.add(at(sphere(0.045, 0x6fe3a0, 10, { emissive: 0x6fe3a0, emissiveIntensity: 1.2 }), 0.95, 1.2, 0.2));
  parent.add(g);
}
