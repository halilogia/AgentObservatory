// Sevimli low-poly bot çalışanlar: yapı, yazı yazma, yürüme animasyonları. Salt görsel.
import * as THREE from 'three';
import { rbox, sphere, cyl, at, mesh, capsule, rand, onTick, ColorInput, StdMesh, canvasTex, roundRect } from '../../core';
import type { ModelId } from '../../core';
import { mug, steam } from '../../shared';
import { chestLogo } from './logos';

const DARK = 0x2b2d42, HEAD = 0xf7f4ef;
/** anten lambasının tepesi (1.83) + 0.2 boşluk + rozet yarı yüksekliği (0.175) + süzülme payı (0.035) */
const BADGE_Y = 2.25;

export type AgentModel = ModelId;

export interface BotOptions {
  body: number; accent: number; legs: number; scale: number;
  glasses?: boolean; bowtie?: boolean; hat?: boolean;
  model?: AgentModel;
  modelLabel?: string;
  badgeY?: number;
}

export interface Bot {
  group: THREE.Group; o: BotOptions; blink: number;
  eyes: StdMesh[]; head: THREE.Group; bulb: StdMesh;
  armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group;
  mug?: THREE.Group; papers?: THREE.Group; carrying?: boolean;
  /** elde tutulan açık kitap (dosya okuma / bilgi kasası faaliyeti) */
  book?: THREE.Group;
  badgeSprite?: THREE.Sprite;
  feet: StdMesh[];
}


interface BadgeStyle { borderColor: string; bgColor: string; textColor: string }
const BADGE_STYLES: Record<AgentModel, BadgeStyle> = {
  claude: { borderColor: '#d97757', bgColor: 'rgba(255, 248, 242, 0.96)', textColor: '#431407' },
  gemini: { borderColor: '#3b82f6', bgColor: 'rgba(240, 246, 255, 0.96)', textColor: '#1e3a8a' },
  chatgpt: { borderColor: '#10a37f', bgColor: 'rgba(240, 253, 244, 0.96)', textColor: '#064e3b' },
  nexus: { borderColor: '#a855f7', bgColor: 'rgba(250, 245, 255, 0.96)', textColor: '#581c87' },
  barista: { borderColor: '#ff8a65', bgColor: 'rgba(255, 247, 237, 0.96)', textColor: '#7c2d12' },
  courier: { borderColor: '#6fe3a0', bgColor: 'rgba(240, 253, 244, 0.96)', textColor: '#065f46' },
  codex: { borderColor: '#10a37f', bgColor: 'rgba(240, 253, 250, 0.96)', textColor: '#064e3b' },
  antigravity: { borderColor: '#6366f1', bgColor: 'rgba(238, 242, 255, 0.96)', textColor: '#312e81' },
  gravityguard: { borderColor: '#f59e0b', bgColor: 'rgba(24, 20, 48, 0.96)', textColor: '#fbbf24' },
  generic: { borderColor: '#64748b', bgColor: 'rgba(248, 250, 252, 0.96)', textColor: '#1e293b' }
};

function createModelBadgeSprite(model: AgentModel, labelText: string): THREE.Sprite {
  const tex = canvasTex(360, 90, function (ctx, w, h) {
    ctx.clearRect(0, 0, w, h);

    const { borderColor, bgColor, textColor } = BADGE_STYLES[model];

    // Rozet arka planı (yuvarlak hap)
    roundRect(ctx, 4, 6, w - 8, h - 12, 38);
    ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = borderColor;
    ctx.stroke();

    // Model İkonu
    const icx = 48, icy = h / 2;
    if (model === 'claude') {
      // Anthropic 8 ışınlı yıldız sembolü
      ctx.save();
      ctx.translate(icx, icy);
      ctx.fillStyle = '#d97757';
      for (let i = 0; i < 8; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.2, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (model === 'gemini') {
      // Google Gemini 4 köşeli kavisli elmas parıltısı
      ctx.save();
      ctx.translate(icx, icy);
      const g = ctx.createLinearGradient(-16, -16, 16, 16);
      g.addColorStop(0, '#38bdf8');
      g.addColorStop(0.5, '#6366f1');
      g.addColorStop(1, '#ec4899');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -19);
      ctx.quadraticCurveTo(0, 0, 19, 0);
      ctx.quadraticCurveTo(0, 0, 0, 19);
      ctx.quadraticCurveTo(0, 0, -19, 0);
      ctx.quadraticCurveTo(0, 0, 0, -19);
      ctx.fill();
      ctx.restore();
    } else if (model === 'chatgpt') {
      // OpenAI spiral 6 kanatlı rozet
      ctx.save();
      ctx.translate(icx, icy);
      ctx.strokeStyle = '#10a37f';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(0, 7, 9, -Math.PI / 2, Math.PI / 3.2);
        ctx.stroke();
        ctx.rotate(Math.PI / 3);
      }
      ctx.restore();
    } else if (model === 'nexus') {
      // Nexus neon 'N'
      ctx.save();
      ctx.translate(icx, icy);
      ctx.fillStyle = '#a855f7';
      ctx.font = '900 28px "Nunito",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', 0, 2);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2.5;
      ctx.strokeText('N', 0, 2);
      ctx.restore();
    } else if (model === 'gravityguard') {
      // GravityGuard güvenlik kalkanı amblemi
      ctx.save();
      ctx.translate(icx, icy);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(14, -9);
      ctx.lineTo(11, 6);
      ctx.quadraticCurveTo(8, 14, 0, 18);
      ctx.quadraticCurveTo(-8, 14, -11, 6);
      ctx.lineTo(-14, -9);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(icx, icy);
      ctx.fillStyle = borderColor;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Başlık / Model İsmi
    ctx.fillStyle = textColor;
    ctx.font = '800 27px "Nunito",sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, 80, h / 2 + 1);
  });

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.4, 0.35, 1);
  return sprite;
}

export function makeBot(opts?: Partial<BotOptions>): Bot {
  const o: BotOptions = Object.assign({ body: 0x8fd3ff, accent: 0x4fd8ff, legs: 0x5c6283, scale: 1 }, opts);
  const g = new THREE.Group(); g.userData.unit = 'bot';
  const blink = rand() * 4; // özgün sıra: göz kırpma fazı ilk rastgele çağrı
  const glow = { emissive: o.accent, emissiveIntensity: 0.9 };

  g.add(at(rbox(0.56, 0.5, 0.4, o.body, 0.16), 0, 0.56, 0));

  g.add(chestLogo(o.model)); // göğüs ortasında firma logosu plakası

  const head = new THREE.Group(); head.position.y = 0.86; g.add(head);
  head.add(at(rbox(0.88, 0.64, 0.7, HEAD, 0.22), 0, 0.32, 0));
  head.add(at(rbox(0.68, 0.42, 0.06, DARK, 0.12), 0, 0.33, 0.34));
  const eyes = [-1, 1].map(function (s) {
    const e = sphere(0.07, o.accent, 12, glow); e.scale.set(1, 1.35, 0.4); e.position.set(s * 0.15, 0.38, 0.37 + 0.07 * 0.4); // yüz paneline yaslı
    e.castShadow = false; head.add(e); return e;
  });
  const smile = mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 12, Math.PI), o.accent, glow, true);
  smile.rotation.z = Math.PI; smile.position.set(0, 0.29, 0.37 + 0.014); head.add(smile);
  [-1, 1].forEach(function (s) {
    const ch = sphere(0.04, 0xff8fb0, 8, { emissive: 0xff8fb0, emissiveIntensity: 0.4 }); ch.scale.set(1, 0.6, 0.3);
    ch.position.set(s * 0.25, 0.27, 0.37 + 0.04 * 0.3); ch.castShadow = false; head.add(ch);
    const ear = cyl(0.12, 0.12, 0.1, o.accent, 14); ear.rotation.z = Math.PI / 2; ear.position.set(s * 0.49, 0.32, 0); head.add(ear);
  });
  head.add(at(cyl(0.018, 0.018, 0.2, 0x8d93ad, 6), 0, 0.74, 0));
  const bulb = sphere(0.065, o.accent, 12, Object.assign({ unique: true }, glow)); // robota özgü malzeme: renk/parlaklık diğer botları etkilemez
  bulb.position.set(0, 0.905, 0); head.add(bulb);

  if (o.glasses) {
    [-1, 1].forEach(function (s) {
      const r = mesh(new THREE.TorusGeometry(0.1, 0.017, 6, 16), 0xffb84d); r.position.set(s * 0.17, 0.38, 0.38); head.add(r);
    });
    head.add(at(rbox(0.1, 0.02, 0.02, 0xffb84d, 0.01), 0, 0.4, 0.38));
  }
  if (o.bowtie) {
    [-1, 1].forEach(function (s) {
      const c = mesh(new THREE.ConeGeometry(0.1, 0.16, 4), 0xff5d8f); c.rotation.z = s * Math.PI / 2; c.position.set(s * 0.09, 0.8, 0.3); g.add(c);
    });
    g.add(at(sphere(0.045, 0xff5d8f, 8), 0, 0.8, 0.31));
  }

  // Baş üstü model / rol rozeti
  let badgeSprite: THREE.Sprite | undefined;
  if (o.model || o.modelLabel) {
    const lbl = o.modelLabel || (o.model ? o.model.toUpperCase() : 'BOT');
    badgeSprite = createModelBadgeSprite(o.model || 'nexus', lbl);
    badgeSprite.position.set(0, o.badgeY !== undefined ? o.badgeY : BADGE_Y, 0);
    g.add(badgeSprite);
  }

  const arm = function (s: number): THREE.Group {
    const p = new THREE.Group(); p.position.set(s * 0.34, 0.74, 0);
    p.add(at(capsule(0.06, 0.18, o.body), 0, -0.14, 0));
    p.add(at(sphere(0.075, HEAD, 10), 0, -0.29, 0));
    g.add(p); return p;
  };
  const armL = arm(-1), armR = arm(1);
  const leg = function (s: number): THREE.Group {
    const p = new THREE.Group(); p.position.set(s * 0.14, 0.33, 0);
    p.add(at(capsule(0.09, 0.2, o.legs), 0, -0.14, 0)); // alt ucu tam zemin (y=0)
    const foot = at(rbox(0.17, 0.08, 0.26, DARK, 0.04), 0, -0.29, 0.05); p.add(foot); feet.push(foot);
    g.add(p); return p;
  };
  const feet: StdMesh[] = [];
  const legL = leg(-1), legR = leg(1);
  g.scale.setScalar(o.scale);
  return { group: g, o: o, blink: blink, eyes: eyes, head: head, bulb: bulb, armL: armL, armR: armR, legL: legL, legR: legR, badgeSprite: badgeSprite, feet: feet };
}

export type BotPose = 'idle' | 'walking' | 'reading' | 'coding' | 'reasoning' | 'testing' | 'resting' | 'approval' | 'disconnected' | 'failed' | 'completed';

export interface BotAnimator {
  readonly pose: BotPose;
  /** yalnızca durum değiştiğinde çağrılır (her karede değil) */
  setPose(next: BotPose): void;
  /** 0 = ayakta, 1 = oturur (bacaklar yatay). Oturma/kalkma geçişini denetleyici sürer. */
  setSeat(blend: number): void;
  /** hareket hızı oranı (yürüme salınımı için), dt saniye, t toplam süre */
  update(dt: number, t: number, moveRatio?: number): void;
}

interface Joint { x: number; y: number; z: number }
const J = function (x?: number, y?: number, z?: number): Joint { return { x: x || 0, y: y || 0, z: z || 0 }; };

/**
 * Tek yazıcı kuralı: kol/baş/bacak/anten dönüşlerini YALNIZCA bu denetleyici yazar; hedef pozlar zamana yayılarak
 * geçilir, farklı animasyonlar birbirini ezmez. Faaliyet bilinmiyorsa 'idle' kullanılır (kesin eylem gösterilmez).
 */
export function createAnimator(bot: Bot): BotAnimator {
  const ph = bot.blink;
  const cur = { armL: J(), armR: J(), head: J(), eye: 1, bulb: 0.8, swing: 0 };
  let pose: BotPose = 'idle', seat = 0, walkPhase = 0;

  const baseColor = bot.o.accent;
  let tint = baseColor;
  function targets(t: number): { armL: Joint; armR: Joint; head: Joint; eye: number; bulb: number; tint: number } {
    let armL = J(), armR = J(), head = J(), eye = 1, bulb = 0.7 + Math.sin(t * 3 + ph) * 0.3, tc = baseColor;
    switch (pose) {
      case 'coding':
        armL = J(-1.25 + Math.sin(t * 14 + ph) * 0.09); armR = J(-1.25 + Math.sin(t * 12 + ph + 1.7) * 0.09);
        head = J(0.1 + Math.sin(t * 0.8 + ph) * 0.03); bulb = 0.9; break;
      case 'reading':
        armL = J(-1.15, 0, 0.1); armR = J(-1.15, 0, -0.1);
        head = J(0.14, Math.sin(t * 0.9 + ph) * 0.18, 0); break;
      case 'reasoning': // düşünüyor (thinking): sağ el çenede/şakakta, baş hafif yana eğik, anten mor düşünce nabzı
        armL = J(-0.35, 0, 0.18);
        armR = J(-1.85 + Math.sin(t * 3.5 + ph) * 0.04, 0.28, -0.58);
        head = J(-0.16 + Math.sin(t * 1.5 + ph) * 0.04, 0.18, 0.12);
        bulb = 0.5 + (Math.sin(t * 3.5 + ph) * 0.5 + 0.5) * 2.2;
        tc = 0x9d4edd; break;
      case 'testing':
        armL = J(-0.9, 0, 0.8); armR = J(-0.9, 0, -0.8);
        head = J(0.04); bulb = Math.sin(t * 1.6 + ph) > 0 ? 1.4 : 0.3; break;
      case 'resting':
        armL = J(-0.25, 0, 0.2); armR = J(-0.25, 0, -0.2);
        head = J(-0.2, 0, 0.05); eye = 0.45 + Math.max(0, Math.sin(t * 0.5 + ph)) * 0.1; bulb = 0.3; break;
      case 'approval': // CLI onayı bekliyor: bir kol yukarıda dikkat çekiyor, anten sarı nabız atıyor
        armR = J(-2.7 + Math.sin(t * 5) * 0.15, 0, -0.2); armL = J(-0.3, 0, 0.1);
        head = J(-0.05, 0, 0.12); bulb = 1.0 + (Math.sin(t * 6) * 0.5 + 0.5) * 2.2; tc = 0xffd400; break;
      case 'disconnected': // bağlantı koptu: baş öne düşük, gözler kapalı, anten titrek kırmızı/gri
        armL = J(-0.2); armR = J(-0.2); head = J(0.55, 0, 0.05); eye = 0.08;
        bulb = Math.sin(t * 23 + ph) > 0.4 ? 0.9 : 0.05; tc = Math.sin(t * 7) > 0 ? 0xff3b3b : 0x7a7a8a; break;
      case 'failed': // hata: baş iki yana, eller başta
        armL = J(-2.3, 0, 0.55); armR = J(-2.3, 0, -0.55); head = J(0.1, Math.sin(t * 14) * 0.5, 0); bulb = 1.2; tc = 0xff3b3b; break;
      case 'completed': // tamam: iki kol havada selam
        armL = J(-2.8 + Math.sin(t * 6) * 0.2, 0, 0.35); armR = J(-2.8 + Math.sin(t * 6 + 1.5) * 0.2, 0, -0.35); head = J(-0.1); bulb = 1.6; tc = 0x6fe3a0; break;
      case 'walking': {
        const sw = Math.sin(walkPhase);
        armL = J(-sw * 0.6); armR = J(sw * 0.6); break;
      }
      default: // idle
        armL = J(Math.sin(t * 1.5 + ph) * 0.04); armR = J(Math.sin(t * 1.5 + ph + 1) * 0.04);
        head = J(0, Math.sin(t * 0.6 + ph) * 0.15, Math.sin(t * 1.3 + ph) * 0.04);
    }
    // taşınan nesneler kolları her pozda belirler
    if (bot.carrying) { armL = J(-1.0, 0, 0.32); armR = J(-1.0, 0, -0.32); }
    else if (bot.book) { // iki el kitabı tutar, baş kitaba eğilir (yürürken de)
      armL = J(-1.15, 0, 0.08); armR = J(-1.15, 0, -0.08);
      head = J(0.35, pose === 'walking' ? 0 : Math.sin(t * 0.9 + ph) * 0.08, 0);
    }
    else if (bot.mug) armR = J(-1.0 + (pose === 'walking' ? 0 : Math.sin(t * 1.4) * 0.08));
    return { armL: armL, armR: armR, head: head, eye: eye, bulb: bulb, tint: tc };
  }

  const lerpJ = function (c: Joint, g: Joint, k: number): void { c.x += (g.x - c.x) * k; c.y += (g.y - c.y) * k; c.z += (g.z - c.z) * k; };

  return {
    get pose(): BotPose { return pose; },
    setPose: function (next) { pose = next; },
    setSeat: function (b) { seat = Math.max(0, Math.min(1, b)); },
    update: function (dt, t, moveRatio) {
      const k = 1 - Math.exp(-dt * 10), tg = targets(t);
      const moving = pose === 'walking' ? (moveRatio === undefined ? 1 : moveRatio) : 0;
      walkPhase += dt * 9 * moving;
      lerpJ(cur.armL, tg.armL, k); lerpJ(cur.armR, tg.armR, k); lerpJ(cur.head, tg.head, k);
      cur.eye += (tg.eye - cur.eye) * k; cur.bulb += (tg.bulb - cur.bulb) * k;
      cur.swing += ((moving > 0 ? 1 : 0) - cur.swing) * k;
      bot.armL.rotation.set(cur.armL.x, cur.armL.y, cur.armL.z); bot.armR.rotation.set(cur.armR.x, cur.armR.y, cur.armR.z);
      bot.head.rotation.set(cur.head.x, cur.head.y, cur.head.z);
      const swing = Math.sin(walkPhase) * 0.7 * cur.swing * (1 - seat);
      bot.legL.rotation.x = -Math.PI / 2 * seat + swing; bot.legR.rotation.x = -Math.PI / 2 * seat - swing;
      const feet = seat < 0.5;
      for (let i = 0; i < bot.feet.length; i++) { bot.feet[i].visible = feet; bot.feet[i].rotation.x = -(i === 0 ? bot.legL : bot.legR).rotation.x; } // taban yere paralel kalır, burun zemine batmaz
      // göz kırpma + antenin parlaması
      const bk = (t + ph) % 4.3, blink = bk < 0.13 && pose !== 'disconnected' ? 0.12 : 1;
      bot.eyes[0].scale.y = bot.eyes[1].scale.y = 1.35 * blink * cur.eye;
      const bm = bot.bulb.material as THREE.MeshStandardMaterial;
      bm.emissiveIntensity = cur.bulb;
      if (tg.tint !== tint) { tint = tg.tint; bm.color.setHex(tint); bm.emissive.setHex(tint); }
      if (bot.badgeSprite) bot.badgeSprite.position.y = (bot.o.badgeY !== undefined ? bot.o.badgeY : BADGE_Y) + Math.sin(t * 2.2 + ph) * 0.035;
    }
  };
}

/** kolu ileri kaldırıp kupa tutturur */
export function giveMug(bot: Bot, color: ColorInput): void {
  if (bot.mug) removeMug(bot);
  const m = mug(color); m.position.set(0, -0.3, 0.12); m.scale.setScalar(1.3);
  delete m.userData.unit; // elde tutulan kupa botun parçasıdır
  bot.armR.add(m); bot.mug = m;
  steam(m, 0.14);
  onTick(function () {
    if (bot.mug === m) m.rotation.x = -bot.armR.rotation.x;
  });
}

/** kupayı koldan kaldırır ve kaynakları temizler */
export function removeMug(bot: Bot): void {
  if (!bot.mug) return;
  const m = bot.mug;
  bot.armR.remove(m);
  m.traverse(function (child) {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => mat.dispose());
      } else {
        mesh.material?.dispose();
      }
    }
  });
  delete bot.mug;
}

/**
 * iki elle açık kitap tutar: kapak + sayfa levhaları omurgadan V biçiminde açılır, kitap yüze doğru eğilir.
 * Kollar animatörde (bot.book) öne kalkar; kitap gövdenin 3 cm önünde durur (iç içe geçmez).
 */
export function giveBook(bot: Bot, cover?: ColorInput): void {
  if (bot.book) return;
  const b = new THREE.Group(); b.position.set(0, 0.64, 0.37); b.rotation.x = -0.7;
  const coverC = cover === undefined ? (bot.o.accent || 0x7c3aed) : cover;
  [-1, 1].forEach(function (s) {
    const side = new THREE.Group(); side.position.x = s * 0.004; side.rotation.z = s * 0.15; // dış kenarlar yukarı: açık kitap V
    side.add(at(rbox(0.25, 0.03, 0.34, coverC, 0.01), s * 0.125, 0, 0));
    side.add(at(rbox(0.23, 0.025, 0.32, 0xfffbf0, 0.01), s * 0.125, 0.0275, 0)); // kapağın üstüne oturur (0.015 .. 0.04)
    b.add(side);
  });
  bot.group.add(b); bot.book = b;
}

/** kitabı kapatıp kaldırır; kollar ve baş animatörle serbest kalır */
export function removeBook(bot: Bot): void {
  if (!bot.book) return;
  const b = bot.book;
  bot.group.remove(b);
  b.traverse(function (c) { const m = c as THREE.Mesh; if (m.isMesh && m.geometry) m.geometry.dispose(); }); // malzemeler ortak önbellekten gelir, bırakılır
  delete bot.book;
}

/** iki elle kâğıt destesi taşır */
export function givePapers(bot: Bot): void {
  const st = new THREE.Group(); st.position.set(0, 0.62, 0.42);
  for (let i = 0; i < 5; i++) st.add(at(rbox(0.36, 0.03, 0.46, i === 4 ? 0xffc65a : 0xffffff, 0.02), (rand() - 0.5) * 0.03, i * 0.032, 0));
  bot.group.add(st); bot.papers = st;
  bot.carrying = true;
}

