import * as THREE from 'three';
import { rbox, slab, cyl, at, canvasTex, onTick } from '../core/kit';
import { makeSubnauticaPod } from './subnautica-pod';
import { makeBot, Bot } from '../bot/model';
import { createAnimator, BotAnimator } from '../bot/animator';

const ACCENT_CYAN = 0x0284c7;
const ACCENT_GLOW = 0x38bdf8;

function codingMonitor(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  g.add(at(rbox(w, h, 0.05, 0x475569, 0.04), 0, h / 2, 0));
  g.add(at(cyl(0.04, 0.04, 0.35, 0x94a3b8, 8), 0, 0.175, 0));
  g.add(at(slab(0.4, 0.02, 0.25, 0x64748b, 0.04), 0, 0.01, 0));

  const tex = canvasTex(256, 160, (ctx, cw, ch) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, cw, ch);
    ctx.font = '600 13px "Cascadia Mono",monospace';
    const lines = [
      ['// SUBNAUTICA OS v2.0', '#38bdf8'],
      ['base.initModules(4);', '#4ade80'],
      ['tubes.connectPressurized();', '#f59e0b'],
      ['depth: 1m · O2: 100%', '#22d3ee'],
      ['status: ALL SYSTEMS ONLINE', '#38bdf8']
    ];
    lines.forEach((l, i) => {
      ctx.fillStyle = l[1];
      ctx.fillText(l[0], 12, 28 + i * 24);
    });
  });

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.08, h - 0.08),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  screen.position.set(0, h / 2, 0.03);
  g.add(screen);

  return g;
}

function serverRack(h = 2.4): THREE.Group {
  const g = new THREE.Group();
  g.add(at(rbox(0.9, h, 0.8, 0x334155, 0.06), 0, h / 2, 0));
  const door = at(rbox(0.78, h - 0.2, 0.04, 0x64748b, 0.02), 0, h / 2, 0.42);
  g.add(door);

  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const y = 0.3 + r * 0.25;
    const strip = at(rbox(0.68, 0.05, 0.02, ACCENT_GLOW, 0.01, { emissive: ACCENT_GLOW, emissiveIntensity: 1.2, unique: true }), 0, y, 0.445);
    g.add(strip);
    onTick((t) => {
      const active = Math.sin(t * 5 + r * 1.5) > 0.2;
      (strip.material as THREE.MeshStandardMaterial).emissiveIntensity = active ? 1.6 : 0.4;
    });
  }
  return g;
}

export function buildWorkRoom(parent: THREE.Object3D, cx = -18, cz = 0): { group: THREE.Group; bots: { bot: Bot; anim: BotAnimator }[] } {
  const g = new THREE.Group();
  g.userData.unit = 'room-work';
  g.position.set(cx, 0, cz);

  // 1. Subnautica Pod (Multi-Purpose Room) - Head of the corridor (openEast to tube)
  const pod = makeSubnauticaPod({
    radius: 4.2,
    height: 3.4,
    accentColor: ACCENT_CYAN,
    roomNumber: '01',
    roomTitle: 'ÇALIŞMA ODASI',
    openEast: true,  // Connects to Tube 1 ➜ Room 2
    openWest: false, // Start of corridor
    hasSolar: true
  });
  g.add(pod);

  const glow = { emissive: ACCENT_GLOW, emissiveIntensity: 1.4 };

  // 2. Interior Workstations
  // Main Dual Workstation Bench (Facing slightly towards center)
  const desk = at(slab(3.6, 0.1, 1.3, 0x334155, 0.08), 0, 0.75, -1.8);
  g.add(desk);
  [-1.5, 1.5].forEach((lx) => {
    g.add(at(rbox(0.1, 0.75, 1.1, 0x64748b, 0.04), lx, 0.375, -1.8));
  });

  // Monitors
  [-1.0, 1.0].forEach((mx) => {
    const monL = codingMonitor(0.9, 0.6);
    monL.position.set(mx - 0.32, 0.8, -2.0);
    monL.rotation.y = 0.2;
    g.add(monL);

    const monR = codingMonitor(0.9, 0.6);
    monR.position.set(mx + 0.32, 0.8, -2.0);
    monR.rotation.y = -0.2;
    g.add(monR);

    // Glowing Keyboards
    const kb = at(rbox(0.44, 0.02, 0.16, 0x1e293b, 0.02, glow), mx, 0.81, -1.5);
    g.add(kb);
  });

  // Server Racks in North-West Corner
  const rack1 = serverRack(2.4);
  rack1.position.set(-2.2, 0, -2.0);
  rack1.rotation.y = 0.6;
  g.add(rack1);

  // 3. Robotic Workers in Room 1
  const bot1 = makeBot({ body: 0x0284c7, accent: 0x38bdf8, name: 'DevBot Alpha' });
  bot1.group.position.set(-1.0, 0.45, -1.1);
  g.add(bot1.group);
  const anim1 = createAnimator(bot1, 'coding');

  const bot2 = makeBot({ body: 0x0369a1, accent: 0x7dd3fc, name: 'DevBot Beta' });
  bot2.group.position.set(1.0, 0.45, -1.1);
  g.add(bot2.group);
  const anim2 = createAnimator(bot2, 'coding');

  parent.add(g);
  return { group: g, bots: [{ bot: bot1, anim: anim1 }, { bot: bot2, anim: anim2 }] };
}
