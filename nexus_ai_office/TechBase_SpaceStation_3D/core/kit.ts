import * as THREE from 'three';

THREE.ColorManagement.legacyMode = false;

export type ColorInput = number | string;
export type MatOpts = THREE.MeshStandardMaterialParameters & { unique?: boolean };
export type Updater = (t: number, dt: number) => void;
export type StdMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

export const updaters: Updater[] = [];

export function onTick(fn: Updater): void {
  updaters.push(fn);
}

const cache: Record<string, THREE.MeshStandardMaterial> = {};

export function mat(color: ColorInput, o?: MatOpts | null): THREE.MeshStandardMaterial {
  const opts: MatOpts = o || {};
  const props: MatOpts = Object.assign({ color: color, roughness: 0.45, metalness: 0.15 }, opts);
  delete props.unique;
  if (opts.unique) return new THREE.MeshStandardMaterial(props);
  const key = String(color) + JSON.stringify(opts);
  if (!cache[key]) {
    cache[key] = new THREE.MeshStandardMaterial(props);
  }
  return cache[key];
}

export function basic(color: ColorInput, o?: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial(Object.assign({ color: color }, o || {}));
}

export function mesh(geo: THREE.BufferGeometry, color: ColorInput | THREE.Material, mo?: MatOpts | null, noShadow?: boolean): StdMesh {
  const m = new THREE.Mesh(geo, typeof color === 'object' && 'isMaterial' in color ? color : mat(color as ColorInput, mo));
  m.castShadow = !noShadow;
  m.receiveShadow = true;
  return m;
}

export function at<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number): T {
  obj.position.set(x, y, z);
  return obj;
}

function roundedShape(w: number, h: number, rr: number): THREE.Shape {
  const x = -w / 2, y = -h / 2, P = Math.PI;
  const s = new THREE.Shape();
  s.moveTo(x + rr, y); s.lineTo(x + w - rr, y);
  s.absarc(x + w - rr, y + rr, rr, -P / 2, 0, false); s.lineTo(x + w, y + h - rr);
  s.absarc(x + w - rr, y + h - rr, rr, 0, P / 2, false); s.lineTo(x + rr, y + h);
  s.absarc(x + rr, y + h - rr, rr, P / 2, P, false); s.lineTo(x, y + rr);
  s.absarc(x + rr, y + rr, rr, P, P * 1.5, false);
  return s;
}

export function rboxGeo(w: number, h: number, d: number, r: number): THREE.ExtrudeGeometry {
  const b = Math.min(0.03, d / 4, Math.min(w, h) / 4);
  const iw = Math.max(w - 2 * b, 0.01), ih = Math.max(h - 2 * b, 0.01), id = Math.max(d - 2 * b, 0.001);
  const rr = Math.max(Math.min(r - b, iw / 2 - 0.001, ih / 2 - 0.001), 0.001);
  const g = new THREE.ExtrudeGeometry(roundedShape(iw, ih, rr), {
    depth: id, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 4
  });
  g.translate(0, 0, -id / 2);
  return g;
}

export function rbox(w: number, h: number, d: number, color: ColorInput, r?: number, mo?: MatOpts | null): StdMesh {
  return mesh(rboxGeo(w, h, d, r !== undefined ? r : 0.04), color, mo);
}

export function cyl(rt: number, rb: number, h: number, color: ColorInput, segs?: number, mo?: MatOpts | null): StdMesh {
  const g = new THREE.CylinderGeometry(rt, rb, h, segs || 16);
  return mesh(g, color, mo);
}

export function sphere(r: number, color: ColorInput, segs?: number, mo?: MatOpts | null): StdMesh {
  const g = new THREE.SphereGeometry(r, segs || 16, segs || 12);
  return mesh(g, color, mo);
}

export function slab(w: number, h: number, d: number, color: ColorInput, r?: number, mo?: MatOpts | null): StdMesh {
  return rbox(w, h, d, color, r || 0.05, mo);
}

export function capsule(r: number, h: number, color: ColorInput, segs?: number, mo?: MatOpts | null): StdMesh {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, h - 2 * r), segs || 8, segs || 12);
  return mesh(g, color, mo);
}

export function decal(w: number, d: number, r: number, color: ColorInput, layer: number, mo?: MatOpts | null): StdMesh {
  const g = new THREE.ShapeGeometry(roundedShape(w, d, Math.max(0.001, Math.min(r, w / 2 - 0.001, d / 2 - 0.001))), 6);
  g.rotateX(-Math.PI / 2);
  const m = mesh(g, mat(color, Object.assign({ polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer, unique: true }, mo || {})), null, true);
  m.position.y = 0.005 * layer;
  m.renderOrder = layer;
  return m;
}

export function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.userData = { canvas: cv, ctx: ctx };
  return tex;
}
