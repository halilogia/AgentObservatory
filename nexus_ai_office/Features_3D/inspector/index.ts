// Click-to-inspect: Raycaster ile masa/robot seçimi, kamera yaklaşması, sağdan kayan glassmorphism çekmece.
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { inspectables, pickables, onTick, simNow, Inspectable, MAX_AGENTS_PER_DESK, ENGINES, modelLabel, engineOfModel } from '../../core';
import type { OfficeRegistry, AgentControl, AgentRuntimeState, ModelId } from '../../core';
import { icon } from '../../shared';
import { t, onLanguageChange } from '../../core/i18n';
import { feed, AgentSnapshot, LogLine, LogLevel } from './agent-feed';

const ZOOM_FOCUS = 1.9;
const TWEEN_MS = 850;
const DRAG_PX = 5;

interface Tween {
  t0: number; fromT: THREE.Vector3; fromZoom: number; toZoom: number;
  /** bakış vektörü (hedef → kamera): başlangıç ve bitiş; aradaki geçiş lerp ile yumuşatılır */
  viewFrom: THREE.Vector3; viewTo: THREE.Vector3; goal: () => THREE.Vector3;
}

export interface InspectorOptions {
  scene: THREE.Scene;
  dom: HTMLElement;
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  registry: OfficeRegistry;
  /** robot çalışma zamanı köprüsü (yoksa robot kontrolleri gizlenir) */
  agents?: AgentControl;
  tasksBoard?: { open: () => void; close: () => void; isOpen?: () => boolean };
  projectDialog?: { open: () => void; close?: () => void };
  quotaUi?: { open: () => void; close: () => void };
}

export type InspectorContext = InspectorOptions;

/** simülatör (faaliyet/limit/bağlantı) butonları test modunda görünür: ?test, ?dev ya da localStorage nexus_test_mode=true */
export function detectTestMode(): boolean {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search);
  if (q.has('test') || q.has('dev')) return true;
  try {
    const ls = localStorage.getItem('nexus_test_mode');
    if (ls !== null) return ls === 'true';
  } catch (e) {}
  return false; // varsayılan kapalı (false)
}

let currentTestMode = detectTestMode();
export function isTestModeActive(): boolean { return currentTestMode; }

const testModeListeners: ((active: boolean) => void)[] = [];
export function onTestModeChange(fn: (active: boolean) => void): () => void {
  testModeListeners.push(fn);
  return () => {
    const idx = testModeListeners.indexOf(fn);
    if (idx >= 0) testModeListeners.splice(idx, 1);
  };
}

export function setTestModeActive(on: boolean): void {
  currentTestMode = on;
  try { localStorage.setItem('nexus_test_mode', String(on)); } catch (e) {}
  testModeListeners.forEach(fn => fn(on));
}

export function mountTestModeToggle(container: HTMLElement, onToggle?: (active: boolean) => void): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tbtn test-mode-btn' + (currentTestMode ? ' active' : '');
  btn.id = 'test-mode-btn';

  const render = () => {
    btn.setAttribute('aria-pressed', String(currentTestMode));
    btn.setAttribute('title', t('toolbar.testModeShortcut'));
    btn.className = 'tbtn test-mode-btn' + (currentTestMode ? ' active' : '');
    btn.innerHTML = icon('flask') + `<span style="font-weight: 800; font-size: 13px;">${t('toolbar.testMode')}: <b>${currentTestMode ? t('toolbar.on') : t('toolbar.off')}</b></span>`;
  };

  btn.onclick = () => {
    const next = !currentTestMode;
    setTestModeActive(next);
    if (onToggle) onToggle(next);
  };

  // Kısayol: Ctrl+Shift+T veya Alt+T ile test modunu başlat/durdur
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 't') || (e.altKey && e.key.toLowerCase() === 't')) {
        e.preventDefault();
        const next = !currentTestMode;
        setTestModeActive(next);
        if (onToggle) onToggle(next);
      }
    });
  }

  render();
  onTestModeChange(render);
  onLanguageChange(render);
  container.appendChild(btn);
  return btn;
}

/** çekmece görünümü: proje masası özeti, ajan CLI terminali ya da tek ajanlı nesne (oda, sunucu, personel) */
type DrawerMode = 'project' | 'agent' | 'single';

function hex(c: number): string { return '#' + new THREE.Color(c).getHexString(); }
function ease(p: number): number { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
function clock(t: number): string { const d = new Date(t); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return String(n).padStart(2, '0'); }).join(':'); }

function copyText(text: string): boolean {
  if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).catch(function () { /* yoksay */ }); return true; }
  const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove(); return ok;
}

export { feed } from './agent-feed';

export interface Inspector {
  /** verilen masa/bot kimliğine kamerayı yumuşakça odaklar ve çekmeceyi açar */
  focus: (inspectId: string, agentId?: string) => boolean;
  deselect: () => void;
  setTestMode: (on: boolean) => void;
}

export function initInspector(ctx: InspectorContext): Inspector {
  const { dom, camera, controls, scene, registry, agents } = ctx;
  feed.start();
  // ajan akışlarını kayıt defterine göre kur / kaldır (inspector, masaları doğrudan tanımaz)
  registry.on(function (e) {
    if (e.type === 'added') e.project.agents.forEach(function (a) { feed.configure(a.id, { task: a.task || '', kind: e.project.icon, name: a.name, role: a.role, model: a.model }); });
    else if (e.type === 'removed') e.project.agents.forEach(function (a) { feed.forget(a.id); });
    else if (e.type === 'agent_added' || e.type === 'agent_removed') {
      if (e.type === 'agent_added') feed.configure(e.agent.id, { task: e.agent.task || '', kind: e.project.icon, name: e.agent.name, role: e.agent.role, model: e.agent.model });
      else feed.forget(e.agent.id);
      if (sel?.projectId === e.project.id) {
        sel.agents = e.project.agents.map(a => ({ id: a.id, name: a.name, role: a.role || a.model }));
        focusObj = null;
        openDrawer(sel, e.type === 'agent_added' ? e.agent.id : agentId, mode === 'single' ? undefined : (mode === 'agent' && e.type === 'agent_removed' && !sel.agents.some(function (a) { return a.id === agentId; }) ? 'project' : mode));
      }
    }
  });

  // ---------- çekmece DOM ----------
  const drawer = document.createElement('aside');
  drawer.id = 'drawer'; drawer.setAttribute('aria-hidden', 'true');
  drawer.innerHTML =
    '<header><span class="dot"></span><div class="who"><h2></h2><p></p></div><button class="x" title="' + t('common.closeEsc') + '" aria-label="' + t('common.close') + '">' + icon('close') + '</button></header>' +
    '<nav class="tabs" role="tablist"></nav><button type="button" class="back" hidden></button><section class="roster" hidden></section>' +
    '<section class="approval" hidden></section><section class="task"><div class="lbl">' + t('inspector.currentTask') + '</div><div class="task-name"></div><div class="metric" hidden></div><div class="statebar" hidden></div>' +
    '<div class="phases"></div><div class="bar"><i></i></div></section>' +
    '<section class="logbox"><div class="lbl"><span class="log-title">' + t('inspector.eventLog') + '</span><span class="live"></span><button class="copy">' + t('common.copy') + '</button></div>' +
    '<pre class="log" tabindex="0"></pre><pre class="diff" hidden></pre></section>' +
    '<section class="agentctl" hidden></section><section class="actions"></section>' +
    '<form class="chat"><textarea rows="2" placeholder="' + t('inspector.chatPlaceholder') + '"></textarea><button type="submit">' + t('common.send') + '</button></form>';
  document.body.appendChild(drawer);
  const q = function <T extends HTMLElement>(s: string): T { return drawer.querySelector(s) as T; };
  const el = {
    dot: q<HTMLElement>('.dot'), title: q<HTMLElement>('h2'), sub: q<HTMLElement>('.who p'), close: q<HTMLElement>('.x'),
    tabs: q<HTMLElement>('.tabs'), roster: q<HTMLElement>('.roster'), back: q<HTMLButtonElement>('.back'), metric: q<HTMLElement>('.metric'), task: q<HTMLElement>('.task-name'), phases: q<HTMLElement>('.phases'), bar: q<HTMLElement>('.bar i'),
    logTitle: q<HTMLElement>('.log-title'), log: q<HTMLElement>('.log'), diff: q<HTMLElement>('.diff'), live: q<HTMLElement>('.live'), copy: q<HTMLElement>('.copy'),
    actions: q<HTMLElement>('.actions'), statebar: q<HTMLElement>('.statebar'), approval: q<HTMLElement>('.approval'), agentctl: q<HTMLElement>('.agentctl'),
    form: q<HTMLFormElement>('.chat'), input: q<HTMLTextAreaElement>('.chat textarea')
  };

  // ---------- durum ----------
  let mode: DrawerMode = 'single';
  let sel: Inspectable | null = null;
  let stopBtn: HTMLButtonElement | null = null;   // yalnızca proje/yönetici bağlamında var
  let selZoom = ZOOM_FOCUS;
  let focusObj: THREE.Object3D | null = null; // masadan ayrı bir robotu takip ederken
  let selKey = '';
  let agentId = '';
  let rendered = 0;
  let tween: Tween | null = null;
  let home: { pos: THREE.Vector3; target: THREE.Vector3; zoom: number } | null = null;
  const lastFocus = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const viewNow = new THREE.Vector3();

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 56), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.renderOrder = 5;
  scene.add(ring);

  const BOT_OFFSET = new THREE.Vector3(0, 0.8, 0);
  function focusOf(i: Inspectable): THREE.Vector3 {
    if (focusObj) return focusObj.getWorldPosition(new THREE.Vector3()).add(BOT_OFFSET);
    return i.object.getWorldPosition(new THREE.Vector3()).add(i.focusOffset);
  }

  /** çekmece solda açıkken nesne ekranın sağındaki boş kısmın ortasında dursun */
  function shiftVec(): THREE.Vector3 {
    if (window.innerWidth < 760) return new THREE.Vector3();
    const pxPerUnit = window.innerHeight / ((camera.top - camera.bottom) / selZoom);
    const right = tmp.setFromMatrixColumn(camera.matrixWorld, 0); right.y = 0; right.normalize();
    return right.multiplyScalar(-drawer.offsetWidth / 2 / pxPerUnit);
  }

  function startTween(goal: () => THREE.Vector3, toZoom: number, viewTo?: THREE.Vector3): void {
    const viewFrom = camera.position.clone().sub(controls.target); // kullanıcının O ANKİ bakışı
    tween = {
      t0: performance.now(), fromT: controls.target.clone(), fromZoom: camera.zoom, toZoom: toZoom,
      viewFrom: viewFrom, viewTo: viewTo || viewFrom.clone(), goal: goal
    };
  }

  // ---------- çekmece içeriği ----------
  function lineEl(l: LogLine): HTMLElement {
    const d = document.createElement('div'); d.className = 'ln ' + l.level;
    const tEl = document.createElement('span'); tEl.className = 'ts'; tEl.textContent = clock(l.t);
    const m = document.createElement('span'); m.textContent = (l.level === 'user' ? t('inspector.youPrefix') : l.level === 'agent' ? t('inspector.agentPrefix') : '') + l.text;
    d.append(tEl, m); return d;
  }

  function metricOf(i: Inspectable): string { return typeof i.metric === 'function' ? i.metric() : (i.metric ? i.metric + ' · demo' : ''); }

  const stateLabel = (key: string): string => t('inspector.states.' + key, { defaultValue: key });
  function chip(label: string, value: string, cls?: string): string { return '<span class="chip ' + (cls || '') + '"><i>' + label + '</i>' + value + '</span>'; }

  /** operasyonel durum (kota/yürütme/faaliyet) ve fiziksel konum AYRI rozetlerle gösterilir */
  function renderStateBar(): void {
    const st: AgentRuntimeState | undefined = agents && agentId ? agents.getState(agentId) : undefined;
    el.statebar.hidden = !st;
    if (!st) return;
    let cd = '';
    if (st.availability === 'rate_limited' && st.cooldownUntil !== undefined) {
      const sec = Math.max(0, Math.ceil((st.cooldownUntil - simNow()) / 1000));
      cd = chip(t('inspector.chips.cooldown'), t('inspector.chips.cooldownSec', { sec }), 'warn');
    }
    el.statebar.innerHTML =
      chip(t('inspector.chips.quota'), stateLabel(st.availability), st.availability === 'rate_limited' ? 'warn' : st.availability === 'unknown' ? 'dim' : '') +
      (st.connection === 'lost' ? chip(t('inspector.chips.connection'), t('inspector.chips.connectionLost'), 'warn') : '') +
      chip(t('inspector.chips.execution'), stateLabel(st.execution)) +
      chip(t('inspector.chips.activity'), stateLabel(st.activity)) +
      chip(t('inspector.chips.location'), stateLabel(st.navigation)) + cd;
  }

  function setBtn(b: HTMLButtonElement, ic: string, text: string): void { b.innerHTML = icon(ic, 16) + '<span>' + text + '</span>'; }

  /** seçili masa ajanı için robot kontrolleri: kota doldur / masaya çağır / faaliyet simülatörü */
  /** CLI onay kartı: awaiting_approval iken en üstte; Onayla (Y) / Reddet (N) + isteğe bağlı yanıt */
  function renderApproval(): void {
    const st = agents && agentId ? agents.getState(agentId) : undefined;
    const need = !!st && st.execution === 'awaiting_approval' && !!agents;
    el.approval.hidden = !need;
    if (!need || !st || !agents) { el.approval.innerHTML = ''; return; }
    const prev = el.approval.querySelector('input') as HTMLInputElement | null;
    if (prev && el.approval.dataset.agent === agentId && el.approval.dataset.cmd === (st.approval ? st.approval.command : '')) return; // yazılan yanıt kaybolmasın
    el.approval.dataset.agent = agentId; el.approval.dataset.cmd = st.approval ? st.approval.command : '';
    el.approval.innerHTML = '<div class="apr-h">' + icon('shield', 16) + '<b>' + t('inspector.approval.title') + '</b></div>' +
      '<div class="apr-l">' + t('inspector.approval.command') + '</div><pre class="apr-cmd"></pre>' +
      '<input class="apr-note" type="text" placeholder="' + t('inspector.approval.notePlaceholder') + '">' +
      '<div class="apr-b"><button type="button" class="ok"></button><button type="button" class="no"></button></div>';
    (el.approval.querySelector('.apr-cmd') as HTMLElement).textContent = st.approval ? st.approval.command : '';
    const ok = el.approval.querySelector('.ok') as HTMLButtonElement, no = el.approval.querySelector('.no') as HTMLButtonElement;
    setBtn(ok, 'play', t('inspector.approval.approve')); setBtn(no, 'close', t('inspector.approval.reject'));
    const note = el.approval.querySelector('.apr-note') as HTMLInputElement;
    ok.addEventListener('click', function () { agents.approve(agentId, 'approve', note.value.trim() || undefined); });
    no.addEventListener('click', function () { agents.approve(agentId, 'reject', note.value.trim() || undefined); });
  }

  function renderAgentCtl(): void {
    const st = agents && agentId && currentTestMode && mode !== 'project' ? agents.getState(agentId) : undefined;
    el.agentctl.hidden = !st; el.agentctl.innerHTML = '';
    el.agentctl.style.display = st ? '' : 'none'; // test modunda simülatör butonları görünür
    if (!st || !agents) return;
    const mk = function (ic: string, text: string, cls: string, run: () => void): void {
      const b = document.createElement('button'); b.type = 'button'; b.className = cls; setBtn(b, ic, text); b.addEventListener('click', run); el.agentctl.appendChild(b);
    };
    const away = st.navigation !== 'seated';
    mk('bolt', t('inspector.controls.limitBreak'), 'wide limit', function () { agents.rateLimit(agentId, 30000); });
    mk(away || st.availability !== 'available' ? 'desk' : 'play', away || st.availability !== 'available' ? t('inspector.controls.recallDesk') : t('inspector.controls.startTask'), 'wide call', function () { agents.recall(agentId); });
    ([
      ['reasoning', 'brain', t('inspector.controls.think')],
      ['reading', 'book', t('inspector.controls.read')],
      ['coding', 'code', t('inspector.controls.code')],
      ['testing', 'flask', t('inspector.controls.test')],
      ['obsidian', 'book', t('inspector.controls.obsidian')],
      ['web_chatgpt', 'search', t('inspector.controls.webChatgpt')],
      ['planning', 'chart', t('inspector.controls.plan')]
    ] as [string, string, string][]).forEach(function (a) {
      mk(a[1], a[2], 'act' + (st.activity === a[0] ? ' on' : ''), function () {
        agents.setActivity(agentId, a[0] as never);
        const pIdx = a[0] === 'reasoning' ? 0 : (a[0] === 'reading' || a[0] === 'obsidian' || a[0] === 'web_chatgpt') ? 1 : a[0] === 'coding' ? 2 : a[0] === 'testing' ? 3 : -1;
        if (pIdx >= 0) feed.setPhase(agentId, pIdx);
      });
    });
  }

  function renderStatus(s: AgentSnapshot): void {
    const isProjectName = sel && (s.task === sel.title || s.task === sel.projectId);
    const activePhase = s.phases && s.phases[s.phase] ? s.phases[s.phase] : '';
    el.task.textContent = (!s.task || isProjectName) ? (activePhase ? activePhase + '…' : t('inspector.waitingTask')) : s.task;
    el.phases.innerHTML = '';
    s.phases.forEach(function (p, i) {
      const c = document.createElement('button');
      c.type = 'button';
      c.textContent = p;
      c.className = 'phase-btn' + (i < s.phase ? ' done' : i === s.phase ? ' now' : '');
      c.title = p;
      c.addEventListener('click', function () {
        if (agents && agentId) {
          const acts = ['reasoning', 'reading', 'coding', 'testing'];
          if (acts[i]) {
            agents.setActivity(agentId, acts[i] as never);
            feed.setPhase(agentId, i);
          }
        }
      });
      el.phases.appendChild(c);
    });
    el.bar.style.width = Math.round(((s.phase + s.progress) / s.phases.length) * 100) + '%';
    if (stopBtn) { setBtn(stopBtn, s.paused ? 'play' : 'pause', s.paused ? t('inspector.actions.resume') : t('inspector.actions.pause')); stopBtn.classList.toggle('paused', s.paused); }
    if (mode === 'agent') {
      el.live.textContent = t('inspector.cliActive');
      el.live.classList.add('on');
    } else {
      el.live.textContent = s.paused ? t('inspector.paused') : t('inspector.liveStream');
      el.live.classList.toggle('on', !s.paused);
    }
  }

  function renderLog(s: AgentSnapshot, reset: boolean): void {
    if (reset) { el.log.innerHTML = ''; rendered = s.total - s.lines.length; }
    const fresh = s.total - rendered; if (fresh <= 0) return;
    const near = el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 40;
    const from = Math.max(0, s.lines.length - fresh);
    for (let i = from; i < s.lines.length; i++) el.log.appendChild(lineEl(s.lines[i]));
    rendered = s.total;
    while (el.log.childElementCount > 400) el.log.firstElementChild!.remove();
    if (near || reset) el.log.scrollTop = el.log.scrollHeight;
  }

  function selectAgent(id: string): void {
    agentId = id;
    Array.prototype.forEach.call(el.tabs.children, function (b: HTMLElement) { b.classList.toggle('on', b.dataset.id === id); b.setAttribute('aria-selected', String(b.dataset.id === id)); });
    el.input.value = '';
    el.diff.hidden = true; el.log.hidden = false; drawer.classList.remove('diffon');
    const a = sel!.agents.filter(function (x) { return x.id === id; })[0];
    if (a) {
      feed.configure(id, { task: a.role || '', kind: 'agent', name: a.name, role: a.role });
      if (mode === 'agent') {
        el.title.textContent = a.name;
        el.sub.textContent = t('inspector.deskProject') + ': ' + sel!.title + ' · ' + (a.role || a.name);
        el.logTitle.textContent = a.name + ' · ' + t('inspector.cliSession');
        el.live.textContent = t('inspector.cliActive');
        el.live.classList.add('on');
      } else {
        el.title.textContent = sel!.title;
        el.sub.textContent = sel!.subtitle;
        el.logTitle.textContent = t('inspector.eventLog');
      }
    }
    const s = feed.snapshot(id);
    renderStatus(s); renderLog(s, true);
    renderStateBar(); renderAgentCtl(); renderApproval();
  }

  // ---------- bağlama duyarlı eylemler ----------
  function addAction(label: string, ic: string, cls: string, run: (b: HTMLButtonElement) => void): HTMLButtonElement {
    const b = document.createElement('button'); b.type = 'button'; b.className = cls; setBtn(b, ic, label);
    b.addEventListener('click', function () { run(b); }); el.actions.appendChild(b); return b;
  }
  function togglePause(): void {
    const ids = mode === 'project' && sel ? sel.agents.map(function (a) { return a.id; }) : [agentId]; // masa görünümünde masadaki tüm ajanlar
    const pause = !ids.every(function (id) { return feed.snapshot(id).paused; });
    ids.forEach(function (id) { feed.setPaused(id, pause); });
  }

  /** Eylemler seçilen nesnenin türüne göre kurulur; simüle sonuçlar [demo] etiketiyle günlüğe yazılır (gerçek durum gibi sunulmaz). */
  function renderActions(i: Inspectable): void {
    el.actions.innerHTML = ''; stopBtn = null;
    const note = function (level: LogLevel, text: string): void { feed.note(agentId, level, text); };
    if (i.kind === 'room') {
      el.input.placeholder = i.placeholder || t('inspector.placeholders.roomNote');
    } else if (i.actions) { // türe özgü eylemler kayıt sırasında tanımlanır (sunucu, personel)
      el.input.placeholder = i.placeholder || t('inspector.placeholders.serverCommand');
      i.actions.forEach(function (ac) {
        addAction(ac.label, ac.icon || '', '', function () {
          if (ac.log) ac.log.forEach(function (l) { note(l[0], l[1]); });
          if (ac.effect === 'boost' && agents && agents.has(agentId)) { agents.boost(agentId, 1.8, 8000); note('ok', 'hız artırıldı (8 sn)'); }
          if (ac.onClick) ac.onClick();
        });
      });
    } else if (i.kind === 'manager') {
      el.input.placeholder = t('inspector.placeholders.agentInstruction');
      addAction(t('inspector.actions.newProject'), 'desk', 'primary', function () { ctx.projectDialog?.open(); });
      stopBtn = addAction(t('inspector.actions.pause'), 'pause', 'stop', togglePause);
      addAction(t('inspector.actions.statusSummary'), 'chart', '', function () { note('info', 'aktif proje: ' + registry.projects().length + ' · bekleyen onay: ' + (agents ? 0 : 1)); });
    } else {
      el.input.placeholder = t('inspector.placeholders.agentInstruction');
      stopBtn = addAction(t('inspector.actions.pause'), 'pause', 'stop', togglePause);
      const project = registry.projects().find(p => p.id === i.projectId);
      let addPop: HTMLElement | null = null;
      if (project && project.agents.length < MAX_AGENTS_PER_DESK) {
        addAction(t('inspector.actions.addAgent'), 'plus', 'add-agent', function () {
          if (addPop) { addPop.remove(); addPop = null; return; }
          addPop = document.createElement('div');
          addPop.className = 'agent-add-pop';
          addPop.innerHTML =
            '<div class="pop-title"><b>' + t('inspector.actions.selectModel') + '</b><button type="button" class="pop-x" aria-label="' + t('common.close') + '">&times;</button></div>' +
            '<div class="pop-engines">' +
            ENGINES.map(function (e) {
              return '<div class="pop-eng-group"><span class="eng-name">' + e.label + '</span><div class="pop-models">' +
                e.models.map(function (m) {
                  return '<button type="button" class="pop-mbtn" data-model="' + m.id + '">' + m.label + '</button>';
                }).join('') +
                '</div></div>';
            }).join('') +
            '</div>';
          el.actions.appendChild(addPop);
          addPop.querySelector('.pop-x')!.addEventListener('click', function () { addPop?.remove(); addPop = null; });
          addPop.querySelectorAll('.pop-mbtn').forEach(function (b) {
            b.addEventListener('click', function () {
              const modelId = b.getAttribute('data-model')!;
              const engine = (engineOfModel(modelId) || 'antigravity') as ModelId;
              let n = 0;
              const used = new Set(registry.projects().flatMap(function (p) { return p.agents.map(function (a) { return a.id; }); }));
              while (used.has(project.id + ':' + n)) n++;
              registry.addAgent(project.id, {
                id: project.id + ':' + n,
                name: modelLabel(modelId),
                model: engine,
                modelId: modelId
              });
              addPop?.remove(); addPop = null;
            });
          });
        });
      }
      if (project && project.agents.length > 1) {
        addAction(t('inspector.actions.removeAgent'), 'minus', 'remove-agent', function () { registry.removeAgent(project.id, agentId); });
      }
      addAction(t('inspector.actions.closeDesk'), 'trash', 'danger', function () { if (i.projectId) registry.removeProject(i.projectId); });
    }
  }

  /** proje masası görünümü: masadaki ajanların listesi; satır seçer, CLI düğmesi ajanın terminalini açar */
  function renderRoster(): void {
    el.roster.hidden = mode !== 'project' || !sel; el.roster.innerHTML = '';
    if (mode !== 'project' || !sel) return;
    const head = document.createElement('div'); head.className = 'r-h'; head.textContent = t('inspector.roster.title') + ' · ' + sel.agents.length; el.roster.appendChild(head);
    sel.agents.forEach(function (a) {
      const st = agents ? agents.getState(a.id) : undefined;
      const row = document.createElement('div'); row.className = 'r-row' + (a.id === agentId ? ' on' : '');
      const nm = document.createElement('span'); nm.className = 'r-n'; nm.textContent = a.name;
      const rl = document.createElement('span'); rl.className = 'r-r'; rl.textContent = a.role;
      const need = !!st && st.execution === 'awaiting_approval';
      const sx = document.createElement('span'); sx.className = 'r-s' + (need ? ' warn' : ''); sx.textContent = st ? (need ? t('inspector.roster.approval') : stateLabel(st.activity)) : '';
      const go = document.createElement('button'); go.type = 'button'; go.className = 'r-go'; setBtn(go, 'terminal', t('inspector.roster.openCli'));
      row.append(nm, rl, sx, go);
      row.addEventListener('click', function () { agentId = a.id; renderRoster(); });
      go.addEventListener('click', function (ev) { ev.stopPropagation(); if (sel) select(sel, a.id, 'agent'); });
      el.roster.appendChild(row);
    });
  }
  el.back.addEventListener('click', function () { if (sel) select(sel, agentId, 'project'); });

  function openDrawer(i: Inspectable, preferAgent?: string, wanted?: DrawerMode): void {
    const cssColor = hex(i.color);
    const desk = i.kind !== 'room' && !i.actions && i.kind !== 'manager' && i.agents.length > 0;
    mode = !desk ? 'single' : (wanted || (preferAgent ? 'agent' : 'project'));
    drawer.dataset.mode = mode; drawer.classList.remove('diffon');
    drawer.style.setProperty('--accent', cssColor);
    el.title.textContent = i.title;
    const m = metricOf(i); el.metric.hidden = !m; el.metric.textContent = m;
    el.tabs.innerHTML = '';
    el.tabs.hidden = true; // Agente tıklandığında üstteki ajan butonlarını kaldır, doğrudan o ajanın bilgilerini göster
    el.back.hidden = mode !== 'agent'; setBtn(el.back, 'back', t('inspector.backToDesk'));
    el.diff.hidden = true; el.log.hidden = false;
    sel = i;
    renderActions(i);
    selectAgent(preferAgent && i.agents.some(function (a) { return a.id === preferAgent; }) ? preferAgent : i.agents[0].id);
    renderRoster();
    drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); document.body.classList.add('has-drawer');
  }

  // ---------- seçim / kapanış ----------
  function select(i: Inspectable, preferAgent?: string, wanted?: DrawerMode): void {
    if (i.kind === 'board') {
      drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); document.body.classList.remove('has-drawer');
      sel = i; focusObj = null; selKey = i.id; selZoom = i.zoom || ZOOM_FOCUS;
      ring.visible = false;
      if (!home) home = { pos: camera.position.clone(), target: controls.target.clone(), zoom: camera.zoom };
      lastFocus.copy(focusOf(i));
      startTween(() => focusOf(i).add(shiftVec()), selZoom);
      if (i.onSelect) i.onSelect(); else ctx.tasksBoard?.open();
      return;
    }
    if (i.kind === 'server') {
      drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); document.body.classList.remove('has-drawer');
      sel = i; focusObj = null; selKey = i.id; selZoom = i.zoom || ZOOM_FOCUS;
      ring.visible = false;
      if (!home) home = { pos: camera.position.clone(), target: controls.target.clone(), zoom: camera.zoom };
      lastFocus.copy(focusOf(i));
      startTween(() => focusOf(i).add(shiftVec()), selZoom);
      if (i.onSelect) i.onSelect(); else ctx.quotaUi?.open();
      return;
    }
    ctx.tasksBoard?.close();
    ctx.quotaUi?.close();
    openDrawer(i, preferAgent, wanted);
    // ajan görünümünde seçilen ajan masasından ayrıysa (yürüyor / lounge'da) kamera robotu takip eder; masa görünümünde masa odaklanır
    const away = agents && agentId && mode !== 'project' ? agents.awayObject(agentId) : undefined;
    focusObj = away || null;
    const key = i.id + '|' + (away ? 'bot' : 'desk');
    (ring.material as THREE.MeshBasicMaterial).color.set(i.color);
    ring.scale.setScalar(focusObj ? 0.8 : i.radius); ring.visible = true;
    if (key === selKey) return;
    selKey = key;
    selZoom = i.zoom || ZOOM_FOCUS;
    if (!home) home = { pos: camera.position.clone(), target: controls.target.clone(), zoom: camera.zoom };
    lastFocus.copy(focusOf(i));
    startTween(function () { return focusOf(i).add(shiftVec()); }, selZoom);
  }

  function deselect(): void {
    ctx.tasksBoard?.close();
    ctx.quotaUi?.close();
    drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); document.body.classList.remove('has-drawer');
    if (!sel) return;
    sel = null; focusObj = null; selKey = ''; ring.visible = false;
    if (home) {
      const h = home; home = null;
      // kullanıcının çevirdiği açı korunur; yalnızca hedef/zoom ana görünüme döner, mesafe ana mesafeye yumuşar
      const dir = camera.position.clone().sub(controls.target).normalize();
      startTween(function () { return h.target; }, h.zoom, dir.multiplyScalar(h.pos.distanceTo(h.target)));
    }
  }

  // ---------- Raycaster ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(ev: PointerEvent): { i: Inspectable; agent?: string } | null {
    const r = dom.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const roots = inspectables.map(function (x) { return x.object; }).concat(pickables.map(function (x) { return x.object; }));
    const hits = ray.intersectObjects(roots, true);
    for (let h = 0; h < hits.length; h++) {
      if (!hits[h].object.visible) continue;
      let agent: string | undefined, id: string | undefined;
      for (let o: THREE.Object3D | null = hits[h].object; o; o = o.parent) {
        if (!agent && o.userData.agentId) agent = o.userData.agentId as string;
        if (o.userData.inspectId) { id = o.userData.inspectId as string; break; }
      }
      const found = inspectables.filter(function (x) { return x.id === id; })[0];
      if (found) return { i: found, agent: agent };
    }
    return null;
  }

  let down: { x: number; y: number } | null = null;
  dom.addEventListener('pointerdown', function (e) { if (e.button === 0) down = { x: e.clientX, y: e.clientY }; });
  dom.addEventListener('pointerup', function (e) {
    if (e.button !== 0 || !down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX; down = null;
    if (moved) return;
    const hit = pick(e);
    if (hit) select(hit.i, hit.agent); else deselect();
  });
  let hoverQueued = false;
  dom.addEventListener('pointermove', function (e) {
    if (hoverQueued || e.buttons) return; hoverQueued = true;
    requestAnimationFrame(function () { hoverQueued = false; dom.style.cursor = pick(e) ? 'pointer' : ''; });
  });
  controls.addEventListener('start', function () { tween = null; }); // kullanıcı kontrolü devralınca animasyon biter

  // ---------- çekmece olayları ----------
  el.close.addEventListener('click', deselect);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') deselect(); });
  // CLI onayı klavye kısayolları: Y onayla, N reddet (yazı alanındayken devre dışı)
  window.addEventListener('keydown', function (e) {
    if (!sel || !agents || !agentId || mode === 'project' || e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target as HTMLElement; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
    const st = agents.getState(agentId); if (!st || st.execution !== 'awaiting_approval') return;
    const k = e.key.toLowerCase();
    if (k === 'y' || k === 'n') { const note = el.approval.querySelector('.apr-note') as HTMLInputElement | null; agents.approve(agentId, k === 'y' ? 'approve' : 'reject', note && note.value.trim() ? note.value.trim() : undefined); }
  });
  el.copy.addEventListener('click', function () {
    const txt = Array.prototype.map.call(el.log.children, function (c: HTMLElement) { return c.textContent; }).join('\n');
    const ok = copyText(txt); el.copy.textContent = ok ? t('common.copied') : t('common.copy');
    setTimeout(function () { el.copy.textContent = t('common.copy'); }, 1400);
  });
  function submit(): void {
    const v = el.input.value.trim(); if (!v || !agentId) return;
    feed.send(agentId, v); el.input.value = '';
  }
  el.form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
  el.input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });

  onLanguageChange(function () {
    const taskLbl = drawer.querySelector('.task .lbl');
    if (taskLbl) taskLbl.textContent = t('inspector.currentTask');
    const logLbl = drawer.querySelector('.logbox .lbl > span');
    if (logLbl) logLbl.textContent = t('inspector.eventLog');
    el.copy.textContent = t('common.copy');
    const submitBtn = el.form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = t('common.send');
    el.close.setAttribute('title', t('common.closeEsc'));
    el.close.setAttribute('aria-label', t('common.close'));
    el.input.placeholder = t('inspector.chatPlaceholder');
    setBtn(el.back, 'back', t('inspector.backToDesk'));
    if (sel) {
      renderActions(sel); renderRoster();
      if (agentId) {
        const s = feed.snapshot(agentId);
        renderStatus(s);
        renderStateBar();
        renderAgentCtl();
      }
    }
  });

  if (agents) agents.onChange(function (id) {
    if (sel && id === agentId) { renderStateBar(); renderAgentCtl(); renderApproval(); }
    if (sel && mode === 'project' && sel.agents.some(function (a) { return a.id === id; })) renderRoster();
  });
  window.setInterval(function () { // cooldown geri sayımı + canlı oda/personel metrikleri
    if (!sel) return;
    const m = metricOf(sel); if (m) el.metric.textContent = m;
    renderStateBar(); if (mode === 'project') renderRoster();
  }, 1000);

  feed.onChange(function (id) {
    if (!sel || id !== agentId) return;
    const s = feed.snapshot(id); renderStatus(s); renderLog(s, false);
  });

  // ---------- her kare: kamera animasyonu + takip + halka ----------
  onTick(function (tSec) {
    if (sel && inspectables.indexOf(sel) < 0) deselect(); // seçili masa kaldırıldı
    if (tween) {
      const p = Math.min(1, (performance.now() - tween.t0) / TWEEN_MS), e = ease(p);
      const goal = tween.goal();
      controls.target.lerpVectors(tween.fromT, goal, e);
      camera.position.copy(controls.target).add(viewNow.lerpVectors(tween.viewFrom, tween.viewTo, e));
      camera.zoom = tween.fromZoom + (tween.toZoom - tween.fromZoom) * e; camera.updateProjectionMatrix();
      if (p >= 1) tween = null;
    } else if (sel) { // hareketli botu takip et
      const f = focusOf(sel); tmp.copy(f).sub(lastFocus);
      if (tmp.lengthSq() > 0) { controls.target.add(tmp); camera.position.add(tmp); }
    }
    if (sel) {
      lastFocus.copy(focusOf(sel));
      ring.position.set(lastFocus.x, 0.09, lastFocus.z);
      ring.scale.setScalar((focusObj ? 0.8 : sel.radius) * (1 + Math.sin(tSec * 3) * 0.03));
    }
  });

  return {
    deselect,
    focus: function (inspectId: string, agent?: string): boolean {
      const i = inspectables.filter(function (x) { return x.id === inspectId; })[0];
      if (!i) return false;
      select(i, agent); return true;
    },
    setTestMode: function (on: boolean): void {
      setTestModeActive(on);
      renderAgentCtl();
    }
  };
}
