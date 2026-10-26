import * as THREE from 'three';
import { cyl, rbox, sphere, at, onTick } from '../core/kit';
import { makeSubnauticaTube } from './subnautica-tube';

export function buildCorridor(parent: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  g.userData.unit = 'subnautica-corridors';

  // 1. Silindir Geçit 1 (Connecting Room 1: Çalışma ➜ Room 2: Deney Lab)
  // Spans from X = -16.8 to -9.2 (center X = -13.0, L = 7.6)
  const tube1 = makeSubnauticaTube({
    length: 7.6,
    radius: 1.35,
    accentColor: 0x0284c7, // Cyan-Amber transition
    label: '01 ➜ 02 TRANSIT'
  });
  tube1.position.set(-13.0, 0, 0);
  g.add(tube1);

  // 2. Silindir Geçit 2 (Connecting Room 2: Deney Lab ➜ Room 3: İnceleme)
  // Spans from X = -0.8 to +6.8 (center X = +3.0, L = 7.6)
  const tube2 = makeSubnauticaTube({
    length: 7.6,
    radius: 1.35,
    accentColor: 0xf59e0b, // Amber-Purple transition
    label: '02 ➜ 03 TRANSIT'
  });
  tube2.position.set(3.0, 0, 0);
  g.add(tube2);

  // 3. Silindir Geçit 3 (Connecting Room 3: İnceleme ➜ Room 4: Dinlenme Odası)
  // Spans from X = +15.2 to +22.8 (center X = +19.0, L = 7.6)
  const tube3 = makeSubnauticaTube({
    length: 7.6,
    radius: 1.35,
    accentColor: 0xa855f7, // Purple-Emerald transition
    label: '03 ➜ 04 TRANSIT'
  });
  tube3.position.set(19.0, 0, 0);
  g.add(tube3);

  // 4. Stylized Subnautica Sandy Seabed Floor beneath the Base
  // Extends across all pods from X = -35 to +40, Z = -18 to +18
  const seabedGeo = new THREE.PlaneGeometry(80, 40, 24, 16);
  seabedGeo.rotateX(-Math.PI / 2);

  // Undulating subtle seabed dunes
  const pos = seabedGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vz = pos.getZ(i);
    const wave = Math.sin(vx * 0.15) * Math.cos(vz * 0.15) * 0.4 + Math.sin(vx * 0.3) * 0.2;
    pos.setY(i, -2.6 + wave);
  }
  seabedGeo.computeVertexNormals();

  const seabedMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7, // Vibrant cyan/turquoise ocean bottom
    roughness: 0.8,
    metalness: 0.1,
    flatShading: true
  });
  const seabed = new THREE.Mesh(seabedGeo, seabedMat);
  seabed.receiveShadow = true;
  g.add(seabed);

  // Low-poly coral rocks on the seabed
  const rockCoords = [
    [-24, -8], [-18, 9], [-12, -7], [-5, 8], [2, -9], [10, 8], [18, -8], [26, 9], [32, -6]
  ];
  rockCoords.forEach(([rx, rz]) => {
    const rock = at(cyl(0.5, 0.9, 0.8, 0x1e3a5f, 6), rx, -2.2, rz);
    rock.rotation.y = Math.random() * Math.PI;
    g.add(rock);
  });

  // 5. Rising Sub-Sea Ambient Bubble Particles (0 GPU overhead, gentle floating animation)
  const bubbleCount = 18;
  for (let b = 0; b < bubbleCount; b++) {
    const bx = -28 + (b / bubbleCount) * 60 + (Math.sin(b * 3) * 4);
    const bz = Math.cos(b * 4) * 6;
    const bub = sphere(0.06 + (b % 3) * 0.03, 0xffffff, 8, {
      transparent: true,
      opacity: 0.5,
      unique: true
    });
    bub.position.set(bx, -2.0 + (b % 5) * 1.2, bz);
    g.add(bub);

    const bSpeed = 0.8 + (b % 4) * 0.3;
    const bOffset = b * 0.7;
    onTick((t) => {
      const prog = (t * bSpeed * 0.25 + bOffset) % 1;
      bub.position.y = -2.5 + prog * 9.0;
      bub.position.x = bx + Math.sin(t * 1.5 + b) * 0.2;
      (bub.material as THREE.MeshStandardMaterial).opacity = 0.5 * (1 - prog * 0.5);
    });
  }

  parent.add(g);
  return g;
}
