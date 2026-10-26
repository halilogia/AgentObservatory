// Çekirdek: malzeme önbelleği, yuvarlatılmış kutu, tuval dokuları. Mantık yok, yalnızca görsel yardımcılar.
import * as THREE from 'three';

THREE.ColorManagement.legacyMode = false; // hex renkler sRGB olarak yorumlansın

export type ColorInput = number | string;
export type MatOpts = THREE.MeshStandardMaterialParameters & { unique?: boolean };
export type Updater = (t: number, dt: number) => void;
export type StdMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

/** Her kare çağrılan (t, dt) animasyon fonksiyonları */
export const updaters: Updater[] = [];

/** Bir masa/proje gibi sökülebilir yapının animasyon ve kaynaklarını toplar; dispose() hepsini temizler. */
export interface Scope { disposers: (() => void)[]; dispose: () => void }
let currentScope: Scope | null = null;
export function beginScope(): Scope {
  const sc: Scope = { disposers: [], dispose: function () { sc.disposers.splice(0).forEach(function (f) { f(); }); } };
  currentScope = sc; return sc;
}
export function endScope(): void { currentScope = null; }
/** her kare çağrılacak fonksiyonu kaydeder; aktif scope varsa onunla birlikte kaldırılır */
export function onTick(fn: Updater): void {
  updaters.push(fn);
  if (currentScope) currentScope.disposers.push(function () { const i = updaters.indexOf(fn); if (i >= 0) updaters.splice(i, 1); });
}
export function onDispose(fn: () => void): void { if (currentScope) currentScope.disposers.push(fn); }

// deterministik rastgele (her açılışta aynı ofis)
let seed = 7;
export function rand(): number {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const cache: Record<string, THREE.MeshStandardMaterial> = {};
const shared = new Set<THREE.Material>();
export function mat(color: ColorInput, o?: MatOpts | null): THREE.MeshStandardMaterial {
  const opts: MatOpts = o || {};
  const props: MatOpts = Object.assign({ color: color, roughness: 0.8, metalness: 0 }, opts);
  delete props.unique;
  if (opts.unique) return new THREE.MeshStandardMaterial(props);
  const key = color + JSON.stringify(opts);
  if (!cache[key]) { cache[key] = new THREE.MeshStandardMaterial(props); shared.add(cache[key]); }
  return cache[key];
}

export function basic(color: ColorInput, o?: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial(Object.assign({ color: color }, o || {}));
}

export function mesh(geo: THREE.BufferGeometry, color: ColorInput | THREE.Material, mo?: MatOpts | null, noShadow?: boolean): StdMesh {
  const m: StdMesh = new THREE.Mesh(geo, typeof color === 'object' && color.isMaterial ? color : mat(color as ColorInput, mo));
  m.castShadow = !noShadow; m.receiveShadow = true;
  return m;
}

/** x-y düzleminde, merkezli, yuvarlatılmış dikdörtgen konturu */
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

// XY düzleminde yuvarlatılmış köşeli, kenarları pahlı kutu geometrisi
function rboxGeo(w: number, h: number, d: number, r: number): THREE.ExtrudeGeometry {
  const b = Math.min(0.03, d / 4, Math.min(w, h) / 4);
  const iw = Math.max(w - 2 * b, 0.01), ih = Math.max(h - 2 * b, 0.01), id = Math.max(d - 2 * b, 0.001);
  const rr = Math.max(Math.min(r - b, iw / 2 - 0.001, ih / 2 - 0.001), 0.001);
  const g = new THREE.ExtrudeGeometry(roundedShape(iw, ih, rr), { depth: id, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 5 });
  g.translate(0, 0, -id / 2);
  return g;
}

/**
 * Hacimsiz zemin kaplaması (halı, ışık şeridi): kalınlığı olmadığı için hiçbir mobilyayla iç içe geçemez.
 * layer: üst üste binen kaplamaların sırası (polygonOffset ile z-fighting önlenir).
 */
export function decal(w: number, d: number, r: number, color: ColorInput, layer: number, mo?: MatOpts | null): StdMesh {
  const g = new THREE.ShapeGeometry(roundedShape(w, d, Math.max(0.001, Math.min(r, w / 2 - 0.001, d / 2 - 0.001))), 6);
  g.rotateX(-Math.PI / 2);
  const m = mesh(g, mat(color, Object.assign({ polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer, unique: true }, mo || {})), null, true);
  m.position.y = 0.004 * layer; m.renderOrder = layer;
  return m;
}

/** geometri ve (paylaşılmayan) malzeme/dokuları serbest bırakır */
export function disposeTree(obj: THREE.Object3D): void {
  obj.traverse(function (o) {
    const m = o as THREE.Mesh;
    if (m.geometry && !(o as THREE.Sprite).isSprite) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    mats.forEach(function (x) {
      if (shared.has(x)) return;
      const t = (x as THREE.MeshBasicMaterial).map; if (t) t.dispose();
      x.dispose();
    });
  });
}

export function rbox(w: number, h: number, d: number, color: ColorInput, r?: number, mo?: MatOpts | null): StdMesh {
  return mesh(rboxGeo(w, h, d, r === undefined ? 0.06 : r), color, mo);
}
/** yatay levha: köşeler üstten bakınca yuvarlak (masa tablası, halı) */
export function slab(w: number, h: number, d: number, color: ColorInput, r?: number, mo?: MatOpts | null): StdMesh {
  const g = rboxGeo(w, d, h, r === undefined ? 0.15 : r);
  g.rotateX(-Math.PI / 2);
  return mesh(g, color, mo);
}
export function cyl(rt: number, rb: number, h: number, color: ColorInput, seg?: number, mo?: MatOpts | null): StdMesh {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 16), color, mo);
}
export function sphere(r: number, color: ColorInput, seg?: number, mo?: MatOpts | null): StdMesh {
  return mesh(new THREE.SphereGeometry(r, seg || 16, Math.max(6, (seg || 16) / 2)), color, mo);
}
export function capsule(r: number, len: number, color: ColorInput, mo?: MatOpts | null): StdMesh {
  return mesh(new THREE.CapsuleGeometry(r, len, 4, 10), color, mo);
}
export function at<T extends THREE.Object3D>(obj: T, x?: number, y?: number, z?: number): T {
  obj.position.set(x || 0, y || 0, z || 0); return obj;
}

export interface CanvasTexData { ctx: CanvasRenderingContext2D; w: number; h: number }
export type CanvasTex = THREE.CanvasTexture & { userData: CanvasTexData };

export function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): CanvasTex {
  if (typeof document === 'undefined') {
    const t = new THREE.Texture();
    t.userData = { ctx: {} as CanvasRenderingContext2D, w: w, h: h };
    return t as unknown as CanvasTex;
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!; draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  t.userData = { ctx: ctx, w: w, h: h };
  return t as CanvasTex;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** havada duran yazı etiketi */
export function label(text: string, color: string, width?: number): THREE.Sprite {
  const tex = canvasTex(512, 128, function (ctx, w, h) {
    roundRect(ctx, 6, 10, w - 12, h - 28, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = color; ctx.stroke();
    ctx.fillStyle = '#4a3a55'; ctx.font = '800 50px "Nunito","Segoe UI",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2 - 6);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const wd = width || 2; s.scale.set(wd, wd / 4, 1);
  return s;
}

// masalar üstündeki ekranlar için akan "kod" dokusu
interface CodeScreen { tex: CanvasTex; offset: number; draw: (t: number) => void }
const screens: CodeScreen[] = [];
export function codeScreen(hex: number): CanvasTex {
  const css = '#' + new THREE.Color(hex).getHexString();
  const rows: [number, number, boolean][] = [];
  for (let i = 0; i < 14; i++) rows.push([Math.floor(rand() * 3) * 6, 12 + rand() * 50, rand() < 0.3]);
  const tex = canvasTex(128, 96, function () {});
  const scr: CodeScreen = {
    tex: tex, offset: rand() * 10,
    draw: function (t) {
      const c = tex.userData.ctx;
      c.fillStyle = '#1d2033'; c.fillRect(0, 0, 128, 96);
      c.fillStyle = css; c.globalAlpha = 0.9; c.fillRect(0, 0, 128, 9); c.globalAlpha = 1;
      const sh = Math.floor((t + scr.offset) * 1.6);
      for (let i = 0; i < 9; i++) {
        const r = rows[(i + sh) % rows.length];
        c.fillStyle = r[2] ? css : '#9aa3d6'; c.globalAlpha = r[2] ? 1 : 0.75;
        c.fillRect(8 + r[0], 17 + i * 8.5, r[1], 4);
      }
      c.globalAlpha = 1; tex.needsUpdate = true;
    }
  };
  scr.draw(0); screens.push(scr);
  onDispose(function () { const i = screens.indexOf(scr); if (i >= 0) screens.splice(i, 1); });
  return tex;
}
let acc = 0;
onTick(function (t, dt) {
  acc += dt; if (acc < 0.22) return; acc = 0;
  for (let i = 0; i < screens.length; i++) screens[i].draw(t);
});
