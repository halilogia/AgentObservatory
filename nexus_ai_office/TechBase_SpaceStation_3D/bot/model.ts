import * as THREE from 'three';
import { rbox, sphere, cyl, at, mesh, capsule, StdMesh } from '../core/kit';

const DARK = 0x334155;
const HEAD_WHITE = 0xffffff;

export interface BotOptions {
  body: number;
  accent: number;
  legs: number;
  scale: number;
  name?: string;
  roleBadge?: string;
}

export interface Bot {
  group: THREE.Group;
  opts: BotOptions;
  blinkOffset: number;
  eyes: StdMesh[];
  head: THREE.Group;
  bulb: StdMesh;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
}

export function makeBot(opts?: Partial<BotOptions>): Bot {
  const o: BotOptions = Object.assign({
    body: 0x38bdf8,
    accent: 0x00f0ff,
    legs: 0x64748b,
    scale: 1,
    name: 'Robot Unit'
  }, opts);

  const group = new THREE.Group();
  group.userData.unit = 'bot';
  const blinkOffset = Math.random() * 5;
  const glow = { emissive: o.accent, emissiveIntensity: 1.2 };

  // 1. Body Chassis
  const bodyMesh = at(rbox(0.58, 0.52, 0.42, o.body, 0.14), 0, 0.58, 0);
  group.add(bodyMesh);

  // Chest Reactor / Core Plate
  const coreMesh = at(rbox(0.24, 0.22, 0.05, 0x1e293b, 0.04), 0, 0.62, 0.21);
  group.add(coreMesh);
  const coreGlow = at(sphere(0.065, o.accent, 12, glow), 0, 0.62, 0.23);
  group.add(coreGlow);

  // 2. Head Group
  const head = new THREE.Group();
  head.position.y = 0.88;
  group.add(head);

  // Head Outer Shell (Bright Pure Sci-Fi White)
  head.add(at(rbox(0.86, 0.62, 0.68, HEAD_WHITE, 0.2), 0, 0.32, 0));

  // Visor Face Screen
  head.add(at(rbox(0.68, 0.42, 0.06, DARK, 0.1), 0, 0.33, 0.33));

  // Glowing Eyes
  const eyes = [-1, 1].map((s) => {
    const e = sphere(0.065, o.accent, 12, glow);
    e.scale.set(1, 1.35, 0.4);
    e.position.set(s * 0.16, 0.37, 0.36);
    head.add(e);
    return e;
  });

  // Curved LED Mouth Smile
  const smile = mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), o.accent, glow, true);
  smile.rotation.z = Math.PI;
  smile.position.set(0, 0.26, 0.37);
  head.add(smile);

  // Ear Receptors
  [-1, 1].forEach((s) => {
    const ear = cyl(0.1, 0.1, 0.08, o.accent, 12);
    ear.rotation.z = Math.PI / 2;
    ear.position.set(s * 0.48, 0.32, 0);
    head.add(ear);
  });

  // Antenna Stalk & Top Pulsing Bulb (Emissive glow - 0 PointLight overhead for 60 FPS)
  head.add(at(cyl(0.018, 0.018, 0.22, 0x94a3b8, 6), 0, 0.74, 0));
  const bulb = sphere(0.075, o.accent, 12, Object.assign({ unique: true }, glow));
  bulb.position.set(0, 0.92, 0);
  head.add(bulb);

  // 3. Arms
  const makeArm = (s: number): THREE.Group => {
    const p = new THREE.Group();
    p.position.set(s * 0.36, 0.76, 0);
    p.add(at(capsule(0.065, 0.22, o.body), 0, -0.14, 0));
    p.add(at(sphere(0.075, HEAD_WHITE, 10), 0, -0.3, 0)); // Hand
    group.add(p);
    return p;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // 4. Legs & Feet
  const makeLeg = (s: number): THREE.Group => {
    const p = new THREE.Group();
    p.position.set(s * 0.15, 0.34, 0);
    p.add(at(capsule(0.09, 0.22, o.legs), 0, -0.14, 0));
    const foot = at(rbox(0.18, 0.08, 0.28, DARK, 0.04), 0, -0.29, 0.05);
    p.add(foot);
    group.add(p);
    return p;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  group.scale.setScalar(o.scale);

  return {
    group,
    opts: o,
    blinkOffset,
    eyes,
    head,
    bulb,
    armL,
    armR,
    legL,
    legR
  };
}
