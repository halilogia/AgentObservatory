// Giriş noktası: sahne, izometrik kamera, OrbitControls, animasyon döngüsü.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { updaters, registerInspectable, OfficeRegistry, advanceClock, mountLangSwitcher, onLanguageChange, t, getManagerModel, modelLabel } from './core';
import type { ProjectSpec } from './core';
import { buildEnvironment } from './features/environment';
import { buildManager } from './features/manager';
import { initDesks } from './features/desks';
import { buildServer } from './features/server';
import { buildRooms } from './features/rooms';
import { initAgents } from './features/agents';
import { initInspector, feed, mountTestModeToggle } from './features/inspector';
import { initProjectDialog } from './features/project-dialog';
import { QuotaStore, initQuotaUi, PROVIDER_MODELS, windowOf, providerOf } from './features/quota';
import type { ProviderId } from './features/quota';
import { installClipCheck } from './dev/clipcheck';
import { TasksStore, initTasksBoard } from './features/tasks-board';
import { LEGACY_DEMO_PROJECTS } from '../archive/legacy-agent-demo';

function showError(): void {
  const el = document.getElementById('error');
  if (el) {
    el.textContent = t('app.errorCdn');
    el.style.display = 'flex';
  }
}

function start(): void {
  document.title = t('app.title');
  onLanguageChange(() => {
    document.title = t('app.title');
  });
  const app = document.getElementById('app')!;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const HALF = 11.8;
  let viewScale = 1, viewScaleGoal = 1; // zemin büyüdükçe kadraj genişler
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  camera.position.set(17, 15, 13.5);

  function resize(): void {
    const w = window.innerWidth, h = window.innerHeight, a = w / h;
    renderer.setSize(w, h);
    const half = (a < 1.2 ? HALF * 1.2 / a * 0.62 : HALF) * viewScale; // dar ekranlarda yatayı da sığdır
    camera.left = -half * a; camera.right = half * a; camera.top = half; camera.bottom = -half;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.0, -3.5);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minZoom = 0.55; controls.maxZoom = 3.2;
  controls.maxPolarAngle = Math.PI / 2.08; controls.minPolarAngle = 0.15;
  controls.screenSpacePanning = true;
  controls.update();

  let lastT = 0;
  const tasks = new TasksStore();
  const tasksBoard = initTasksBoard(tasks, { onClose: () => inspector?.deselect() });
  const env = buildEnvironment(scene, tasksBoard.open);
  tasks.onChange(() => {
    env.updateTasks(tasks.ready ? tasks.tasks : tasks.message);
  });
  void tasks.load();
  const toolbarEl = document.getElementById('toolbar') || document.body;
  mountLangSwitcher(toolbarEl);
  env.dayNight.mountToolbar(toolbarEl);
  updaters.push((_t, dt) => env.dayNight.update(dt));
  const rooms = buildRooms(scene);
  const manager = buildManager(scene);
  const server = buildServer(scene);
  const agents = initAgents(scene, function (id, level, text) { feed.note(id, level, text); });
  let inspector: { deselect: () => void; focus: (id: string, agent?: string) => boolean; setTestMode: (on: boolean) => void } | undefined;
  const quota = new QuotaStore();
  const quotaUi = initQuotaUi(quota, { onClose: () => inspector?.deselect() });
  const stats = function (): string { const s = agents.loungeStats(); return t('rooms.lounge.metric', { free: s.free, total: s.total, resting: s.resting }); };
  rooms.setMetric('lounge', stats);
  rooms.setMetric('war', function () { return t('rooms.war.metric', { count: agents.awaitingApproval() }); });

  const registerStaticInspectables = () => {
    registerInspectable({
      id: 'manager', kind: 'manager', title: t('rooms.manager.name'), subtitle: t('rooms.manager.subtitle'), color: 0xa66bff, object: manager,
      focusOffset: new THREE.Vector3(0, 1.2, -1.3), radius: 2.6, agents: [{ id: 'manager', name: modelLabel(getManagerModel()), role: t('rooms.manager.role') }]
    });
    registerInspectable({
      id: 'server', kind: 'server', title: t('rooms.aiCore.name'), subtitle: t('rooms.aiCore.subtitle'), color: 0x2fb8ff, object: server,
      focusOffset: new THREE.Box3().setFromObject(server).getCenter(new THREE.Vector3()).setY(1.4), radius: 2.4, agents: [{ id: 'server', name: 'AI Core', role: t('rooms.aiCore.role') }],
      onSelect: () => quotaUi.open(),
      placeholder: t('inspector.placeholders.serverCommand'),
      actions: [
        { label: t('inspector.actions.serverQuotas'), icon: 'gauge', onClick: function () { quotaUi.open(); } }
      ]
    });
  };
  registerStaticInspectables();
  onLanguageChange(registerStaticInspectables);


  // dinamik ofis: masalar kayıt defterinden gelir
  const registry = new OfficeRegistry();
  const STORAGE_KEY = 'nexus_projects_v1';

  function saveProjects(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(registry.projects()));
    } catch {}
  }

  function loadPersistedProjects(): ProjectSpec[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  registry.on(function (e) {
    if (e.type === 'floor') {
      env.extendFloor(e.extraDepth);
      rooms.setWalkwayExtra(e.extraDepth);
      viewScaleGoal = 1 + e.extraDepth * 0.03;
    } else if (e.type === 'added' || e.type === 'removed' || e.type === 'agent_added' || e.type === 'agent_removed') {
      saveProjects();
    }
  });
  initDesks(scene, registry, {
    landed: function (info) { agents.attachDesk(info.spec, info.slot, info.screens); },
    changed: function (info) { agents.syncDesk(info.spec, info.slot, info.screens); },
    removing: function (info, done) { agents.detachDesk(info.spec.id, done); }
  });
  // yeni masa gökten inerken kamera ona yumuşakça odaklanır
  const projectDialog = initProjectDialog({ registry: registry, onCreated: function (id) { window.setTimeout(function () { inspector?.focus(id); }, 450); } });
  inspector = initInspector({ scene: scene, dom: renderer.domElement, camera: camera, controls: controls, registry: registry, agents: agents, tasksBoard, projectDialog, quotaUi });
  mountTestModeToggle(toolbarEl, (active) => inspector?.setTestMode(active));
  (window as unknown as { nexusOffice: unknown }).nexusOffice = {
    dayNight: env.dayNight,
    addProject: function (spec: ProjectSpec) { return registry.addProject(spec); },
    removeProject: function (id: string) { return registry.removeProject(id); },
    projects: function () { return registry.projects(); },
    agents: agents,
    quota: quota,
    setTestMode: function (on: boolean) { inspector?.setTestMode(on); },
    openQuota: function () { (inspector && inspector.focus('server')) || quotaUi.open(); },
    openTasks: () => inspector?.focus('whiteboard'),
    focus: function (id: string, agent?: string) { return inspector ? inspector.focus(id, agent) : false; },
    openProjectDialog: () => projectDialog.open(),
    loadDemoProjects: function () {
      LEGACY_DEMO_PROJECTS.forEach(function (p) {
        try { registry.addProject(p); } catch {}
      });
    },
    clearProjects: function () {
      registry.projects().forEach(function (p) {
        registry.removeProject(p.id);
      });
      saveProjects();
    },
    /** İleride aktif sohbet oturumlarını (ChatGPT Web, Claude Code, Codex vb.) 3D ofise dinamik bağlama */
    loadActiveSessions: function (sessions: ProjectSpec[]) {
      sessions.forEach(function (spec) {
        try { registry.addProject(spec); } catch {}
      });
    },
    /** geliştirici/test: render etmeden simülasyonu saniye ilerletir (sahte saat dahil) */
    advance: function (sec: number) {
      const step = 1 / 30; let tt = lastT;
      for (let i = 0; i < sec / step; i++) { tt += step; advanceClock(step * 1000); for (let k = 0; k < updaters.length; k++) updaters[k](tt, step); }
      lastT = tt;
    }
  };

  // Açılışta sabit demo masaları otomatik açılmaz; kullanıcı projeleri veya kaydedilmiş oturumlar yüklenir.
  // Geliştirme/test amacıyla '?demo=1' parametresi ile demo masalar açılabilir.
  const persisted = loadPersistedProjects();
  if (persisted.length > 0) {
    persisted.forEach(function (p) {
      try { registry.addProject(p); } catch {}
    });
  } else if (location.search.indexOf('demo=1') >= 0) {
    LEGACY_DEMO_PROJECTS.forEach(function (p) {
      try { registry.addProject(p); } catch {}
    });
  }

  // ---- kota merkezi: sağlayıcının 5 saatlik kotası dolunca ajanları lounge'a gönderir, yenilenince geri çağırır ----
  quota.start();
  const quotaSent = new Set<string>(); // yalnızca kota yüzünden gönderilen ajanlar geri çağrılır (elle gönderilenlere dokunulmaz)
  const syncQuota = function (): void {
    (['antigravity', 'chatgpt', 'claude'] as ProviderId[]).forEach(function (pid) {
      const ids = agents.idsByModels(PROVIDER_MODELS[pid]);
      if (quota.isLimited(pid)) {
        const w = windowOf(providerOf(quota.state, pid), '5h');
        const ms = w ? Math.max(1000, w.resetAt - Date.now()) : 3600000;
        ids.forEach(function (id) { const s = agents.getState(id); if (s && s.availability === 'available') { quotaSent.add(id); agents.rateLimit(id, ms); } });
      } else {
        ids.forEach(function (id) { if (quotaSent.has(id)) { quotaSent.delete(id); agents.recall(id); } });
      }
    });
  };
  quota.on(function (_s, events) { if (events.length) syncQuota(); });
  window.setInterval(syncQuota, 3000); // sonradan eklenen masalar için de kota durumu uygulanır

  if (location.search.indexOf('clipcheck') >= 0) installClipCheck(scene);

  const clock = new THREE.Clock();
  updaters.push(function (_t, dt) {
    if (Math.abs(viewScaleGoal - viewScale) > 0.0005) { viewScale += (viewScaleGoal - viewScale) * Math.min(1, dt * 3); resize(); }
  });
  renderer.setAnimationLoop(function () {
    const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime; lastT = t;
    for (let i = 0; i < updaters.length; i++) updaters[i](t, dt);
    controls.update();
    renderer.render(scene, camera);
  });
}

try {
  start();
} catch (e) {
  console.error(e);
  showError();
}
