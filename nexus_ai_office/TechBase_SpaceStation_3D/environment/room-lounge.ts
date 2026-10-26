import * as THREE from 'three';
import { rbox, slab, cyl, sphere, at, onTick } from '../core/kit';
import { makeSubnauticaPod } from './subnautica-pod';
import { makeBot, Bot } from '../bot/model';
import { createAnimator, BotAnimator } from '../bot/animator';

const ACCENT_GREEN = 0x059669;
const ACCENT_GLOW = 0x10b981;

function sciFiSofa(w = 3.6, seats = 3): THREE.Group {
  const g = new THREE.Group();
  const D = 1.1;
  const frameColor = 0x334155;
  const cushionColor = 0x0d9488; // Vibrant Subnautica Teal

  g.add(at(rbox(w, 0.28, D, frameColor, 0.08), 0, 0.14, 0));

  const cw = (w - 0.4) / seats;
  for (let i = 0; i < seats; i++) {
    const cx = (i - (seats - 1) / 2) * cw;
    g.add(at(rbox(cw - 0.04, 0.18, 0.85, cushionColor, 0.08), cx, 0.36, 0.08));
  }

  g.add(at(rbox(w - 0.4, 0.65, 0.26, cushionColor, 0.1), 0, 0.65, -0.4));

  [-1, 1].forEach((s) => {
    g.add(at(rbox(0.2, 0.44, D, frameColor, 0.06), s * (w / 2 - 0.1), 0.42, 0));
  });

  return g;
}

function coffeeTable(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(cyl(0.12, 0.12, 0.36, 0x94a3b8, 12), 0, 0.18, 0));
  g.add(at(cyl(0.7, 0.7, 0.06, 0x475569, 24), 0, 0.39, 0));
  g.add(at(cyl(0.64, 0.64, 0.01, 0x14b8a6, 24, { emissive: 0x14b8a6, emissiveIntensity: 0.8 }), 0, 0.425, 0));

  const mug = at(cyl(0.065, 0.055, 0.14, 0x0284c7, 14), 0.2, 0.49, 0.1);
  g.add(mug);

  for (let i = 0; i < 3; i++) {
    const p = sphere(0.025, 0xffffff, 6, { transparent: true, opacity: 0.6, unique: true });
    g.add(p);
    onTick((t) => {
      const prog = (t * 0.5 + i / 3) % 1;
      p.position.set(0.2 + Math.sin(prog * 6 + i) * 0.03, 0.55 + prog * 0.3, 0.1);
      (p.material as THREE.MeshStandardMaterial).opacity = 0.55 * (1 - prog);
      p.scale.setScalar(0.7 + prog * 0.9);
    });
  }

  return g;
}

function rechargeDock(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(rbox(1.2, 0.16, 1.2, 0x334155, 0.06), 0, 0.08, 0));
  g.add(at(rbox(0.9, 0.04, 0.9, ACCENT_GLOW, 0.02, { emissive: ACCENT_GLOW, emissiveIntensity: 1.0 }), 0, 0.18, 0));
  g.add(at(rbox(0.8, 2.4, 0.25, 0x1e293b, 0.04), 0, 1.2, -0.45));

  for (let i = 0; i < 5; i++) {
    const led = at(rbox(0.4, 0.08, 0.02, ACCENT_GLOW, 0.01, { emissive: ACCENT_GLOW, emissiveIntensity: 1.2, unique: true }), 0, 0.7 + i * 0.28, -0.32);
    g.add(led);
    onTick((t) => {
      const active = (Math.sin(t * 3 - i * 0.8) + 1) / 2;
      (led.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + active * 1.6;
    });
  }

  return g;
}

export function buildLoungeRoom(parent: THREE.Object3D, cx = 27.0, cz = 0): { group: THREE.Group; bots: { bot: Bot; anim: BotAnimator }[] } {
  const g = new THREE.Group();
  g.userData.unit = 'room-lounge';
  g.position.set(cx, 0, cz);

  // 1. Subnautica Pod (Multi-Purpose Room) - Terminal end of single corridor
  const pod = makeSubnauticaPod({
    radius: 4.2,
    height: 3.4,
    accentColor: ACCENT_GREEN,
    roomNumber: '04',
    roomTitle: 'DİNLENME (+1)',
    openWest: true,  // Tube 3 from Room 3
    openEast: false, // End of corridor chain
    hasSolar: true
  });
  g.add(pod);

  // 2. Furniture
  // Main Lounge Sofa (Centered, facing south viewports)
  const sofa = sciFiSofa(3.6, 3);
  sofa.position.set(0, 0.25, 0.8);
  g.add(sofa);

  // Coffee Table
  const table = coffeeTable();
  table.position.set(0, 0.25, -0.6);
  g.add(table);

  // Recharge Dock Pods
  const dock1 = rechargeDock();
  dock1.position.set(2.0, 0.25, 0);
  dock1.rotation.y = -Math.PI / 2;
  g.add(dock1);

  // 3. Robotic Occupants in Lounge
  // Bot 1 resting comfortably on the sofa
  const bot1 = makeBot({ body: 0x0d9488, accent: 0x2dd4bf, name: 'Recharge Bot' });
  bot1.group.position.set(0, 0.48, 0.8);
  g.add(bot1.group);
  const anim1 = createAnimator(bot1, 'resting');

  // Bot 2 standing at the recharge dock
  const bot2 = makeBot({ body: 0x10b981, accent: 0x6ee7b7, name: 'Chill Bot' });
  bot2.group.position.set(2.0, 0.3, 0);
  bot2.group.rotation.y = -Math.PI / 2;
  g.add(bot2.group);
  const anim2 = createAnimator(bot2, 'idle');

  parent.add(g);
  return { group: g, bots: [{ bot: bot1, anim: anim1 }, { bot: bot2, anim: anim2 }] };
}
