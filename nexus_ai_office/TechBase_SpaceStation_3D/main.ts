import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { updaters } from './core/kit';
import { buildCorridor } from './environment/corridor';
import { buildWorkRoom } from './environment/room-work';
import { buildTestRoom } from './environment/room-test';
import { buildReviewRoom } from './environment/room-review';
import { buildLoungeRoom } from './environment/room-lounge';
import { makeBot } from './bot/model';
import { createAnimator, BotAnimator } from './bot/animator';

// 1. Scene & Renderer Setup (Subnautica Clear Turquoise Underwater Studio)
const container = document.getElementById('canvas-container')!;
const scene = new THREE.Scene();

const OCEAN_COLOR = 0x0284c7; // Subnautica tropical shallow ocean blue
scene.background = new THREE.Color(OCEAN_COLOR);
scene.fog = new THREE.Fog(OCEAN_COLOR, 38, 110);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(3, 25, 40); // Wide isometric view showing the complete Subnautica base

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Silky smooth 60 FPS
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.minDistance = 3;
controls.maxDistance = 110;
controls.target.set(3, 1.5, 0);

// 2. High-Performance Sunny Sub-Sea Lighting (ZERO PointLights for 60 FPS)
const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x0284c7, 1.5);
scene.add(hemiLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
sunLight.position.set(16, 40, 24);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 1024;
sunLight.shadow.mapSize.height = 1024;
sunLight.shadow.camera.near = 5;
sunLight.shadow.camera.far = 90;
sunLight.shadow.camera.left = -35;
sunLight.shadow.camera.right = 40;
sunLight.shadow.camera.top = 25;
sunLight.shadow.camera.bottom = -25;
sunLight.shadow.bias = -0.0003;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
fillLight.position.set(-20, 25, -20);
scene.add(fillLight);

// 3. Build Base: Single Corridor of Cylindrical Tubes + 4 Subnautica Pods
// Tubes connecting: Pod 1 ➜ Tube 1 ➜ Pod 2 ➜ Tube 2 ➜ Pod 3 ➜ Tube 3 ➜ Pod 4
buildCorridor(scene);

const allAnimators: BotAnimator[] = [];

// Pod 1: 01 ÇALIŞMA ODASI (Head of the single corridor, X = -21.0)
const workRoom = buildWorkRoom(scene, -21.0, 0);
workRoom.bots.forEach((b) => allAnimators.push(b.anim));

// Pod 2: 02 DENEY & TEST LAB (Middle Pod, X = -5.0)
const testRoom = buildTestRoom(scene, -5.0, 0);
testRoom.bots.forEach((b) => allAnimators.push(b.anim));

// Pod 3: 03 İNCELEME REVIEW (Review Pod, X = 11.0)
const reviewRoom = buildReviewRoom(scene, 11.0, 0);
reviewRoom.bots.forEach((b) => allAnimators.push(b.anim));

// Pod 4: DİNLENME ODASI (+1 Lounge Pod, X = 27.0)
const loungeRoom = buildLoungeRoom(scene, 27.0, 0);
loungeRoom.bots.forEach((b) => allAnimators.push(b.anim));

// 4. Subnautica Transit Robot (Explorer Bot)
// Patrols the entire single corridor through all cylindrical tubes!
const explorerBot = makeBot({
  body: 0x0284c7,
  accent: 0x38bdf8,
  legs: 0x1e293b,
  name: 'Subnautica Explorer Bot'
});
explorerBot.group.position.set(-21.0, 0.25, 0);
scene.add(explorerBot.group);

const explorerAnim = createAnimator(explorerBot, 'walking');
allAnimators.push(explorerAnim);

// Sequential Waypoints through the Single Corridor Tubes
interface Waypoint {
  x: number;
  z: number;
  action?: 'pause' | 'reasoning' | 'reading' | 'resting';
  duration?: number;
}

const WAYPOINTS: Waypoint[] = [
  // 1. Inside Pod 1 (Çalışma Odası)
  { x: -21.0, z: 0, action: 'reasoning', duration: 2.0 },
  // Pass through Silindir Geçit 1 (Tube 1)
  { x: -13.0, z: 0 },
  // 2. Arrive inside Pod 2 (Deney & Test Lab)
  { x: -5.0, z: 0, action: 'reasoning', duration: 2.5 },
  // Pass through Silindir Geçit 2 (Tube 2)
  { x: 3.0, z: 0 },
  // 3. Arrive inside Pod 3 (İnceleme Odası)
  { x: 11.0, z: 0, action: 'reading', duration: 2.5 },
  // Pass through Silindir Geçit 3 (Tube 3)
  { x: 19.0, z: 0 },
  // 4. Arrive inside Pod 4 (Dinlenme Odası Lounge)
  { x: 27.0, z: 0, action: 'resting', duration: 3.0 },
  // Return transit back along the single corridor
  { x: 19.0, z: 0 },
  { x: 11.0, z: 0 },
  { x: 3.0, z: 0 },
  { x: -5.0, z: 0 },
  { x: -13.0, z: 0 },
  { x: -21.0, z: 0 }
];

let curWpIdx = 0;
let wpWaitTimer = 0;
const botSpeed = 2.8;

function updateCorridorPatrol(dt: number) {
  if (wpWaitTimer > 0) {
    wpWaitTimer -= dt;
    if (wpWaitTimer <= 0) {
      explorerAnim.setPose('walking');
      curWpIdx = (curWpIdx + 1) % WAYPOINTS.length;
    }
    return;
  }

  const target = WAYPOINTS[curWpIdx];
  const curPos = explorerBot.group.position;
  const dx = target.x - curPos.x;
  const dz = target.z - curPos.z;
  const dist = Math.hypot(dx, dz);

  if (dist < 0.25) {
    if (target.action) {
      explorerAnim.setPose(target.action);
      wpWaitTimer = target.duration || 2.0;
    } else {
      curWpIdx = (curWpIdx + 1) % WAYPOINTS.length;
    }
  } else {
    const step = Math.min(dist, botSpeed * dt);
    curPos.x += (dx / dist) * step;
    curPos.z += (dz / dist) * step;

    const angle = Math.atan2(dx, dz);
    explorerBot.group.rotation.y = angle;
  }
}

// 5. Camera Navigation Presets
interface CamPreset {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

const CAM_PRESETS: Record<string, CamPreset> = {
  overview: {
    pos: new THREE.Vector3(3, 25, 40),
    target: new THREE.Vector3(3, 1.5, 0)
  },
  tubes: {
    pos: new THREE.Vector3(-4, 6.5, 12),
    target: new THREE.Vector3(-4, 1.5, 0)
  },
  work: {
    pos: new THREE.Vector3(-21, 6.0, 8.0),
    target: new THREE.Vector3(-21, 1.5, 0)
  },
  test: {
    pos: new THREE.Vector3(-5, 6.0, 8.0),
    target: new THREE.Vector3(-5, 1.5, 0)
  },
  review: {
    pos: new THREE.Vector3(11, 6.0, 8.0),
    target: new THREE.Vector3(11, 1.5, 0)
  },
  lounge: {
    pos: new THREE.Vector3(27, 6.0, 8.0),
    target: new THREE.Vector3(27, 1.5, 0)
  }
};

let activeCamTarget: CamPreset | null = null;

document.querySelectorAll<HTMLButtonElement>('.cam-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cam-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const key = btn.dataset.cam;
    if (key && CAM_PRESETS[key]) {
      activeCamTarget = CAM_PRESETS[key];
    }
  });
});

// 6. Main Render & Animation Loop (Rock-Solid 60 FPS)
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.getElapsedTime();

  updaters.forEach((fn) => fn(t, dt));
  updateCorridorPatrol(dt);
  allAnimators.forEach((anim) => anim.update(dt, t));

  if (activeCamTarget) {
    camera.position.lerp(activeCamTarget.pos, 0.06);
    controls.target.lerp(activeCamTarget.target, 0.06);
    if (camera.position.distanceTo(activeCamTarget.pos) < 0.1) {
      activeCamTarget = null;
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();

// 7. Responsive Window Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
