// ARCHIVED: SpatialAIOrchestration3D Legacy Demo & Simulation Code
// Bu dosya, projede daha önce demo/test amaçlı kullanılan sahte simülasyon döngülerini,
// mock faaliyet döngülerini, sahte scriptleri ve test butonlarını içerir.
// Canlı sistemde doğrudan gerçek CLI oturumları ve telemetri kullanıldığı için buraya taşınmıştır.

import type { Activity } from '../src/core';
import type { ProjectSpec } from '../src/core';

/** Eski demo başlangıç masaları */
export const LEGACY_DEMO_PROJECTS: ProjectSpec[] = [
  {
    id: 'tez', name: 'Tez', color: 0x4fd8ff, icon: 'book',
    agents: [{ id: 'tez:0', name: 'Claude Code', model: 'claude', task: 'Literatür taraması ve bölüm 3 taslağı' }, { id: 'tez:1', name: 'Gemini Pro', model: 'gemini', task: 'Kaynakça ve atıf denetimi' }]
  },
  {
    id: 'strateji', name: 'Strateji Oyunu', color: 0xff7eb6, icon: 'gamepad',
    agents: [{ id: 'strateji:0', name: 'Codex', model: 'codex', task: 'Birim hareket sistemi' }, { id: 'strateji:1', name: 'Claude Code', model: 'claude', task: 'Harita üretici refaktörü' }]
  },
  {
    id: 'lifeos', name: 'LifeOS', color: 0xffc65a, icon: 'heart',
    agents: [{ id: 'lifeos:0', name: 'Antigravity', model: 'antigravity', task: 'Günlük plan ekranı' }]
  }
];

/** Eski sahte diff metni */
export const LEGACY_SAMPLE_DIFF = [
  '--- a/src/features/projects/index.ts',
  '+++ b/src/features/projects/index.ts',
  '@@ -118,7 +118,9 @@ function buildDesk(scene, cfg)',
  '   const lt = new THREE.PointLight(c, 0.55, 4, 2);',
  '-  lt.position.y = 1.6;',
  '+  lt.position.y = 1.6;',
  '+  lt.castShadow = false;',
  '+  lt.userData.agent = cfg.id;',
  '   const ph = cfg.phase;'
].join('\n');

/** Eski rastgele faaliyet döngüsü */
export const LEGACY_ACTIVITY_CYCLE: Activity[] = ['reading', 'coding', 'coding', 'reasoning', 'planning', 'testing', 'coding', 'ops'];

/** Eski sahte scriptler ve adımlar tablosu */
export const LEGACY_MOCK_SCRIPTS: Record<string, { task: string; phases: string[]; steps: [number, string, string][] }> = {
  'web:0': {
    task: 'Proje masası sürükle-bırak arayüzü',
    phases: ['Düşünüyor', 'Okuyor / İnceliyor', 'Kodluyor', 'Test Ediyor'],
    steps: [
      [0, 'info', 'akıl yürütülüyor (reasoning)... Proje masası'],
      [1, 'cmd', '$ rtk read -m 40 src/features/projects/index.ts'],
      [2, 'cmd', '$ edit src/features/projects/index.ts'],
      [3, 'cmd', '$ npm test']
    ]
  },
  'room:war': {
    task: 'Plan Odası: görev planları ve mimari denetim',
    phases: ['Planla', 'Dağıt', 'İzle', 'Onayla'],
    steps: [
      [0, 'info', 'görev planı taslağı hazırlandı'],
      [1, 'cmd', '$ dispatch --plan weekly'],
      [2, 'info', 'ajan durumları toplandı'],
      [3, 'ok', 'onay bekleyen iş yok']
    ]
  }
};

/** Eski otonom rastgele kahve molası mantığı */
export function legacyCoffeeBreakDemo(): void {
  // Otonom kahve molası: robot rastgele lounge:coffee düğümüne gider,
  // eline fincan alır, birkaç saniye bekler ve masasına dönerdi.
}
