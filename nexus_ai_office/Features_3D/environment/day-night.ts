import * as THREE from 'three';
import { icon } from '../../shared/icons';
import { t, onLanguageChange } from '../../core/i18n';

export type DayPhase = 'night' | 'dawn' | 'day' | 'sunset' | 'twilight';
export interface IstanbulTimeInfo {
  fractionalHour: number;
  hour: number;
  minute: number;
  second: number;
  phase: DayPhase;
  icon: string;
  label: string;
}
const phases = {
  night: ['moon', 'Gece'], dawn: ['sunrise', 'Şafak'], day: ['sun', 'Gündüz'],
  sunset: ['sunset', 'Günbatımı'], twilight: ['moon', 'Alacakaranlık']
};
const formatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false
});
function normalizeHour(h: number): number {
  if (!Number.isFinite(h)) throw new RangeError('Hour must be finite');
  return ((h % 24) + 24) % 24;
}
export function getIstanbulTime(manualHour?: number): IstanbulTimeInfo {
  let fractionalHour: number;
  if (manualHour === undefined) {
    const parts = formatter.formatToParts(new Date());
    const part = (name: string): number => Number(parts.find(p => p.type === name)!.value);
    fractionalHour = part('hour') % 24 + part('minute') / 60 + part('second') / 3600;
  } else fractionalHour = normalizeHour(manualHour);
  const hour = Math.floor(fractionalHour), totalSeconds = Math.floor(fractionalHour * 3600 + 1e-7);
  const phase: DayPhase = fractionalHour < 5.5 || fractionalHour >= 21 ? 'night'
    : fractionalHour < 7.5 ? 'dawn' : fractionalHour < 17.5 ? 'day'
    : fractionalHour < 19.5 ? 'sunset' : 'twilight';
  const label = t('toolbar.phases.' + phase, { defaultValue: phases[phase][1] });
  return { fractionalHour, hour, minute: Math.floor(totalSeconds / 60) % 60, second: totalSeconds % 60,
    phase, icon: phases[phase][0], label };
}

function frame(h: number, pos: number[], color: number, intensity: number, top: number, mid: number, bot: number, stars: number) {
  return { h, sunPos: new THREE.Vector3(...pos), sunColor: new THREE.Color(color), sunIntensity: intensity,
    fillPos: new THREE.Vector3(-pos[0], 6, 10), fillColor: new THREE.Color(stars > 0.5 ? 0x526bba : 0xbfd8ff),
    fillIntensity: 0.12 + (1 - stars) * 0.13, hemiSky: new THREE.Color(mid), hemiGround: new THREE.Color(stars > 0.5 ? 0x403950 : 0xd7a982),
    hemiIntensity: 0.3 + (1 - stars) * 0.55, top: new THREE.Color(top), mid: new THREE.Color(mid), bot: new THREE.Color(bot), stars };
}
const frames = [
  frame(0, [-9, 13, 5], 0x8ea8db, 0.35, 0x080e28, 0x19264c, 0x394468, 1),
  frame(5, [-9, 13, 5], 0x8ea8db, 0.35, 0x101830, 0x303752, 0x79647b, 1),
  frame(6, [-12, 4, 5], 0xff9e79, 0.65, 0x666b9f, 0xe6a39e, 0xffd4ae, 0.35),
  frame(7.3, [-9, 10, 5], 0xfff0d8, 1.05, 0x80bde9, 0xc4e4fa, 0xffead2, 0),
  frame(12, [9, 15, 5], 0xfff0d8, 1.15, 0x75b9ec, 0xb9e0fa, 0xe5f3ff, 0),
  frame(17.5, [12, 6, 5], 0xffc078, 1.1, 0x8c9bc9, 0xf6b486, 0xffd7a3, 0),
  frame(18.5, [14, 2, 5], 0xff6a36, 1, 0x695889, 0xe58065, 0xffbd7c, 0),
  frame(20, [3, 5, 5], 0xb9a0d8, 0.45, 0x252947, 0x575578, 0xac7e8d, 0.55),
  frame(21.5, [-9, 13, 5], 0x8ea8db, 0.35, 0x080e28, 0x19264c, 0x394468, 1),
  frame(24, [-9, 13, 5], 0x8ea8db, 0.35, 0x080e28, 0x19264c, 0x394468, 1)
];
export function lerpState(hour: number) {
  const h = normalizeHour(hour), i = frames.findIndex(f => f.h > h), a = frames[i - 1], b = frames[i];
  const t = (h - a.h) / (b.h - a.h), n = (x: number, y: number) => THREE.MathUtils.lerp(x, y, t);
  return { sunPos: a.sunPos.clone().lerp(b.sunPos, t), sunColor: a.sunColor.clone().lerp(b.sunColor, t), sunIntensity: n(a.sunIntensity, b.sunIntensity),
    fillPos: a.fillPos.clone().lerp(b.fillPos, t), fillColor: a.fillColor.clone().lerp(b.fillColor, t), fillIntensity: n(a.fillIntensity, b.fillIntensity),
    hemiSky: a.hemiSky.clone().lerp(b.hemiSky, t), hemiGround: a.hemiGround.clone().lerp(b.hemiGround, t), hemiIntensity: n(a.hemiIntensity, b.hemiIntensity),
    top: a.top.clone().lerp(b.top, t), mid: a.mid.clone().lerp(b.mid, t), bot: a.bot.clone().lerp(b.bot, t), stars: n(a.stars, b.stars) };
}
export function createNightStars(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const positions = new Float32Array(180 * 3);
  for (let i = 0; i < 180; i++) {
    const angle = i * 2.399963, radius = 35 + (i % 7) * 2;
    positions.set([Math.cos(angle) * radius, 8 + (i * 17 % 31), Math.sin(angle) * radius], i * 3);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xe5edff, size: 0.12, transparent: true, opacity: 0, depthWrite: false }));
}
export interface DayNightBindings {
  sun: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  stars?: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  sky?: THREE.CanvasTexture;
}
export class DayNightController {
  private mode: 'live' | 'manual' = 'live';
  private manualHour = 12;
  private state = lerpState(getIstanbulTime().fractionalHour);
  private toolbar?: HTMLElement;
  private uiKey = '';
  private paintElapsed = Infinity;
  constructor(private bindings: DayNightBindings) { this.update(0); }
  setMode(mode: 'live' | 'manual'): void {
    if (mode === 'manual' && this.mode === 'live') this.manualHour = this.getCurrentTime().fractionalHour;
    this.mode = mode; this.refreshToolbar();
  }
  setManualHour(h: number): void { this.manualHour = normalizeHour(h); this.mode = 'manual'; this.refreshToolbar(); }
  getMode(): 'live' | 'manual' { return this.mode; }
  getCurrentTime(): IstanbulTimeInfo { return getIstanbulTime(this.mode === 'manual' ? this.manualHour : undefined); }
  getPhase(): DayPhase { return this.getCurrentTime().phase; }
  update(dt: number): void {
    const target = lerpState(this.getCurrentTime().fractionalHour), alpha = 1 - Math.exp(-Math.max(0, dt) * 12);
    const s = this.state;
    for (const key of ['sunPos', 'fillPos'] as const) s[key].lerp(target[key], alpha);
    for (const key of ['sunColor', 'fillColor', 'hemiSky', 'hemiGround', 'top', 'mid', 'bot'] as const) s[key].lerp(target[key], alpha);
    for (const key of ['sunIntensity', 'fillIntensity', 'hemiIntensity', 'stars'] as const) s[key] = THREE.MathUtils.lerp(s[key], target[key], alpha);
    const { sun, fill, hemi, stars } = this.bindings;
    sun.position.copy(s.sunPos); sun.color.copy(s.sunColor); sun.intensity = s.sunIntensity;
    fill.position.copy(s.fillPos); fill.color.copy(s.fillColor); fill.intensity = s.fillIntensity;
    hemi.color.copy(s.hemiSky); hemi.groundColor.copy(s.hemiGround); hemi.intensity = s.hemiIntensity;
    if (stars) stars.material.opacity = s.stars * 0.9;
    this.paintElapsed += Math.max(0, dt);
    if (this.paintElapsed >= 1 / 20) {
      this.paintElapsed = 0;
      if (typeof document !== 'undefined') document.body.style.background = `linear-gradient(180deg, ${s.top.getStyle()} 0%, ${s.mid.getStyle()} 38%, ${s.bot.getStyle()} 100%)`;
      this.paintSky(); this.refreshToolbar();
    }
  }
  private paintSky(): void {
    const tex = this.bindings.sky;
    if (!tex) return;
    const canvas = tex.image as HTMLCanvasElement, c = canvas.getContext('2d');
    if (!c) return;
    const s = this.state, w = canvas.width, h = canvas.height;
    const gradient = c.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, s.top.getStyle()); gradient.addColorStop(0.5, s.mid.getStyle()); gradient.addColorStop(1, s.bot.getStyle());
    c.globalAlpha = 1; c.fillStyle = gradient; c.fillRect(0, 0, w, h);
    c.globalAlpha = 1 - s.stars; c.fillStyle = '#fff2ac'; c.beginPath(); c.arc(w * 0.23, h * 0.24, 12, 0, Math.PI * 2); c.fill();
    c.fillStyle = s.sunColor.clone().lerp(new THREE.Color(0xffffff), 0.65).getStyle();
    for (const [x, y, r] of [[34, 78, 16], [52, 72, 20], [72, 80, 15], [96, 45, 11], [108, 49, 9]]) {
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = s.stars; c.fillStyle = '#e5edff';
    for (let i = 0; i < 35; i++) c.fillRect((i * 47 + 7) % w, (i * 31 + 13) % h, 1.3, 1.3);
    // Two arcs form a crescent without erasing the gradient behind it.
    c.beginPath(); c.arc(33, 30, 12, Math.PI / 2, Math.PI * 1.5); c.bezierCurveTo(30, 20, 30, 40, 33, 42); c.fill();
    c.globalAlpha = 1; tex.needsUpdate = true;
  }
  mountToolbar(container: HTMLElement): void {
    this.toolbar?.remove();
    const root = document.createElement('div'); root.className = 'daynight-control';
    const liveText = t('toolbar.liveIstanbul');
    const selectHourText = t('toolbar.selectHour');
    const manualHourAria = t('toolbar.manualHourAria');
    root.innerHTML = `<button type="button" class="tbtn" id="daynight-btn" aria-expanded="false" aria-controls="daynight-popover"></button>
      <div id="daynight-popover" hidden><button type="button" data-live>${liveText}</button>
      ${[[12, 'day', '12:00'], [18.5, 'sunset', '18:30'], [20.25, 'twilight', '20:15'], [23.5, 'night', '23:30'], [6.5, 'dawn', '06:30']].map(([h, phase, time]) => `<button type="button" data-hour="${h}">${t('toolbar.phases.' + phase)} (${time})</button>`).join('')}
      <label for="daynight-hour">${selectHourText} <output id="daynight-time"></output></label>
      <input id="daynight-hour" type="range" min="0" max="23.99" step="0.05" aria-label="${manualHourAria}">
      </div>`;
    container.appendChild(root); this.toolbar = root; this.uiKey = '';
    const isTest = typeof location !== 'undefined' && (location.search.includes('dev') || location.search.includes('test') || location.search.includes('time'));
    root.hidden = !isTest;

    const button = root.querySelector<HTMLButtonElement>('#daynight-btn')!, popover = root.querySelector<HTMLElement>('#daynight-popover')!;
    const close = (): void => { popover.hidden = true; button.setAttribute('aria-expanded', 'false'); };
    const toggleTest = (): void => {
      root.hidden = false;
      popover.hidden = !popover.hidden;
      button.setAttribute('aria-expanded', String(!popover.hidden));
    };
    (window as unknown as { __toggleTimeTest?: () => void }).__toggleTimeTest = toggleTest;
    button.onclick = () => toggleTest();
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        toggleTest();
      }
    });
    root.onkeydown = e => { if (e.key === 'Escape') { close(); button.focus(); } };
    root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget as Node | null)) close(); });
    root.querySelector<HTMLButtonElement>('[data-live]')!.onclick = () => this.setMode('live');
    root.querySelectorAll<HTMLButtonElement>('[data-hour]').forEach(b => { b.onclick = () => this.setManualHour(Number(b.dataset.hour)); });
    root.querySelector<HTMLInputElement>('input')!.oninput = e => this.setManualHour(Number((e.target as HTMLInputElement).value));

    onLanguageChange(() => {
      this.uiKey = '';
      if (this.toolbar) {
        this.mountToolbar(container);
      }
    });

    this.refreshToolbar();
  }
  toggleTestUi(): void {
    if (this.toolbar) {
      this.toolbar.hidden = false;
      const popover = this.toolbar.querySelector<HTMLElement>('#daynight-popover');
      if (popover) popover.hidden = !popover.hidden;
    }
  }
  private refreshToolbar(): void {
    if (!this.toolbar) return;
    const tInfo = this.getCurrentTime(), time = `${String(tInfo.hour).padStart(2, '0')}:${String(tInfo.minute).padStart(2, '0')}`;
    const city = t('toolbar.istanbulSuffix');
    const manualSuffix = t('toolbar.manualSuffix');
    const key = `${time}-${tInfo.phase}-${this.mode}-${this.manualHour}-${city}`;
    if (key === this.uiKey) return;
    this.uiKey = key;
    this.toolbar.querySelector('#daynight-btn')!.innerHTML = icon(tInfo.icon) + `<span>${time} (${city} · ${tInfo.label})${this.mode === 'manual' ? ' · ' + manualSuffix : ''}</span>`;
    this.toolbar.querySelector('output')!.textContent = time;
    const live = this.toolbar.querySelector<HTMLButtonElement>('[data-live]')!;
    live.classList.toggle('active', this.mode === 'live'); live.setAttribute('aria-pressed', String(this.mode === 'live'));
    this.toolbar.querySelectorAll<HTMLButtonElement>('[data-hour]').forEach(b => {
      const active = this.mode === 'manual' && Math.abs(Number(b.dataset.hour) - this.manualHour) < 0.001;
      b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active));
    });
    this.toolbar.querySelector<HTMLInputElement>('input')!.value = String(tInfo.fractionalHour);
  }

}
