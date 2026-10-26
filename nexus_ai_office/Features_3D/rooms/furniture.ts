// Lounge mobilyaları: kanepe/koltuk (oturak sayısına göre), sehpa. Parçalar birbirine yaslanır, iç içe girmez.
import * as THREE from 'three';
import { rbox, cyl, at, cushionWidth, SOFA_ARM_W } from '../../core';
import type { SeatFurniture } from '../../core';
import { mug } from '../../shared';

const D = 0.95; // derinlik

/**
 * Model yerel +z'ye bakar. Katmanlar: taban (0..0.30) · minderler (0.30..0.46) · sırtlık (arka, kolçaklar arasında) · kolçaklar.
 * Oturak noktası: (x_i, 0.22, 0.14) — bot orijini; kalça minder üstüne (0.46) oturur.
 */
export function sofa(f: SeatFurniture, frame: number, cushion: number): THREE.Group {
  const g = new THREE.Group(); g.userData.unit = 'sofa';
  const W = f.w, cw = cushionWidth(f);
  g.add(at(rbox(W, 0.3, D, frame, 0.06), 0, 0.15, 0));
  for (let i = 0; i < f.seats; i++) {
    g.add(at(rbox(cw, 0.16, 0.7, cushion, 0.08), (i - (f.seats - 1) / 2) * (cw + 0.04), 0.38, 0.125));
  }
  g.add(at(rbox(W - 2 * SOFA_ARM_W, 0.62, 0.25, frame, 0.08), 0, 0.61, -0.35));
  [-1, 1].forEach(function (s) { g.add(at(rbox(SOFA_ARM_W, 0.4, D, frame, 0.06), s * (W / 2 - SOFA_ARM_W / 2), 0.5, 0)); });
  g.position.set(f.x, 0, f.z); g.rotation.y = f.ry;
  return g;
}

/** yuvarlak sehpa: ayak (0..0.37) üstüne tabla (0.37..0.43) oturur */
export function coffeeTable(x: number, z: number): THREE.Group {
  const g = new THREE.Group(); g.userData.unit = 'table';
  g.add(at(cyl(0.09, 0.09, 0.37, 0x6b4a33, 12), 0, 0.185, 0));
  g.add(at(cyl(0.45, 0.45, 0.06, 0xe8c9a0, 24), 0, 0.4, 0));
  const m = mug(0xff7eb6); m.position.set(0.18, 0.43, 0.08); g.add(m);
  g.add(at(rbox(0.3, 0.04, 0.22, 0x4fd8ff, 0.02), -0.12, 0.45, -0.1)); // kitap
  g.position.set(x, 0, z);
  return g;
}
