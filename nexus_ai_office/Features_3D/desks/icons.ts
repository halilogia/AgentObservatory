// Proje masası hologram ikonları. Her ikon bir proje türünü simgeler (Project = adacık, ikon = türü).
import * as THREE from 'three';
import { rbox, at } from '../../core';
import type { IconKind } from '../../core';

export interface Icon { obj: THREE.Group; tick: (t: number) => void }
export type IconFactory = (c: number) => Icon;

export const holo = function (color: number, opacity: number, extra?: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial(Object.assign({ color: color, transparent: true, opacity: opacity, depthWrite: false }, extra || {}));
};

function globeIcon(c: number): Icon {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), holo(c, 0.32)));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.345, 14, 10), holo(c, 0.8, { wireframe: true })));
  [[0.5, 1.0, 0.3], [-1.3, 0.2, 0.9], [2.2, -0.5, 0.5], [0.0, -1.0, 0.4]].forEach(function (a) { // kıtalar
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 + a[2] * 0.05, 0), holo(0x7dffb0, 0.9));
    const lat = a[0], lon = a[1] * 2;
    m.position.set(Math.cos(lat) * Math.sin(lon) * 0.34, Math.sin(lat) * 0.34, Math.cos(lat) * Math.cos(lon) * 0.34);
    m.scale.set(1, 0.4, 1); m.lookAt(m.position.clone().multiplyScalar(2)); g.add(m);
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.012, 6, 48), holo(c, 0.9)); ring.rotation.x = 1.15; g.add(ring);
  const sat = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), holo(0xffffff, 1)); ring.add(sat);
  return { obj: g, tick: function (t) { sat.position.set(Math.cos(t * 2) * 0.5, Math.sin(t * 2) * 0.5, 0); } };
}
function phoneIcon(c: number): Icon {
  const g = new THREE.Group();
  const body = rbox(0.4, 0.7, 0.07, c, 0.08, { transparent: true, opacity: 0.55, emissive: c, emissiveIntensity: 0.7 }); body.castShadow = false; g.add(body);
  g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.58), holo(0xffffff, 0.35)), 0, 0, 0.045));
  const cols = [0xff7eb6, 0xffc65a, 0x6fe3a0, 0x4fd8ff, 0xa66bff, 0xff8a65];
  cols.forEach(function (col, i) {
    const t = rbox(0.085, 0.085, 0.012, col, 0.025, { emissive: col, emissiveIntensity: 0.9 }); t.castShadow = false;
    t.position.set(-0.09 + (i % 3) * 0.09, 0.17 - Math.floor(i / 3) * 0.1, 0.05); g.add(t);
  });
  g.add(at(rbox(0.28, 0.07, 0.012, 0xffffff, 0.03, { emissive: 0xffffff, emissiveIntensity: 0.8 }), 0, -0.15, 0.05));
  g.add(at(rbox(0.12, 0.02, 0.012, 0xffffff, 0.01, { emissive: 0xffffff, emissiveIntensity: 0.8 }), 0, 0.31, 0.05));
  return { obj: g, tick: function (t) { g.rotation.z = Math.sin(t * 1.4) * 0.08; } };
}
function docIcon(c: number): Icon {
  const g = new THREE.Group();
  const page = function (dx: number, dz: number, rz: number, op: number): THREE.Group {
    const p = new THREE.Group();
    const b = rbox(0.5, 0.66, 0.03, 0xffffff, 0.04, { transparent: true, opacity: op, emissive: c, emissiveIntensity: 0.45 }); b.castShadow = false; p.add(b);
    p.position.set(dx, 0, dz); p.rotation.z = rz; g.add(p); return p;
  };
  page(0.1, -0.06, -0.16, 0.5); page(-0.05, -0.03, 0.08, 0.6);
  const front = page(0, 0, 0, 0.85);
  front.add(at(rbox(0.3, 0.05, 0.02, c, 0.02, { emissive: c, emissiveIntensity: 1 }), -0.05, 0.2, 0.025));
  for (let i = 0; i < 4; i++) front.add(at(rbox(0.36 - (i === 3 ? 0.14 : 0), 0.025, 0.015, 0x8d93ad, 0.01, { emissive: 0x8d93ad, emissiveIntensity: 0.5 }), i === 3 ? -0.07 : 0, 0.08 - i * 0.075, 0.025));
  front.add(at(rbox(0.07, 0.17, 0.02, 0xff5d8f, 0.02, { emissive: 0xff5d8f, emissiveIntensity: 0.7 }), 0.17, 0.27, 0.025));
  return { obj: g, tick: function (t) { g.rotation.x = Math.sin(t * 1.2) * 0.07; } };
}


function bookIcon(c: number): Icon {
  const g = new THREE.Group();
  const page = function (sx: number): void {
    const cover = rbox(0.4, 0.03, 0.54, c, 0.04, { transparent: true, opacity: 0.7, emissive: c, emissiveIntensity: 0.8 }); cover.castShadow = false;
    const p = rbox(0.36, 0.03, 0.5, 0xffffff, 0.03, { transparent: true, opacity: 0.85, emissive: c, emissiveIntensity: 0.35 }); p.castShadow = false;
    const half = new THREE.Group(); cover.position.y = -0.035; half.add(cover); half.add(p);
    for (let i = 0; i < 4; i++) half.add(at(rbox(0.24, 0.012, 0.025, 0x8d93ad, 0.01, { emissive: 0x8d93ad, emissiveIntensity: 0.5 }), 0, 0.022, -0.16 + i * 0.1));
    half.position.set(sx * 0.2, 0, 0); half.rotation.z = -sx * 0.2; g.add(half);
  };
  page(-1); page(1);
  g.rotation.x = 0.35;
  return { obj: g, tick: function (t) { g.rotation.x = 0.35 + Math.sin(t * 1.3) * 0.06; } };
}

function gamepadIcon(c: number): Icon {
  const g = new THREE.Group();
  const body = rbox(0.74, 0.2, 0.4, c, 0.14, { transparent: true, opacity: 0.6, emissive: c, emissiveIntensity: 0.75 }); body.castShadow = false; g.add(body);
  const glow = { emissive: 0xffffff, emissiveIntensity: 0.9 };
  g.add(at(rbox(0.15, 0.03, 0.045, 0xffffff, 0.01, glow), -0.2, 0.115, 0));
  g.add(at(rbox(0.045, 0.03, 0.15, 0xffffff, 0.01, glow), -0.2, 0.115, 0));
  ([[0.2, 0.06, 0xff7eb6], [0.28, 0, 0xffc65a], [0.2, -0.06, 0x6fe3a0], [0.12, 0, 0x4fd8ff]] as [number, number, number][]).forEach(function (b) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: b[2] })); s.position.set(b[0], 0.11, b[1]); g.add(s);
  });
  g.rotation.x = 0.3;
  return { obj: g, tick: function (t) { g.rotation.z = Math.sin(t * 1.5) * 0.1; } };
}

function heartIcon(c: number): Icon {
  const s = new THREE.Shape();
  s.moveTo(0, -0.3);
  s.bezierCurveTo(-0.42, -0.02, -0.38, 0.3, -0.16, 0.3);
  s.bezierCurveTo(-0.06, 0.3, 0, 0.22, 0, 0.16);
  s.bezierCurveTo(0, 0.22, 0.06, 0.3, 0.16, 0.3);
  s.bezierCurveTo(0.38, 0.3, 0.42, -0.02, 0, -0.3);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 14 });
  geo.translate(0, 0, -0.05);
  const heart = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, transparent: true, opacity: 0.8, roughness: 0.3 }));
  const g = new THREE.Group(); g.add(heart);
  return { obj: g, tick: function (t) { const k = 1 + Math.max(0, Math.sin(t * 4)) * 0.12 * Math.max(0, Math.sin(t * 2)); g.scale.setScalar(k); } };
}

function cubeIcon(c: number): Icon {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), holo(c, 0.3)));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), holo(c, 0.9, { wireframe: true })));
  return { obj: g, tick: function (t) { g.rotation.x = t * 0.7; g.rotation.z = t * 0.4; } };
}

export const ICONS: Record<IconKind, IconFactory> = {
  globe: globeIcon, phone: phoneIcon, doc: docIcon, book: bookIcon, gamepad: gamepadIcon, heart: heartIcon, cube: cubeIcon
};
