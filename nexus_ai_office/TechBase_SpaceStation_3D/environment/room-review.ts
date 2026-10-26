import * as THREE from 'three';
import { rbox, slab, cyl, at, mesh, canvasTex, onTick } from '../core/kit';
import { makeSubnauticaPod } from './subnautica-pod';
import { makeBot, Bot } from '../bot/model';
import { createAnimator, BotAnimator } from '../bot/animator';

const ACCENT_PURPLE = 0x7c3aed;
const ACCENT_GLOW = 0xa855f7;

function drawVaultGraph(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);
  const N = 18;
  const pts: [number, number, boolean][] = [];

  for (let i = 0; i < N; i++) {
    const a = i * 2.399 + 0.6;
    const r = 0.16 + ((i * 37) % 100) / 100 * 0.64;
    pts.push([
      w / 2 + Math.cos(a) * r * w * 0.48,
      h / 2 + 8 + Math.sin(a * 1.3) * r * h * 0.42,
      i % 3 !== 0
    ]);
  }

  // Draw Connections
  ctx.lineWidth = 1.6;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < w * 0.28) {
        ctx.strokeStyle = `rgba(168, 85, 247, ${(0.6 - (d / (w * 0.28)) * 0.45).toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[j][0], pts[j][1]);
        ctx.stroke();
      }
    }
  }

  // Draw Glowing Nodes
  pts.forEach((p, i) => {
    const col = p[2] ? '#a855f7' : '#38bdf8';
    const rad = 6 + (i % 4) * 2.5;
    const g = ctx.createRadialGradient(p[0], p[1], 1, p[0], p[1], rad * 2.5);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(168, 85, 247, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p[0], p[1], rad * 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(p[0], p[1], rad * 0.7, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 22px "Segoe UI",sans-serif';
  ctx.fillText('CODE REVIEW ARCHITECTURE', 18, 28);
  ctx.fillStyle = '#c084fc';
  ctx.font = '700 13px "Segoe UI",sans-serif';
  ctx.fillText('Sub-Sea Module Topology · Fully Verified', 18, 54);
}

export function buildReviewRoom(parent: THREE.Object3D, cx = 11.0, cz = 0): { group: THREE.Group; bots: { bot: Bot; anim: BotAnimator }[] } {
  const g = new THREE.Group();
  g.userData.unit = 'room-review';
  g.position.set(cx, 0, cz);

  const glow = { emissive: ACCENT_GLOW, emissiveIntensity: 1.4 };

  // 1. Subnautica Pod (Multi-Purpose Room) - Open West (from Room 2) & Open East (to Room 4)
  const pod = makeSubnauticaPod({
    radius: 4.2,
    height: 3.4,
    accentColor: ACCENT_PURPLE,
    roomNumber: '03',
    roomTitle: 'İNCELEME ODASI',
    openWest: true, // Tube 2 from Room 2
    openEast: true, // Tube 3 to Room 4
    hasSolar: false
  });
  g.add(pod);

  // 2. Wall-Mounted Static Graph Screen
  const graphTex = canvasTex(512, 320, (c, w, h) => drawVaultGraph(c, w, h));
  const graphMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.9), new THREE.MeshBasicMaterial({ map: graphTex }));
  graphMesh.position.set(0, 1.9, -2.6);
  g.add(graphMesh);

  // Frame around graph
  g.add(at(rbox(3.4, 2.1, 0.06, 0x475569, 0.04), 0, 1.9, -2.64));

  // 3. Central Crystal Pedestal
  const pedestal = at(cyl(0.35, 0.45, 0.85, 0x64748b, 16), 0, 0.425, -0.6);
  g.add(pedestal);
  g.add(at(cyl(0.38, 0.38, 0.06, ACCENT_PURPLE, 16, glow), 0, 0.88, -0.6));

  // Floating Rotating Crystal Gem (0 PointLight)
  const gem = mesh(new THREE.OctahedronGeometry(0.24), ACCENT_GLOW, { emissive: ACCENT_GLOW, emissiveIntensity: 1.8, unique: true }, true);
  gem.scale.y = 1.35;
  gem.position.set(0, 1.25, -0.6);
  g.add(gem);

  onTick((t) => {
    gem.rotation.y = t * 1.2;
    gem.position.y = 1.25 + Math.sin(t * 2) * 0.06;
  });

  // 4. Review Table with Holographic Dossier
  const reviewTable = at(slab(2.6, 0.08, 1.1, 0x475569, 0.06), 0, 0.75, 1.5);
  g.add(reviewTable);
  [-1.1, 1.1].forEach((tx) => {
    g.add(at(rbox(0.1, 0.75, 0.9, 0x64748b, 0.04), tx, 0.375, 1.5));
  });

  const dossier = at(rbox(0.6, 0.03, 0.4, 0x38bdf8, 0.02, { emissive: 0x38bdf8, emissiveIntensity: 1.4 }), 0, 0.81, 1.5);
  g.add(dossier);

  // 5. Reviewer Robots in Room 3
  const bot1 = makeBot({ body: 0xa855f7, accent: 0xc084fc, name: 'Lead Reviewer' });
  bot1.group.position.set(-1.3, 0, -0.6);
  bot1.group.rotation.y = 0.5;
  g.add(bot1.group);
  const anim1 = createAnimator(bot1, 'reasoning');

  const bot2 = makeBot({ body: 0x7c3aed, accent: 0x38bdf8, name: 'Audit Bot' });
  bot2.group.position.set(0, 0, 0.6);
  bot2.group.rotation.y = Math.PI;
  g.add(bot2.group);
  const anim2 = createAnimator(bot2, 'reading');

  parent.add(g);
  return { group: g, bots: [{ bot: bot1, anim: anim1 }, { bot: bot2, anim: anim2 }] };
}
