import * as THREE from 'three';
import { cyl, rbox, slab, at, canvasTex } from '../core/kit';

export interface PodOptions {
  radius?: number;       // Pod radius (default 4.2)
  height?: number;       // Pod height (default 3.4)
  accentColor?: number;  // Neon glowing trim color
  roomNumber?: string;   // '01', '02', '03', '04'
  roomTitle?: string;    // 'ÇALIŞMA', 'DENEY & TEST', 'İNCELEME', 'DİNLENME'
  openEast?: boolean;    // Has airlock door on +X
  openWest?: boolean;    // Has airlock door on -X
  hasSolar?: boolean;    // Has Subnautica roof solar panel
}

/**
 * Creates a Subnautica-style Multi-Purpose Habitat Pod:
 * - Open skylight roof ring for full overhead visibility
 * - Panoramic observation glass cutaway facing camera for complete interior visibility
 * - Solid high-tech back wall for equipment/monitors
 * - Rounded cylindrical hull on deep seabed stilts
 * - Circular airlock bulkhead hatches for transit tubes
 * - Interior floor deck with concentric LED guidance rings
 */
export function makeSubnauticaPod(opts?: PodOptions): THREE.Group {
  const o = Object.assign({
    radius: 4.2,
    height: 3.4,
    accentColor: 0x38bdf8,
    roomNumber: '01',
    roomTitle: 'HABITAT POD',
    openEast: true,
    openWest: true,
    hasSolar: true
  }, opts);

  const g = new THREE.Group();
  g.userData.unit = 'subnautica-pod';

  const HULL_WHITE = 0xf8fafc;  // Crisp Subnautica white
  const BELLY_DARK = 0x334155;  // Slate hull underside
  const FRAME_DARK = 0x1e293b;  // Structural metal
  const GLOW_MAT = { emissive: o.accentColor, emissiveIntensity: 1.4 };

  const R = o.radius;
  const H = o.height;

  // 1. Seabed Stilts / Legs (4 heavy hydraulic legs down to seabed)
  const legAngles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
  legAngles.forEach((a) => {
    const lx = Math.cos(a) * (R * 0.75);
    const lz = Math.sin(a) * (R * 0.75);
    const leg = at(cyl(0.18, 0.18, 2.8, FRAME_DARK, 14), lx, -1.4, lz);
    g.add(leg);
    const foot = at(cyl(0.55, 0.7, 0.25, BELLY_DARK, 16), lx, -2.65, lz);
    g.add(foot);
  });

  // 2. Lower Hull / Belly Skirt (OpenEnded so bottom is clean)
  const belly = at(cyl(R, R * 0.9, 0.6, BELLY_DARK, 32), 0, -0.05, 0);
  g.add(belly);

  // 3. Interior Floor Deck (y = 0.25)
  const floor = at(cyl(R - 0.1, R - 0.1, 0.1, 0xf1f5f9, 32), 0, 0.25, 0);
  g.add(floor);

  // Concentric Neon Circular Guidance Strip
  const floorRingGeo = new THREE.RingGeometry(R * 0.65, R * 0.65 + 0.12, 32);
  floorRingGeo.rotateX(-Math.PI / 2);
  const floorRing = new THREE.Mesh(floorRingGeo, new THREE.MeshStandardMaterial({
    color: o.accentColor,
    emissive: o.accentColor,
    emissiveIntensity: 1.2,
    side: THREE.DoubleSide
  }));
  floorRing.position.y = 0.31;
  g.add(floorRing);

  // 4. Back Wall (North Half: theta from PI to 2*PI) - Solid Subnautica white panel
  const backWallGeo = new THREE.CylinderGeometry(R, R, H, 24, 1, true, Math.PI, Math.PI);
  const backWallMat = new THREE.MeshStandardMaterial({
    color: HULL_WHITE,
    roughness: 0.3,
    metalness: 0.1,
    side: THREE.DoubleSide
  });
  const backWall = new THREE.Mesh(backWallGeo, backWallMat);
  backWall.position.y = H / 2 + 0.25;
  g.add(backWall);

  // 5. Front Wall (South Half: facing camera) - Low base wall + Huge panoramic clear observation glass
  const frontBaseGeo = new THREE.CylinderGeometry(R, R, 0.7, 24, 1, true, 0, Math.PI);
  const frontBase = new THREE.Mesh(frontBaseGeo, backWallMat);
  frontBase.position.y = 0.35 + 0.25;
  g.add(frontBase);

  // Front base trim
  const baseTrimGeo = new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.08, 24, 1, true, 0, Math.PI);
  const baseTrim = new THREE.Mesh(baseTrimGeo, new THREE.MeshStandardMaterial({ color: BELLY_DARK, side: THREE.DoubleSide }));
  baseTrim.position.y = 0.95;
  g.add(baseTrim);

  // Panoramic Clear Observation Glass on Front Half (Very high transparency)
  const glassGeo = new THREE.CylinderGeometry(R + 0.01, R + 0.01, 1.8, 24, 1, true, 0, Math.PI);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.15, // Extremely clear view inside!
    roughness: 0.05,
    metalness: 0.1,
    side: THREE.DoubleSide
  });
  const frontGlass = new THREE.Mesh(glassGeo, glassMat);
  frontGlass.position.y = 1.9;
  g.add(frontGlass);

  // 6. Roof Bevel Ring & Skylight Frame (OPEN ENDED - No solid disc covering roof!)
  const roofRingGeo = new THREE.CylinderGeometry(R + 0.06, R, 0.35, 32, 1, true);
  const roofRing = new THREE.Mesh(roofRingGeo, new THREE.MeshStandardMaterial({ color: HULL_WHITE, side: THREE.DoubleSide }));
  roofRing.position.y = H + 0.3;
  g.add(roofRing);

  const roofGlowGeo = new THREE.CylinderGeometry(R + 0.08, R + 0.08, 0.08, 32, 1, true);
  const roofGlow = new THREE.Mesh(roofGlowGeo, new THREE.MeshStandardMaterial(Object.assign({ side: THREE.DoubleSide }, GLOW_MAT)));
  roofGlow.position.y = H + 0.42;
  g.add(roofGlow);

  // 7. Subnautica Roof Solar Panel
  if (o.hasSolar) {
    const solarGroup = new THREE.Group();
    solarGroup.position.set(-R * 0.55, H + 0.45, -R * 0.55);
    solarGroup.add(at(cyl(0.06, 0.06, 0.4, FRAME_DARK, 8), 0, 0.2, 0));
    const panel = at(rbox(1.2, 0.05, 0.8, 0x0f172a, 0.02), 0, 0.45, 0);
    panel.rotation.x = 0.4;
    solarGroup.add(panel);
    const cells = at(rbox(1.1, 0.02, 0.7, 0x0284c7, 0.01, { emissive: 0x0284c7, emissiveIntensity: 0.8 }), 0, 0.48, 0);
    cells.rotation.x = 0.4;
    solarGroup.add(cells);
    g.add(solarGroup);
  }

  // 8. Airlock Bulkhead Hatches
  const makeAirlock = (dir: 1 | -1) => {
    const ag = new THREE.Group();
    ag.position.set(dir * R, 1.45, 0);

    const collar = cyl(1.5, 1.5, 0.45, FRAME_DARK, 24);
    collar.rotation.z = Math.PI / 2;
    ag.add(collar);

    const seal = cyl(1.54, 1.54, 0.1, o.accentColor, 24, GLOW_MAT);
    seal.rotation.z = Math.PI / 2;
    ag.add(seal);

    const voidRing = cyl(1.35, 1.35, 0.5, 0x0f172a, 20);
    voidRing.rotation.z = Math.PI / 2;
    ag.add(voidRing);

    g.add(ag);
  };

  if (o.openEast) makeAirlock(1);
  if (o.openWest) makeAirlock(-1);

  // 9. Overhead Room Plaque inside Pod (On back wall)
  const signTex = canvasTex(256, 80, (ctx, cw, ch) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, cw - 6, ch - 6);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 20px "Segoe UI",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${o.roomNumber} ${o.roomTitle}`, cw / 2, 34);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 13px "Segoe UI",sans-serif';
    ctx.fillText('SUBNAUTICA HABITAT', cw / 2, 60);
  });

  const signMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.5),
    new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
  );
  signMesh.position.set(0, 3.1, -R + 0.35);
  g.add(signMesh);

  return g;
}
