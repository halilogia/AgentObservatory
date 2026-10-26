// Ortam: parke zemin, açık tavanlı duvarlar, pencereler, aydınlatma, kahve köşesi, bitkiler, bulutlar.
import * as THREE from 'three';
import { rbox, cyl, sphere, at, mat, mesh, slab, canvasTex, rand, onTick, disposeTree, registerInspectable, WORLD } from '../../core';
import { plant, cactus, mug, steam } from '../../shared';
import { t, onLanguageChange } from '../../core/i18n';
import { DayNightController, createNightStars, getIstanbulTime } from './day-night';
export { DayNightController, getIstanbulTime, lerpState } from './day-night';
export type { IstanbulTimeInfo, DayPhase } from './day-night';
import type { Task } from '../tasks-board';
import logoUrl from '../../../assets/nexus-logo-wide.jpg';

const FW = WORLD.x1 - WORLD.x0, WALL_H = 4.2;
/** zemin: arka duvar z=-13 (oda sırası), açık çalışma alanı +z'ye uzar */
const Z_BACK = -13, Z_FRONT = 6, DEPTH0 = Z_FRONT - Z_BACK;

function floorTexture(depth: number): THREE.Texture {
  return canvasTex(1024, Math.round(64 * depth), function (c, w, h) {
    const rows = Math.round(depth * 2), ph = h / rows, base = [[196, 140, 92], [208, 154, 104], [186, 129, 84], [214, 163, 115], [200, 146, 98]];
    for (let r = 0; r < rows; r++) {
      let x = -rand() * 200;
      while (x < w) {
        const len = 140 + rand() * 170, b = base[Math.floor(rand() * base.length)], j = (rand() - 0.5) * 12;
        c.fillStyle = 'rgb(' + (b[0] + j) + ',' + (b[1] + j) + ',' + (b[2] + j) + ')';
        c.fillRect(x, r * ph, len, ph);
        c.fillStyle = 'rgba(90,50,25,0.45)'; c.fillRect(x, r * ph, len, 2); c.fillRect(x, r * ph, 2, ph);
        c.strokeStyle = 'rgba(120,70,40,0.12)'; c.lineWidth = 1;
        for (let k = 0; k < 2; k++) { const yy = r * ph + 8 + rand() * (ph - 14); c.beginPath(); c.moveTo(x + 6, yy); c.lineTo(x + len - 6, yy + (rand() - 0.5) * 3); c.stroke(); }
        x += len;
      }
    }
  });
}

/** Pencere: gökyüzü paneli + çerçeve; yüzü +z'ye bakar, parent yönlendirilir */
function windowFrame(w: number, h: number, skyTexture: THREE.CanvasTexture): THREE.Group {
  const g = new THREE.Group();
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: skyTexture }));
  sky.position.z = 0.02; g.add(sky);
  const t = 0.1, f = 0xfff7ea;
  g.add(at(rbox(w + 2 * t, t, 0.14, f, 0.03), 0, h / 2 + t / 2, 0.05));
  g.add(at(rbox(w + 2 * t, t, 0.14, f, 0.03), 0, -h / 2 - t / 2, 0.05));
  g.add(at(rbox(t, h, 0.14, f, 0.03), -w / 2 - t / 2, 0, 0.05));
  g.add(at(rbox(t, h, 0.14, f, 0.03), w / 2 + t / 2, 0, 0.05));
  g.add(at(rbox(0.06, h, 0.1, f, 0.02), 0, 0, 0.06));
  [-1, 1].forEach(function (s) { g.add(at(rbox((w - 0.06) / 2, 0.06, 0.1, f, 0.02), s * (w + 0.06) / 4, 0, 0.06)); }); // dikey çubuğun iki yanına
  g.add(at(rbox(w + 0.5, 0.08, 0.34, 0xe8c9a0, 0.03), 0, -h / 2 - t - 0.04, 0.15));
  return g;
}

function hangingPicture(w: number, h: number, c1: string, c2: string): THREE.Group {
  const g = new THREE.Group();
  g.add(at(rbox(w + 0.14, h + 0.14, 0.07, 0xfff7ea, 0.04), 0, 0, 0.04));
  const tex = canvasTex(128, 128, function (c, W, H) {
    const gr = c.createLinearGradient(0, 0, W, H); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(88, 40, 18, 0, 7); c.fill();
    c.fillStyle = 'rgba(80,60,100,0.35)'; c.beginPath(); c.moveTo(0, 128); c.lineTo(45, 70); c.lineTo(90, 128); c.fill();
    c.beginPath(); c.moveTo(50, 128); c.lineTo(95, 85); c.lineTo(128, 128); c.fill();
  });
  g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })), 0, 0, 0.081));
  return g;
}

/** +z'ye bakar, genişlik boyunca x. Parçalar yan panellerin arasına oturur, kitaplar raflarda yan yana durur. */
function bookshelf(): THREE.Group {
  const g = new THREE.Group(), L = 2.6, H = 2.1, D = 0.5, T = 0.06, wood = 0xc98d5b, inner = L - 0.14;
  g.add(at(rbox(inner, H, T, 0xa86f44, 0.02), 0, H / 2, -D / 2 + T / 2)); // arka levha
  [-1, 1].forEach(function (s) { g.add(at(rbox(0.07, H, D, wood, 0.02), s * (L / 2 - 0.035), H / 2, 0)); });
  const cols = [0xff7eb6, 0x4fd8ff, 0xffc65a, 0xa66bff, 0x6fcf8f, 0xff8a65, 0x7ea6ff];
  const shelfD = D - T, shelfZ = T / 2; // arka levhanın önünde
  const levels = [T / 2, 0.55, 1.07, 1.59, H - T / 2]; // raf merkezleri
  levels.forEach(function (y, r) {
    g.add(at(rbox(inner, T, shelfD, wood, 0.02), 0, y, shelfZ));
    if (r === levels.length - 1) return;
    const room = levels[r + 1] - T / 2 - (y + T / 2) - 0.02; // üst rafa değmeyecek boşluk
    let x = -inner / 2 + 0.06;
    while (x < inner / 2 - 0.3) {
      const bw = 0.07 + rand() * 0.07, bh = Math.min(room, 0.3 + rand() * 0.14);
      if (rand() < 0.1) { x += 0.25; continue; }
      const b = rbox(bw, bh, 0.28, cols[Math.floor(rand() * cols.length)], 0.02);
      b.position.set(x + bw / 2, y + T / 2 + bh / 2, -D / 2 + T + 0.14 + 0.005); g.add(b);
      x += bw + 0.012;
    }
  });
  const p = plant(0.45, 0xffffff); p.position.set(0.9, H, 0); g.add(p);
  return g;
}

/** +z'ye bakar. Tezgâh üstü 1.02; makine, fincanlar ve kaktüs üst yüzeyde yan yana durur. */
function coffeeStation(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(rbox(1.8, 0.95, 0.85, 0xfff1dc, 0.06), 0, 0.475, 0));
  g.add(at(rbox(1.9, 0.07, 0.95, 0x7a5236, 0.03), 0, 0.985, 0)); // 0.95 .. 1.02
  const m = new THREE.Group(); m.position.set(-0.35, 1.02, -0.05); g.add(m);
  m.add(at(rbox(0.56, 0.08, 0.66, 0x2b2d42, 0.02), 0, 0.04, 0.08)); // damlama tepsisi, gövdenin altından öne taşar
  m.add(at(rbox(0.62, 0.66, 0.5, 0xff6f7d, 0.1), 0, 0.08 + 0.33, 0));
  m.add(at(rbox(0.4, 0.2, 0.05, 0x2b2d42, 0.05), 0, 0.55, 0.275)); // ekran gövde yüzüne yaslı
  const led = sphere(0.04, 0x6fe3a0, 8, { emissive: 0x6fe3a0, emissiveIntensity: 1 }); led.scale.z = 0.4; led.position.set(0.12, 0.35, 0.25 + 0.016); m.add(led);
  const cup = mug(0xffffff); cup.position.set(0, 0.08, 0.33); m.add(cup); steam(cup, 0.14);
  [0xff7eb6, 0x4fd8ff, 0xffc65a].forEach(function (c, i) { const q = mug(c); q.position.set(0.1 + i * 0.23, 1.02, 0.1); q.rotation.y = i; g.add(q); });
  g.add(at(cactus(), 0.78, 1.02, -0.1));
  return g;
}

export interface Environment {
  dayNight: DayNightController;
  updateTasks: (tasks: readonly Task[] | string) => void;
  /** zemini toplam extra kadar öne doğru büyütür (yumuşak animasyonla) */
  extendFloor: (extraDepth: number) => void;
}

const outCubic = function (p: number): number { return 1 - Math.pow(1 - p, 3); };

export function buildEnvironment(scene: THREE.Scene, openTasks?: () => void): Environment {
  // zemin
  const side = mat(0xb87d52);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(FW, 0.5, DEPTH0), [side, side, new THREE.MeshStandardMaterial({ map: floorTexture(DEPTH0), roughness: 0.55 }), side, side, side]);
  floor.position.set(0, -0.25, (Z_BACK + Z_FRONT) / 2); floor.receiveShadow = true; scene.add(floor);

  // zemine bağlı (derinliğe göre yeniden kurulan) çerçeve: kaide + sol duvar. Hiçbiri zeminle kesişmez.
  const wallC = 0xfbe6cc, cap = 0xe0b48a;
  let extra = 0;
  const buildFrame = function (ex: number): THREE.Group {
    const g = new THREE.Group(), D = DEPTH0 + ex, zc = (Z_BACK + Z_FRONT + ex) / 2;
    const zMax = Z_FRONT + ex;                  // zeminin ön kenarı
    const wallEnd = zMax + 0.15;
    g.add(at(rbox(FW + 1.2, 0.5, D + 1.2, 0x8d5a3b, 0.4), 0, -0.76, zc));
    g.add(at(slab(FW + 2.4, 0.3, D + 2.4, 0xfff0e0, 0.9), 0, -1.17, zc));
    // sol duvar: arka duvarın iç yüzünden (z=Z_BACK) başlar, köşede arka duvarla kesişmez; kaide üstüne (y=-0.5) oturur
    const len = wallEnd - Z_BACK;
    g.add(at(rbox(0.3, WALL_H + 0.5, len, wallC, 0.04), -FW / 2 - 0.15, (WALL_H - 0.5) / 2, (wallEnd + Z_BACK) / 2));
    const capLen = wallEnd + 0.04 - (Z_BACK + 0.04);
    g.add(at(rbox(0.38, 0.12, capLen, cap, 0.04), -FW / 2 - 0.15, WALL_H + 0.06, (wallEnd + 0.04 + Z_BACK + 0.04) / 2));
    g.add(at(rbox(0.08, 0.22, zMax - (Z_BACK + 0.08), 0xfff7ea, 0.03), -FW / 2 + 0.04, 0.11, (zMax + Z_BACK + 0.08) / 2));
    g.add(at(rbox(0.02, 0.5, zMax - (Z_BACK + 0.02), 0xf4c9a0, 0.01, { roughness: 1 }), -FW / 2 + 0.01, 0.5, (zMax + Z_BACK + 0.02) / 2));
    return g;
  };
  let frame = buildFrame(0); scene.add(frame);

  // arka duvar
  scene.add(at(rbox(FW + 0.45, WALL_H + 0.5, 0.3, wallC, 0.04), -0.075, (WALL_H - 0.5) / 2, Z_BACK - 0.15));
  scene.add(at(rbox(FW + 0.53, 0.12, 0.38, cap, 0.04), -0.075, WALL_H + 0.06, Z_BACK - 0.15));
  scene.add(at(rbox(FW, 0.22, 0.08, 0xfff7ea, 0.03), 0, 0.11, Z_BACK + 0.04));
  scene.add(at(rbox(FW, 0.5, 0.02, 0xf4c9a0, 0.01, { roughness: 1 }), 0, 0.5, Z_BACK + 0.01));

  const skyTexture = new THREE.CanvasTexture(document.createElement('canvas'));
  skyTexture.image.width = 128; skyTexture.image.height = 128;
  skyTexture.encoding = THREE.sRGBEncoding;

  // pencereler
  const w1 = windowFrame(1.9, 1.6, skyTexture); w1.position.set(-8.15, 3.15, Z_BACK + 0.02); // oturan robotların anteninin (≈2.05) üstünde
  scene.add(w1);
  const w2 = windowFrame(1.9, 1.6, skyTexture); w2.position.set(-FW / 2 + 0.02, 2.4, -2.4); w2.rotation.y = Math.PI / 2; scene.add(w2);
  const w4 = windowFrame(1.9, 1.6, skyTexture); w4.position.set(-FW / 2 + 0.02, 2.4, -11.7); w4.rotation.y = Math.PI / 2; scene.add(w4);
  const w3 = windowFrame(1.9, 1.6, skyTexture); w3.position.set(-FW / 2 + 0.02, 2.4, 5.0); w3.rotation.y = Math.PI / 2; scene.add(w3);

  // beyaz tahta + canlı sprint görevleri
  const wb = new THREE.Group(); wb.position.set(0, 2.9, Z_BACK + 0.02); scene.add(wb);
  wb.add(at(rbox(3.7, 1.5, 0.08, 0xdadfe9, 0.06), 0, 0, 0.04));   // çerçeve: 0 .. 0.08
  wb.add(at(rbox(3.5, 1.3, 0.04, 0xffffff, 0.04), 0, 0, 0.1));    // yüzey: 0.08 .. 0.12
  // tahta altı kalemlik rafı, silgi ve renkli tahta kalemleri
  wb.add(at(rbox(3.2, 0.03, 0.1, 0x8a92a6, 0.01), 0, -0.68, 0.14));
  wb.add(at(rbox(0.18, 0.03, 0.05, 0x2b2d42, 0.01), -0.7, -0.66, 0.15)); // silgi
  [[-0.2, 0xa66bff], [0.0, 0x2fb8ff], [0.2, 0xff5d8f]].forEach(([x, c]) => {
    const pen = cyl(0.012, 0.012, 0.14, c as number, 8); pen.rotation.z = Math.PI / 2;
    wb.add(at(pen, x as number, -0.66, 0.15));
  });

  function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }

  const tex = canvasTex(2048, 768, () => {});
  function updateTasks(tasksOrText: readonly Task[] | string): void {
    const canvas = tex.image as HTMLCanvasElement;
    const c = canvas.getContext('2d'); if (!c) return;
    const W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);

    // Zemin: porselen beyazı
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
    const grad = c.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#f4f6fa');
    c.fillStyle = grad; c.fillRect(4, 4, W - 8, H - 8);
    c.strokeStyle = '#e2e8f0'; c.lineWidth = 2; c.strokeRect(6, 6, W - 12, H - 12);

    if (typeof tasksOrText === 'string') {
      c.fillStyle = '#4c1d95'; c.font = '800 36px "Segoe UI",sans-serif'; c.fillText(t('tasks.boardTitle'), 40, 75);
      c.fillStyle = '#087e66'; c.font = '700 28px "Segoe UI",sans-serif'; c.fillText(tasksOrText, 40, 160);
      tex.needsUpdate = true;
      return;
    }

    const tasks = tasksOrText;
    const pending = tasks.filter(t => t.status === 'pending');
    const inProgress = tasks.filter(t => t.status === 'in_progress');
    const completed = tasks.filter(t => t.status === 'completed');
    const total = tasks.length, pct = total ? Math.round((completed.length / total) * 100) : 0;

    // Header (y = 12 .. 86)
    c.fillStyle = '#4c1d95'; c.font = '800 34px "Segoe UI",sans-serif'; c.fillText(t('tasks.boardTitle'), 35, 52);
    c.fillStyle = '#64748b'; c.font = '700 15px "Segoe UI",sans-serif'; c.fillText(t('tasks.boardSubtitle'), 35, 78);

    // Sağ üst: İlerleme ve sayaç rozetleri
    c.fillStyle = '#f3e8ff'; c.strokeStyle = '#d8b4fe'; c.lineWidth = 1.5;
    drawRoundRect(c, W - 340, 22, 305, 54, 16); c.fill(); c.stroke();
    c.fillStyle = '#6b21a8'; c.font = '800 19px "Segoe UI",sans-serif'; c.fillText(t('tasks.completedWithCount', { pct, completed: completed.length, total }), W - 322, 55);

    const drawChip = (x: number, y: number, text: string, bg: string, stroke: string, fg: string) => {
      c.fillStyle = bg; c.strokeStyle = stroke; c.lineWidth = 1.2;
      drawRoundRect(c, x, y, 165, 34, 12); c.fill(); c.stroke();
      c.fillStyle = fg; c.font = '800 14px "Segoe UI",sans-serif'; c.fillText(text, x + 14, y + 22);
    };
    drawChip(W - 875, 32, `${completed.length} ${t('tasks.status.completed')}`, '#dcfce7', '#86efac', '#15803d');
    drawChip(W - 700, 32, `${inProgress.length} ${t('tasks.status.in_progress')}`, '#e0f2fe', '#7dd3fc', '#0369a1');
    drawChip(W - 525, 32, `${pending.length} ${t('tasks.status.pending')}`, '#fef3c7', '#fde68a', '#92400e');

    c.strokeStyle = '#e2e8f0'; c.lineWidth = 2; c.beginPath(); c.moveTo(30, 92); c.lineTo(W - 30, 92); c.stroke();

    // 3 Sütun
    const colW = 636;
    const cols = [
      { title: `${t('tasks.status.pending').toUpperCase()} (${pending.length})`, list: pending, headerBg: '#fef3c7', headerStroke: '#fde68a', headerFg: '#92400e', laneBg: 'rgba(254,243,199,0.18)', noteBg: '#fffde7', noteStroke: '#fff59d', pin: '#f59e0b', x: 35 },
      { title: `${t('tasks.status.in_progress').toUpperCase()} (${inProgress.length})`, list: inProgress, headerBg: '#e0f2fe', headerStroke: '#bae6fd', headerFg: '#0369a1', laneBg: 'rgba(224,242,254,0.22)', noteBg: '#f0f9ff', noteStroke: '#bae6fd', pin: '#0284c7', x: 706 },
      { title: `${t('tasks.status.completed').toUpperCase()} (${completed.length})`, list: completed, headerBg: '#dcfce7', headerStroke: '#bbf7d0', headerFg: '#15803d', laneBg: 'rgba(220,252,231,0.2)', noteBg: '#f0fdf4', noteStroke: '#bbf7d0', pin: '#10b981', x: 1377 }
    ];

    cols.forEach((col, colIdx) => {
      c.fillStyle = col.laneBg; drawRoundRect(c, col.x, 102, colW, 640, 16); c.fill();
      c.fillStyle = col.headerBg; c.strokeStyle = col.headerStroke; c.lineWidth = 1.5;
      drawRoundRect(c, col.x + 8, 110, colW - 16, 42, 12); c.fill(); c.stroke();
      c.fillStyle = col.headerFg; c.font = '800 17px "Segoe UI",sans-serif'; c.fillText(col.title, col.x + 22, 137);

      const visibleNotes = col.list.slice(0, 3);
      const noteW = colW - 24, noteH = 130;
      const noteYPositions = [164, 306, 448];

      visibleNotes.forEach((task, noteIdx) => {
        const ny = noteYPositions[noteIdx];
        const tilt = ((colIdx * 3 + noteIdx * 7) % 5 - 2) * 0.005;
        c.save();
        c.translate(col.x + 12 + noteW / 2, ny + noteH / 2);
        c.rotate(tilt);
        c.shadowColor = 'rgba(0,0,0,0.06)'; c.shadowBlur = 12; c.shadowOffsetY = 4;
        c.fillStyle = col.noteBg; c.strokeStyle = col.noteStroke; c.lineWidth = 1.2;
        drawRoundRect(c, -noteW / 2, -noteH / 2, noteW, noteH, 14); c.fill(); c.stroke();
        c.shadowColor = 'transparent';

        // bant ve iğne
        c.fillStyle = 'rgba(255, 255, 255, 0.85)'; c.strokeStyle = 'rgba(0, 0, 0, 0.05)'; c.lineWidth = 1;
        drawRoundRect(c, -45, -noteH / 2 - 6, 90, 16, 4); c.fill(); c.stroke();
        c.fillStyle = col.pin; c.beginPath(); c.arc(0, -noteH / 2 + 10, 4.5, 0, Math.PI * 2); c.fill();

        // başlık
        c.fillStyle = '#1e293b'; c.font = '700 20px "Segoe UI",sans-serif';
        let title = task.title; if (title.length > 46) title = title.slice(0, 44) + '…';
        c.fillText(title, -noteW / 2 + 20, -noteH / 2 + 50);

        // durum ve id
        c.fillStyle = '#64748b'; c.font = '600 14px "Segoe UI",sans-serif';
        const statusText = task.status === 'completed' ? t('tasks.status.completed') : task.status === 'in_progress' ? t('tasks.status.in_progress') : t('tasks.status.pending');
        c.fillText(`${statusText} · #${task.id.replace(/^md-/, '')}`, -noteW / 2 + 20, -noteH / 2 + 82);

        if (task.status === 'completed') {
          c.strokeStyle = '#94a3b8'; c.lineWidth = 2; c.beginPath();
          c.moveTo(-noteW / 2 + 20, -noteH / 2 + 43); c.lineTo(-noteW / 2 + 20 + Math.min(noteW - 40, title.length * 11), -noteH / 2 + 43); c.stroke();
        }
        c.restore();
      });

      const rem = col.list.length - visibleNotes.length;
      if (rem > 0) {
        c.fillStyle = 'rgba(255, 255, 255, 0.7)'; c.strokeStyle = col.headerStroke; c.lineWidth = 1;
        drawRoundRect(c, col.x + 24, 600, colW - 48, 38, 12); c.fill(); c.stroke();
        c.fillStyle = col.headerFg; c.font = '700 14px "Segoe UI",sans-serif'; c.textAlign = 'center';
        c.fillText(t('tasks.moreTasks', { count: rem }), col.x + colW / 2, 624);
        c.textAlign = 'start';
      }
    });
    tex.needsUpdate = true;
  }
  let currentTasksOrText: readonly Task[] | string = t('tasks.loadingMessage');
  const safeUpdateTasks = (val: readonly Task[] | string): void => {
    currentTasksOrText = val;
    updateTasks(val);
  };
  safeUpdateTasks(currentTasksOrText);
  onLanguageChange(() => {
    updateTasks(currentTasksOrText);
  });
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.48, 1.28), new THREE.MeshBasicMaterial({ map: tex }));
  boardMesh.position.set(0, 0, 0.121); wb.add(boardMesh);
  wb.traverse(child => { child.userData.inspectId = 'whiteboard'; });
  registerInspectable({ id: 'whiteboard', kind: 'board', title: t('tasks.boardInspectTitle'), subtitle: t('tasks.boardInspectSubtitle'), object: wb, color: 0xa66bff, focusOffset: new THREE.Vector3(), radius: 1.8, zoom: 2.6, agents: [], onSelect: openTasks });


  // Nexus Neon Logo Duvar Panosu (Geniş Logo)
  const logoGroup = new THREE.Group(); logoGroup.position.set(10.2, 2.9, Z_BACK + 0.02); scene.add(logoGroup);
  logoGroup.add(at(rbox(2.4, 1.8, 0.04, 0x2b2d42, 0.06), 0, 0, 0.02)); // 0 .. 0.04
  const rim = { emissive: 0xa66bff, emissiveIntensity: 0.8 };            // neon çerçeve: panonun dört kenarına bitişik
  [-1, 1].forEach(function (sg) {
    logoGroup.add(at(rbox(2.5, 0.05, 0.06, 0xa66bff, 0.02, rim), 0, sg * 0.925, 0.03));
    logoGroup.add(at(rbox(0.05, 1.8, 0.06, 0xa66bff, 0.02, rim), sg * 1.225, 0, 0.03));
  });
  const logoTex = new THREE.TextureLoader().load(logoUrl);
  logoTex.encoding = THREE.sRGBEncoding; logoTex.anisotropy = 8;
  const logoMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.26, 1.66), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true }));
  logoMesh.position.set(0, 0, 0.046); logoGroup.add(logoMesh);

  // duvar saati (gerçek İstanbul saatini gösterir)
  const clock = new THREE.Group(); clock.position.set(4.56, 3.3, Z_BACK + 0.02); scene.add(clock);
  clock.add(at(cyl(0.45, 0.45, 0.1, 0xfff7ea, 24), 0, 0, 0.05)); clock.children[0].rotation.x = Math.PI / 2;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.38, 32), new THREE.MeshBasicMaterial({ color: 0xffffff })); face.position.z = 0.102; clock.add(face);

  // 12 saat kadran çizgileri
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2, isMajor = i % 3 === 0;
    const tick = rbox(isMajor ? 0.022 : 0.012, isMajor ? 0.055 : 0.03, 0.005, 0x4a3a55, 0.002);
    tick.position.set(Math.sin(angle) * 0.32, Math.cos(angle) * 0.32, 0.104);
    tick.rotation.z = -angle; clock.add(tick);
  }
  const centerDot = new THREE.Mesh(new THREE.CircleGeometry(0.025, 16), new THREE.MeshBasicMaterial({ color: 0x30243d }));
  centerDot.position.z = 0.138; clock.add(centerDot);

  const hand = function (len: number, col: number, z: number, width = 0.035): THREE.Group {
    const h = rbox(width, len, 0.008, col, 0.015); const p = new THREE.Group(); h.position.y = len / 2 - 0.02; p.add(h); p.position.z = z; clock.add(p); return p;
  };
  const hh = hand(0.2, 0x30243d, 0.114, 0.04), mh = hand(0.29, 0x30243d, 0.124, 0.03), sh = hand(0.32, 0xff5d8f, 0.134, 0.015);
  onTick(function () {
    const t = getIstanbulTime();
    const s = t.second, m = t.minute + s / 60, h = (t.hour % 12) + m / 60;
    hh.rotation.z = -h / 12 * Math.PI * 2; mh.rotation.z = -m / 60 * Math.PI * 2; sh.rotation.z = -s / 60 * Math.PI * 2;
  });

  // sol duvar: raf + tablolar
  const shelf = bookshelf(); shelf.position.set(-FW / 2 + 0.25 + 0.08, 0, 2.5); shelf.rotation.y = Math.PI / 2; scene.add(shelf); // baseboard kalınlığı (0.08) kadar duvardan açık
  const pic = hangingPicture(1.3, 0.9, '#ffb4a2', '#a98bff'); pic.position.set(-FW / 2 + 0.02, 3.3, 2.5); pic.rotation.y = Math.PI / 2; scene.add(pic);

  // kahve köşesi (arka-sol)
  const coffee = coffeeStation(); coffee.position.set(-10.45, 0, Z_BACK + 0.58); scene.add(coffee);

  // su sebili
  const wc = new THREE.Group(); wc.position.set(7.2, 0, -1.2); scene.add(wc);
  wc.add(at(rbox(0.55, 1.0, 0.55, 0xffffff, 0.1), 0, 0.5, 0));
  wc.add(at(rbox(0.12, 0.1, 0.1, 0x4fd8ff, 0.03), 0, 0.75, 0.325)); // musluk gövde yüzüne yaslı
  wc.add(at(cyl(0.24, 0.24, 0.04, 0xdfe6f2, 16), 0, 1.02, 0));        // gövde üstü yuva: 1.00 .. 1.04
  wc.add(at(cyl(0.22, 0.22, 0.5, 0x9fe0ff, 16, { transparent: true, opacity: 0.65 }), 0, 1.29, 0));
  const dome = mesh(new THREE.SphereGeometry(0.22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x9fe0ff, { transparent: true, opacity: 0.65 }));
  dome.position.y = 1.54; wc.add(dome);                                // yarım küre, silindirin üstünde

  // bitkiler
  [[10.9, 5.2, 1.5], [-10.9, 5.3, 1.2], [10.9, -3.0, 0.8], [-11.0, -7.1, 1.0], [11.0, -7.2, 1.1]].forEach(function (p, i) {
    const pl = plant(p[2], i % 2 ? 0xf2a08a : 0xe58f6b); pl.position.set(p[0], 0, p[1]); scene.add(pl);
  });

  // zemin lambası
  const lamp = new THREE.Group(); lamp.position.set(-3.4, 0, 5.2); scene.add(lamp);
  lamp.add(at(cyl(0.22, 0.26, 0.06, 0x555a70, 14), 0, 0.03, 0));
  lamp.add(at(cyl(0.025, 0.025, 1.59, 0x555a70, 8), 0, 0.855, 0)); // 0.06 .. 1.65, gölgelik altına kadar
  lamp.add(at(cyl(0.2, 0.34, 0.4, 0xfff0c2, 16, { emissive: 0xffd88a, emissiveIntensity: 0.9 }), 0, 1.85, 0));
  const lp = new THREE.PointLight(0xffd29a, 0.9, 7, 2); lp.position.set(-3.4, 1.8, 5.2); scene.add(lp);

  // ışıklar
  const hemi = new THREE.HemisphereLight(0xfff1dc, 0xd7a982, 0.85); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.1);
  sun.position.set(9, 15, 5); sun.target.position.set(0, 0, -3.5); scene.add(sun.target); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;
  const sc = sun.shadow.camera; sc.left = -19; sc.right = 19; sc.top = 17; sc.bottom = -17; sc.near = 1; sc.far = 60;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbfd8ff, 0.25); fill.position.set(-8, 6, 10); scene.add(fill);

  const stars = createNightStars(); scene.add(stars);
  const dayNight = new DayNightController({ sun, fill, hemi, stars, sky: skyTexture });

  // gökyüzü adası bulutları
  const cloudMat = mat(0xffffff, { roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.25 });
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group(); c.userData.unit = 'cloud'; const a = i / 9 * Math.PI * 2 + 0.3, r = 25 + rand() * 6; // ofis genişlese de platforma değmesin
    [[0, 0, 0, 1], [0.9, -0.15, 0.1, 0.75], [-0.9, -0.2, -0.1, 0.7], [0.3, 0.3, 0, 0.6]].forEach(function (b) {
      const s = mesh(new THREE.IcosahedronGeometry(b[3], 1), cloudMat, null, true); s.position.set(b[0], b[1], b[2]); s.scale.y = 0.7; c.add(s);
    });
    c.position.set(Math.cos(a) * r, -1.5 + rand() * 6, Math.sin(a) * r); Object.assign(c.userData, { a: a, r: r, y: c.position.y, sp: 0.02 + rand() * 0.03 });
    scene.add(c); clouds.push(c);
  }
  onTick(function (t) {
    clouds.forEach(function (c, i) {
      const u = c.userData, an = u.a + t * u.sp * 0.1;
      c.position.set(Math.cos(an) * u.r, u.y + Math.sin(t * 0.6 + i) * 0.25, Math.sin(an) * u.r);
    });
  });

  // uçuşan sıcak parıltılar
  const N = 70, pos = new Float32Array(N * 3), base: number[][] = [];
  for (let i = 0; i < N; i++) { base.push([(rand() - 0.5) * 22, 0.5 + rand() * 3.5, -3.5 + (rand() - 0.5) * 19, rand() * 6]); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff0b8, size: 0.09, transparent: true, opacity: 0.75, depthWrite: false }));
  scene.add(pts);
  onTick(function (t) {
    for (let i = 0; i < N; i++) {
      const b = base[i];
      pos[i * 3] = b[0] + Math.sin(t * 0.3 + b[3]) * 0.5;
      pos[i * 3 + 1] = b[1] + Math.sin(t * 0.5 + b[3] * 2) * 0.3;
      pos[i * 3 + 2] = b[2] + Math.cos(t * 0.25 + b[3]) * 0.5;
    }
    geo.attributes.position.needsUpdate = true;
  });

  // zemin genişletme: yeni şerit arka kenarından öne doğru açılır; kaide ve sol duvar yeni derinliğe göre yeniden kurulur
  function extendFloor(newExtra: number): void {
    if (newExtra <= extra) return;
    const delta = newExtra - extra, z0 = Z_FRONT + extra;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(FW, 0.5, delta), [side, side, new THREE.MeshStandardMaterial({ map: floorTexture(delta), roughness: 0.55 }), side, side, side]);
    strip.position.set(0, -0.25, delta / 2); strip.receiveShadow = true;
    const pivot = new THREE.Group(); pivot.position.z = z0; pivot.scale.z = 0.001; pivot.add(strip); scene.add(pivot);
    const t0 = performance.now(); let done = false;
    onTick(function () {
      if (done) return;
      const p = Math.min(1, (performance.now() - t0) / 700);
      pivot.scale.z = Math.max(0.001, outCubic(p)); if (p >= 1) done = true;
    });
    scene.remove(frame); disposeTree(frame);
    extra = newExtra; frame = buildFrame(extra); scene.add(frame);
  }
  return { extendFloor: extendFloor, dayNight, updateTasks: safeUpdateTasks };
}
