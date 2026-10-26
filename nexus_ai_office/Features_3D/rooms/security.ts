// GravityGuard Güvenlik Robotu & Güvenlik Kontrol Noktası:
// Açık çalışma alanı ile odalar arasındaki geçiş omurgasını korur.
// Anayasal ve mimari kuralları (emoji yasağı, yerel popup yasağı, SRP, anti-bloat) denetler.
import * as THREE from 'three';
import { rbox, cyl, sphere, at, decal, canvasTex, roundRect, onTick, registerInspectable, unregisterInspectable } from '../../core';
import { t, onLanguageChange } from '../../core/i18n';
import { makeBot, createAnimator } from '../bots';
import { chestLogo } from '../bots/logos';

const ID = 'gravityguard';
/** Geçiş omurgasının sağı (X = 2.4), koridor ile çalışma alanı birleşim noktası (Z = -4.5) */
const POST = { x: 2.4, z: -4.5 };

export function buildSecurityBot(parent: THREE.Object3D): void {
  const stationGroup = new THREE.Group();
  stationGroup.position.set(POST.x, 0, POST.z);
  parent.add(stationGroup);

  // ---- 1. Güvenlik Zemin Padi (Cyber Security Decal) ----
  const pad = decal(1.8, 1.4, 0.1, 0x101524, 1);
  pad.position.set(0, 0, 0.15);
  stationGroup.add(pad);

  // ---- 2. Güvenlik Konsolu / Terminal Masası ----
  const desk = new THREE.Group();
  desk.position.set(0, 0, 0.45); // Robotun önünde durur (+z yönünde)
  stationGroup.add(desk);

  // Konsol gövdesi
  desk.add(at(rbox(0.95, 0.82, 0.44, 0x181e2e, 0.04), 0, 0.41, 0));
  // Neon kenar şeridi
  desk.add(at(rbox(0.97, 0.035, 0.46, 0x06b6d4, 0.02, { emissive: 0x00e5ff, emissiveIntensity: 0.8 }), 0, 0.82, 0));

  // Konsol ekranı (Canlı CanvasTexture: GravityGuard Güvenlik Ekranı)
  const monitorTex = canvasTex(256, 160, function (ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    roundRect(ctx, 4, 4, w - 8, h - 8, 12);
    ctx.fillStyle = '#090d16';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#06b6d4';
    ctx.stroke();

    // Üst başlık
    ctx.fillStyle = '#38bdf8';
    ctx.font = '800 16px "Nunito",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GRAVITYGUARD SENTINEL', w / 2, 28);

    // Güvenlik durumu rozeti
    roundRect(ctx, 24, 42, w - 48, 30, 8);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
    ctx.fill();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#34d399';
    ctx.font = '800 13px "Nunito",sans-serif';
    ctx.fillText('STATUS: SECURE (0 VIOLATION)', w / 2, 62);

    // Kural telemetri satırları
    ctx.textAlign = 'left';
    ctx.font = '700 11px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('> ICON_RULE: ENFORCED', 26, 96);
    ctx.fillText('> NATIVE_POPUP: BLOCKED', 26, 116);
    ctx.fillText('> STOP_GUARD: ACTIVE', 26, 136);
  });
  monitorTex.encoding = THREE.sRGBEncoding;

  const monitor = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.4),
    new THREE.MeshBasicMaterial({ map: monitorTex })
  );
  monitor.position.set(0, 0.94, 0.05);
  monitor.rotation.x = -Math.PI / 4;
  desk.add(monitor);

  // Radar / Güvenlik Uyarı Direği
  const pole = cyl(0.015, 0.015, 0.45, 0x334155, 8);
  desk.add(at(pole, 0.4, 1.04, -0.12));
  const beaconLight = sphere(0.045, 0xf59e0b, 10, { emissive: 0xf59e0b, emissiveIntensity: 0.9 });
  desk.add(at(beaconLight, 0.4, 1.28, -0.12));

  // Konsol üstünde süzülen holografik kalkan amblemi
  const holoMesh = chestLogo('gravityguard');
  holoMesh.scale.setScalar(1.4);
  holoMesh.position.set(0, 1.35, 0.02);
  desk.add(holoMesh);

  // ---- 3. GravityGuard Robot Modeli ----
  const bot = makeBot({
    body: 0x181e2e,
    accent: 0x00e5ff,
    legs: 0x2b324d,
    model: 'gravityguard',
    modelLabel: 'GravityGuard'
  });
  bot.group.position.set(0, 0, 0);
  bot.group.rotation.y = 0; // Çalışma alanına bakar
  stationGroup.add(bot.group);

  // Robot özel güvenlik donanımları:
  // A) Taktik Güvenlik Vizörü (head üzerine monteli siber vizör)
  const visor = rbox(0.72, 0.13, 0.12, 0x06b6d4, 0.03, {
    transparent: true,
    opacity: 0.9,
    emissive: 0x00e5ff,
    emissiveIntensity: 0.8
  });
  visor.position.set(0, 0.38, 0.36);
  bot.head.add(visor);

  // B) Baş üstü çift yönlü güvenlik ikaz çakarları
  const strobeL = sphere(0.045, 0xf59e0b, 10, { emissive: 0xf59e0b, emissiveIntensity: 0.8 });
  strobeL.position.set(-0.24, 0.65, 0);
  bot.head.add(strobeL);
  const strobeR = sphere(0.045, 0x00e5ff, 10, { emissive: 0x00e5ff, emissiveIntensity: 0.8 });
  strobeR.position.set(0.24, 0.65, 0);
  bot.head.add(strobeR);

  // C) Taktik omuzluklar (epaulets)
  [-1, 1].forEach(function (s) {
    const ep = rbox(0.18, 0.06, 0.22, 0x334155, 0.02, { emissive: 0x06b6d4, emissiveIntensity: 0.3 });
    ep.position.set(s * 0.38, 0.66, 0);
    bot.group.add(ep);
  });

  // D) Sağ elde taşınan taktik el tarayıcısı
  const scanner = new THREE.Group();
  scanner.add(at(rbox(0.06, 0.16, 0.08, 0x1e293b, 0.02), 0, -0.15, 0.12));
  const scannerTip = cyl(0.02, 0.035, 0.08, 0x06b6d4, 8, { emissive: 0x00e5ff, emissiveIntensity: 0.9 });
  scannerTip.rotation.x = Math.PI / 4;
  scanner.add(at(scannerTip, 0, -0.22, 0.16));
  bot.armR.add(scanner);

  const anim = createAnimator(bot);

  // ---- 4. Canlı Animasyon & Devriye Taraması ----
  onTick(function (time, dt) {
    // Baş sağa-sola sakin devriye taraması yapar
    bot.head.rotation.y = Math.sin(time * 0.8) * 0.3;

    // Çakar flaşları ve kalkan nabzı
    (strobeL.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + Math.sin(time * 6) * 0.5;
    (strobeR.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + Math.cos(time * 6) * 0.5;
    (beaconLight.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.sin(time * 4) * 0.4;

    // Konsol üstündeki holografik kalkan amblemi süzülür ve döner
    holoMesh.position.y = 1.35 + Math.sin(time * 2.5) * 0.04;
    holoMesh.rotation.y = time * 1.2;

    anim.update(dt, time);
  });

  // ---- 5. Tıklanabilir Inspectable Kaydı ----
  const register = function (): void {
    unregisterInspectable(ID);
    registerInspectable({
      id: ID,
      kind: 'staff',
      title: t('rooms.gravityguard.name'),
      subtitle: t('rooms.gravityguard.subtitle'),
      color: 0xf59e0b,
      object: stationGroup,
      focusOffset: new THREE.Vector3(0, 1.1, 0),
      radius: 1.3,
      agents: [{ id: ID, name: t('rooms.gravityguard.name'), role: t('rooms.gravityguard.role') }],
      metric: t('rooms.gravityguard.metric'),
      placeholder: t('rooms.gravityguard.placeholder'),
      actions: [
        {
          label: t('rooms.gravityguard.audit'),
          icon: 'shield',
          log: [
            ['cmd', '$ gravityguard audit --constitutional'],
            ['ok', 'DESIGN_ICON_RULE: 0 standart emoji ihlali'],
            ['ok', 'DESIGN_NATIVE_POPUP_RULE: 0 yerel browser dialogu'],
            ['ok', 'Bütünlük: %100 doğrulandı (70 TS & 9 Py testleri tam yeşil)']
          ]
        },
        {
          label: t('rooms.gravityguard.scan'),
          icon: 'search',
          effect: 'boost',
          log: [
            ['cmd', '$ gravityguard scan --workspace'],
            ['info', '5 oda, 6 istasyon, aktif ajanlar ve ağ trafiği tarandı'],
            ['ok', 'Yetkisiz erişim veya kural dışı mutasyon tespit edilmedi']
          ]
        },
        {
          label: t('rooms.gravityguard.shield'),
          icon: 'restart',
          log: [
            ['cmd', '$ gravityguard shield --refresh'],
            ['ok', 'Anayasal koruma kalkanları senkronize edildi (GravityGuard Sentinel v2.4)']
          ]
        },
        {
          label: t('rooms.gravityguard.guard'),
          icon: 'close',
          log: [
            ['warn', 'Hop Hemşerim! GravityGuard durdurma kancası tetiklendi'],
            ['ok', 'Yetkisiz işlem anında durduruldu, güvenli geri sarma yapıldı']
          ]
        }
      ]
    });
  };

  register();
  onLanguageChange(register);
}
