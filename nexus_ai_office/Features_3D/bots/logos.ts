// Robot göğüs logoları: her model ailesi için canvas ile çizilen yuvarlak köşeli firma plakası. Emoji yok; tümü vektör çizim.
import * as THREE from 'three';
import { canvasTex, roundRect } from '../../core';
import type { ModelId } from '../../core';

export type LogoKind = 'claude' | 'antigravity' | 'openai' | 'gemini' | 'nexus' | 'gravityguard';

/** model kimliğinden logo ailesi: codex ve chatgpt aynı OpenAI amblemini taşır, tanımsızlar Nexus 'N' alır */
export function logoKindOf(model?: ModelId): LogoKind {
  switch (model) {
    case 'claude': return 'claude';
    case 'antigravity': return 'antigravity';
    case 'codex': case 'chatgpt': return 'openai';
    case 'gemini': return 'gemini';
    case 'gravityguard': return 'gravityguard';
    default: return 'nexus';
  }
}

const S = 256, C = S / 2;

function plate(ctx: CanvasRenderingContext2D, fill: string, border?: string): void {
  roundRect(ctx, 8, 8, S - 16, S - 16, 54); ctx.fillStyle = fill; ctx.fill();
  if (border) { ctx.lineWidth = 6; ctx.strokeStyle = border; ctx.stroke(); }
}

function drawClaude(ctx: CanvasRenderingContext2D): void {
  plate(ctx, '#d97757');
  ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineCap = 'round'; ctx.lineWidth = 19;
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, r0 = 26, r1 = i % 2 ? 78 : 92;
    ctx.beginPath(); ctx.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0); ctx.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(C, C, 20, 0, Math.PI * 2); ctx.fill();
}

function drawAntigravity(ctx: CanvasRenderingContext2D): void {
  plate(ctx, '#ffffff', '#e2e8f0');
  // alttan üste mavi, camgöbeği, yeşil, sarı, turuncu, tepede kırmızı
  const g = ctx.createLinearGradient(0, 200, 0, 52);
  [[0, '#4285f4'], [0.22, '#22d3ee'], [0.45, '#34a853'], [0.65, '#fbbc05'], [0.82, '#f97316'], [1, '#ea4335']].forEach(function (s) { g.addColorStop(s[0] as number, s[1] as string); });
  ctx.strokeStyle = g; ctx.lineWidth = 32; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(56, 194);
  ctx.bezierCurveTo(98, 194, 106, 66, 128, 66);
  ctx.bezierCurveTo(150, 66, 158, 194, 200, 194);
  ctx.stroke();
}

function drawOpenAI(ctx: CanvasRenderingContext2D): void {
  plate(ctx, '#10a37f');
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.save(); ctx.translate(C, C);
  for (let i = 0; i < 6; i++) {
    ctx.save(); ctx.rotate(i * Math.PI / 3);
    roundRect(ctx, -23, -92, 46, 104, 23); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawGemini(ctx: CanvasRenderingContext2D): void {
  plate(ctx, '#f8fafc', '#e2e8f0');
  const g = ctx.createLinearGradient(48, 48, 208, 208);
  g.addColorStop(0, '#4285f4'); g.addColorStop(0.5, '#9b72cb'); g.addColorStop(1, '#d96570');
  ctx.fillStyle = g;
  const r = 84;
  ctx.beginPath(); ctx.moveTo(C, C - r);
  ctx.quadraticCurveTo(C, C, C + r, C); ctx.quadraticCurveTo(C, C, C, C + r);
  ctx.quadraticCurveTo(C, C, C - r, C); ctx.quadraticCurveTo(C, C, C, C - r);
  ctx.fill();
}

function drawNexus(ctx: CanvasRenderingContext2D): void {
  plate(ctx, '#2e1065');
  const g = ctx.createLinearGradient(80, 60, 176, 196);
  g.addColorStop(0, '#c084fc'); g.addColorStop(1, '#22d3ee');
  ctx.strokeStyle = g; ctx.lineWidth = 24; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.moveTo(84, 188); ctx.lineTo(84, 68); ctx.lineTo(172, 188); ctx.lineTo(172, 68); ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawGravityGuard(ctx: CanvasRenderingContext2D): void {
  plate(ctx, '#0f172a', '#38bdf8');
  // Gradient kalkan
  const g = ctx.createLinearGradient(C, 46, C, 212);
  g.addColorStop(0, '#f59e0b');
  g.addColorStop(0.5, '#06b6d4');
  g.addColorStop(1, '#3b82f6');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(C, 46);
  ctx.lineTo(C + 66, 76);
  ctx.lineTo(C + 56, 150);
  ctx.quadraticCurveTo(C + 40, 196, C, 212);
  ctx.quadraticCurveTo(C - 40, 196, C - 56, 150);
  ctx.lineTo(C - 66, 76);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Kalkan içi kilit ve güvenlik sembolü
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(C, 116, 22, -Math.PI / 4, Math.PI * 1.15, true);
  ctx.lineTo(C + 14, 116);
  ctx.lineTo(C - 4, 116);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(C, 152, 7, 0, Math.PI * 2);
  ctx.fill();
}

const DRAW: Record<LogoKind, (ctx: CanvasRenderingContext2D) => void> = {
  claude: drawClaude, antigravity: drawAntigravity, openai: drawOpenAI, gemini: drawGemini, nexus: drawNexus, gravityguard: drawGravityGuard
};
const canvases = new Map<LogoKind, HTMLCanvasElement>();

/** göğüs plakası: gövdenin düz ön yüzüne (z = 0.2) 4 mm önde duran, hacimsiz logo yüzeyi */
export function chestLogo(model?: ModelId): THREE.Mesh {
  const kind = logoKindOf(model);
  let cv = canvases.get(kind);
  if (!cv && typeof document !== 'undefined') { cv = canvasTex(S, S, function (ctx) { DRAW[kind](ctx); }).image as HTMLCanvasElement; canvases.set(kind, cv); }
  // doku robota özgü: robot sökülürken disposeTree dokuyu bırakır, ortak çizim tuvali paylaşılır
  const tex = cv ? new THREE.CanvasTexture(cv) : new THREE.Texture();
  tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.position.set(0, 0.56, 0.204); m.userData.logo = kind;
  return m;
}
