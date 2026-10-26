import * as THREE from 'three';
import { cyl, rbox, slab, at, decal } from '../core/kit';

export interface TubeOptions {
  length?: number;        // Distance between pods (default 7.6)
  radius?: number;        // Tube radius (default 1.35)
  accentColor?: number;   // Neon guide color (default 0x38bdf8)
  label?: string;         // Digital tube label
}

/**
 * Creates a Subnautica-style horizontal cylindrical corridor / passage:
 * - Rounded outer hull with rib reinforcement collars
 * - Panoramic clear glass observation viewports facing camera
 * - Interior flat deck floor with glowing center lane
 * - Heavy-duty bulkhead locking flanges at both ends
 */
export function makeSubnauticaTube(opts?: TubeOptions): THREE.Group {
  const o = Object.assign({
    length: 7.6,
    radius: 1.35,
    accentColor: 0x38bdf8,
    label: 'TRANSIT TUBE'
  }, opts);

  const g = new THREE.Group();
  g.userData.unit = 'subnautica-tube';

  const HULL_COLOR = 0xf8fafc;  // Subnautica white exterior hull
  const BELLY_DARK = 0x334155;  // Slate hull underside / trim
  const FRAME_COLOR = 0x1e293b; // Deep structural collar
  const GLOW_MAT = { emissive: o.accentColor, emissiveIntensity: 1.4 };

  const R = o.radius;
  const L = o.length;

  // 1. Solid Top & Bottom Hull Shells (leaving front and back open for glass windows)
  // Top arch shell (theta from PI*0.75 to PI*1.25)
  const topGeo = new THREE.CylinderGeometry(R, R, L, 24, 1, true, Math.PI * 0.75, Math.PI * 0.5);
  topGeo.rotateZ(Math.PI / 2);
  const hullMat = new THREE.MeshStandardMaterial({ color: HULL_COLOR, roughness: 0.35, metalness: 0.15, side: THREE.DoubleSide });
  const topMesh = new THREE.Mesh(topGeo, hullMat);
  topMesh.position.y = R;
  g.add(topMesh);

  // Bottom belly shell (theta from -PI*0.25 to PI*0.25)
  const btmGeo = new THREE.CylinderGeometry(R, R, L, 24, 1, true, -Math.PI * 0.25, Math.PI * 0.5);
  btmGeo.rotateZ(Math.PI / 2);
  const btmMesh = new THREE.Mesh(btmGeo, new THREE.MeshStandardMaterial({ color: BELLY_DARK, roughness: 0.5, side: THREE.DoubleSide }));
  btmMesh.position.y = R;
  g.add(btmMesh);

  // Back wall shell (North)
  const backGeo = new THREE.CylinderGeometry(R, R, L, 24, 1, true, Math.PI * 0.25, Math.PI * 0.5);
  backGeo.rotateZ(Math.PI / 2);
  const backMesh = new THREE.Mesh(backGeo, hullMat);
  backMesh.position.y = R;
  g.add(backMesh);

  // 2. Large Panoramic Glass Observation Viewport (South: facing camera)
  const glassGeo = new THREE.CylinderGeometry(R + 0.01, R + 0.01, L - 0.4, 20, 1, true, -Math.PI * 0.75, Math.PI * 0.5);
  glassGeo.rotateZ(Math.PI / 2);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.22, // Crystal clear view inside the tube!
    roughness: 0.05,
    metalness: 0.1,
    side: THREE.DoubleSide
  });
  const glassFront = new THREE.Mesh(glassGeo, glassMat);
  glassFront.position.y = R;
  g.add(glassFront);

  // 3. Structural Reinforcement Rib Rings (Collars along the tube)
  const ringStep = L / 4;
  for (let i = -L / 2 + ringStep; i < L / 2; i += ringStep) {
    const ring = cyl(R + 0.08, R + 0.08, 0.22, FRAME_COLOR, 24);
    ring.rotation.z = Math.PI / 2;
    ring.position.set(i, R, 0);
    g.add(ring);

    // Glowing neon band on ring
    const neonRing = cyl(R + 0.09, R + 0.09, 0.06, o.accentColor, 24, GLOW_MAT);
    neonRing.rotation.z = Math.PI / 2;
    neonRing.position.set(i, R, 0);
    g.add(neonRing);
  }

  // 4. Heavy-Duty Bulkhead Flanges at both ends
  [-L / 2, L / 2].forEach((x) => {
    const flange = cyl(R + 0.16, R + 0.16, 0.35, BELLY_DARK, 28);
    flange.rotation.z = Math.PI / 2;
    flange.position.set(x, R, 0);
    g.add(flange);

    const seal = cyl(R + 0.18, R + 0.18, 0.08, o.accentColor, 28, GLOW_MAT);
    seal.rotation.z = Math.PI / 2;
    seal.position.set(x, R, 0);
    g.add(seal);
  });

  // 5. Interior Flat Walk Deck Floor (y = 0.25)
  const floorW = 1.6;
  const floorSlab = at(slab(L, 0.1, floorW, 0xe2e8f0, 0.04), 0, 0.25, 0);
  g.add(floorSlab);

  // Glowing center guideline
  const guideLine = decal(L - 0.2, 0.16, 0.02, o.accentColor, 1, GLOW_MAT);
  guideLine.position.y = 0.31;
  g.add(guideLine);

  // 6. Vertical Support Stilt under middle of tube
  const leg = at(cyl(0.16, 0.16, 2.5, FRAME_COLOR, 12), 0, -1.25, 0);
  g.add(leg);
  const foot = at(cyl(0.45, 0.55, 0.2, BELLY_DARK, 16), 0, -2.4, 0);
  g.add(foot);

  return g;
}
