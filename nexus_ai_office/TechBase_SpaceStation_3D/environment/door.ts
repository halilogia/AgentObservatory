import * as THREE from 'three';
import { rbox, slab, at, decal, canvasTex } from '../core/kit';

export interface DoorOptions {
  width?: number;        // Total doorway width (default 2.4)
  height?: number;       // Total doorway height (default 2.8)
  depth?: number;        // Wall thickness (default 0.35)
  accentColor?: number;  // Neon glowing trim color
  doorLabel?: string;    // Digital sign text above door
  isCorridor?: boolean;  // If true, double portal design
}

/**
 * Creates a futuristic sci-fi sliding door portal with:
 * - Thick beveled metal frame pillars
 * - Lintel box with glowing room sign
 * - Retracted/partially open sliding blast doors with illuminated neon edge stripes
 * - Floor threshold transition plate with glowing safety strips
 */
export function makeSciFiDoor(opts?: DoorOptions): THREE.Group {
  const o = Object.assign({
    width: 2.4,
    height: 2.8,
    depth: 0.35,
    accentColor: 0x0284c7,
    doorLabel: 'ACCESS PORTAL',
    isCorridor: false
  }, opts);

  const g = new THREE.Group();
  g.userData.unit = 'sci-fi-door';

  const halfW = o.width / 2;
  const frameColor = 0xcbd5e1;       // Bright clean tech metal
  const darkTrim = 0x64748b;         // Slate metal bevel
  const glowMat = { emissive: o.accentColor, emissiveIntensity: 1.4 };

  // 1. Floor Threshold Transition Plate
  const threshold = at(slab(o.width + 0.3, 0.04, o.depth + 0.3, 0x94a3b8, 0.02), 0, 0.02, 0);
  g.add(threshold);
  // Glowing safety threshold runners
  [-o.depth / 2 - 0.1, o.depth / 2 + 0.1].forEach((tz) => {
    g.add(at(rbox(o.width + 0.2, 0.02, 0.04, o.accentColor, 0.01, glowMat), 0, 0.04, tz));
  });

  // 2. Vertical Frame Columns (Left & Right)
  const colW = 0.28;
  [-halfW - colW / 2, halfW + colW / 2].forEach((cx, idx) => {
    // Outer column
    g.add(at(rbox(colW, o.height, o.depth + 0.12, frameColor, 0.04), cx, o.height / 2, 0));
    // Inner chamfered pillar
    g.add(at(rbox(0.08, o.height - 0.1, o.depth + 0.06, darkTrim, 0.02), cx + (idx === 0 ? 0.08 : -0.08), o.height / 2, 0));
    // Vertical neon status beacon (green glowing active sensor strip)
    const neonStrip = at(rbox(0.03, o.height * 0.7, 0.04, 0x10b981, 0.01, { emissive: 0x10b981, emissiveIntensity: 1.5 }), cx, o.height * 0.45, o.depth / 2 + 0.07);
    g.add(neonStrip);
  });

  // 3. Top Overhead Lintel & Housing
  const lintelH = 0.55;
  const lintelY = o.height + lintelH / 2 - 0.1;
  g.add(at(rbox(o.width + colW * 2 + 0.1, lintelH, o.depth + 0.14, frameColor, 0.05), 0, lintelY, 0));
  g.add(at(rbox(o.width + 0.2, 0.06, o.depth + 0.16, o.accentColor, 0.02, glowMat), 0, o.height - 0.08, 0));

  // 4. Digital Neon Label above Door (front & back)
  if (o.doorLabel) {
    const tex = canvasTex(256, 64, (ctx, cw, ch) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, cw - 6, ch - 6);
      ctx.fillStyle = '#38bdf8';
      ctx.font = '800 22px "Segoe UI",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.doorLabel!, cw / 2, ch / 2);
    });

    [-1, 1].forEach((dir) => {
      const signMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 0.35),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
      );
      signMesh.position.set(0, lintelY, dir * (o.depth / 2 + 0.08));
      if (dir === -1) signMesh.rotation.y = Math.PI;
      g.add(signMesh);
    });
  }

  // 5. Retracted / Sliding Sci-Fi Blast Door Panels (Visible in open state)
  const panelW = 0.55;
  const panelH = o.height - 0.15;
  const openOffset = halfW - 0.25;

  // Left door panel
  const panelL = at(rbox(panelW, panelH, 0.08, 0xe2e8f0, 0.02), -openOffset, panelH / 2, 0);
  panelL.add(at(rbox(0.04, panelH - 0.2, 0.1, o.accentColor, 0.01, glowMat), panelW / 2 - 0.02, 0, 0));
  g.add(panelL);

  // Right door panel
  const panelR = at(rbox(panelW, panelH, 0.08, 0xe2e8f0, 0.02), openOffset, panelH / 2, 0);
  panelR.add(at(rbox(0.04, panelH - 0.2, 0.1, o.accentColor, 0.01, glowMat), -panelW / 2 + 0.02, 0, 0));
  g.add(panelR);

  return g;
}
