import * as THREE from 'three';
import { rbox, slab, cyl, sphere, at, mesh, canvasTex, onTick } from '../core/kit';
import { makeSubnauticaPod } from './subnautica-pod';
import { makeBot, Bot } from '../bot/model';
import { createAnimator, BotAnimator } from '../bot/animator';

const ACCENT_AMBER = 0xd97706;
const ACCENT_GLOW = 0xf59e0b;

function testCapsule(): THREE.Group {
  const g = new THREE.Group();

  // Metal Base & Top Cap (Clean Titanium / White Tech)
  g.add(at(cyl(1.1, 1.2, 0.4, 0x64748b, 20), 0, 0.2, 0));
  g.add(at(cyl(1.0, 1.0, 0.08, ACCENT_GLOW, 20, { emissive: ACCENT_GLOW, emissiveIntensity: 1.4 }), 0, 0.44, 0));

  g.add(at(cyl(1.1, 1.1, 0.35, 0x64748b, 20), 0, 2.8, 0));
  g.add(at(cyl(1.0, 1.0, 0.08, ACCENT_GLOW, 20, { emissive: ACCENT_GLOW, emissiveIntensity: 1.4 }), 0, 2.6, 0));

  // Transparent Chamber Glass
  const glassGeo = new THREE.CylinderGeometry(0.9, 0.9, 2.1, 24);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffedd5,
    transparent: true,
    opacity: 0.32,
    roughness: 0.1,
    metalness: 0.1
  });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.y = 1.55;
  g.add(glass);

  // Internal Energy Core Pillar (0 PointLight for 60 FPS)
  const core = at(cyl(0.2, 0.2, 1.9, ACCENT_GLOW, 12, { emissive: ACCENT_GLOW, emissiveIntensity: 1.8, unique: true }), 0, 1.55, 0);
  g.add(core);

  // Rotating Plasma Rings
  const ring1 = mesh(new THREE.TorusGeometry(0.5, 0.035, 8, 20), 0xfbbf24, { emissive: 0xfbbf24, emissiveIntensity: 2.2, unique: true }, true);
  ring1.position.y = 1.3;
  g.add(ring1);

  const ring2 = mesh(new THREE.TorusGeometry(0.65, 0.035, 8, 20), ACCENT_GLOW, { emissive: ACCENT_GLOW, emissiveIntensity: 2.2, unique: true }, true);
  ring2.position.y = 1.8;
  g.add(ring2);

  onTick((t) => {
    ring1.rotation.x = t * 2.5;
    ring1.rotation.y = t * 1.8;
    ring2.rotation.x = -t * 2.0;
    ring2.rotation.z = t * 1.5;
    const pulse = 1.2 + Math.sin(t * 6) * 0.4;
    (core.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse * 1.8;
  });

  return g;
}

function testOscilloscope(w = 1.4, h = 0.9): THREE.Group {
  const g = new THREE.Group();
  g.add(at(rbox(w, h, 0.6, 0x475569, 0.05), 0, h / 2, 0));

  const tex = canvasTex(256, 160, (ctx, cw, ch) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
    ctx.lineWidth = 1;
    for (let x = 0; x < cw; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
    }
    for (let y = 0; y < ch; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
    }
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x < cw; x++) {
      const y = ch / 2 + Math.sin(x * 0.08) * 35;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#4ade80';
    ctx.font = '700 13px sans-serif';
    ctx.fillText('STATUS: SUB-SEA EXPERIMENT PASS', 12, 22);
  });

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.16, h - 0.16),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  screen.position.set(0, h / 2, 0.31);
  g.add(screen);

  return g;
}

export function buildTestRoom(parent: THREE.Object3D, cx = -5.0, cz = 0): { group: THREE.Group; bots: { bot: Bot; anim: BotAnimator }[] } {
  const g = new THREE.Group();
  g.userData.unit = 'room-test';
  g.position.set(cx, 0, cz);

  // 1. Subnautica Pod (Multi-Purpose Room) - Open on both West and East
  const pod = makeSubnauticaPod({
    radius: 4.2,
    height: 3.4,
    accentColor: ACCENT_AMBER,
    roomNumber: '02',
    roomTitle: 'DENEY & TEST LAB',
    openWest: true, // Tube 1 from Room 1
    openEast: true, // Tube 2 to Room 3
    hasSolar: false
  });
  g.add(pod);

  // 2. Central Testing Capsule
  const capsule = testCapsule();
  capsule.position.set(0, 0, -0.2);
  g.add(capsule);

  // 3. Lab Testing Bench with Oscilloscope
  const bench = at(slab(3.2, 0.1, 1.1, 0x475569, 0.06), 0, 0.8, -2.4);
  g.add(bench);
  [-1.4, 1.4].forEach((bx) => {
    g.add(at(rbox(0.1, 0.8, 0.9, 0x64748b, 0.04), bx, 0.4, -2.4));
  });

  const scope = testOscilloscope(1.3, 0.8);
  scope.position.set(-0.7, 0.85, -2.4);
  g.add(scope);

  // Test chemical flasks
  [0.5, 0.9].forEach((fx, i) => {
    const col = i === 0 ? 0x06b6d4 : 0x10b981;
    const flask = at(cyl(0.08, 0.12, 0.32, col, 12, { emissive: col, emissiveIntensity: 1.4 }), fx, 1.01, -2.4);
    g.add(flask);
  });

  // 4. Robotic Experimenters in Room 2
  const bot1 = makeBot({ body: 0xf59e0b, accent: 0xfbbf24, name: 'TestBot Lead' });
  bot1.group.position.set(-0.7, 0, -1.4);
  g.add(bot1.group);
  const anim1 = createAnimator(bot1, 'testing');

  const bot2 = makeBot({ body: 0xd97706, accent: 0x38bdf8, name: 'AnalyzerBot' });
  bot2.group.position.set(1.6, 0, -0.2);
  bot2.group.rotation.y = -Math.PI / 2;
  g.add(bot2.group);
  const anim2 = createAnimator(bot2, 'reasoning');

  parent.add(g);
  return { group: g, bots: [{ bot: bot1, anim: anim1 }, { bot: bot2, anim: anim2 }] };
}
