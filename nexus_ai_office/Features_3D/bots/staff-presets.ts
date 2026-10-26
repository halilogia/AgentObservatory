// Personel Robot Modelleri & Presets Arşivi
// Bu dosya Context Compactor (Barista), Standby Bekçisi (Idler) ve IPC Dispatcher (Courier)
// robotlarının 3D modellerini, renklerini, aksesuarlarını ve devriye rotalarını ileride
// tekrar kullanılabilmesi için güvenle saklar.

import { makeBot, giveMug, givePapers } from './index';
import type { Bot } from './index';
import type { InspectAction } from '../../core';

export interface StaffPreset {
  id: string;
  name: string;
  role: string;
  color: number;
  metric: string;
  placeholder: string;
  startNode: string;
  speed: number;
  patrol: { node: string; wait: number }[];
  actions: InspectAction[];
  createBot: () => Bot;
}

export const STAFF_PRESETS: Record<string, StaffPreset> = {
  // 1. Context Compactor (Barista Botu - Bellek & Bağlam Sıkıştırıcı)
  barista: {
    id: 'barista',
    name: 'Context Compactor',
    role: 'Bellek & Bağlam Sıkıştırıcı',
    color: 0xff8a65,
    metric: 'Cache Hit: 2.9M token · SQLite Vault: 412 hafıza kaydı',
    placeholder: 'Personele seslen...',
    startNode: 'lounge:coffee',
    speed: 1.15,
    patrol: [
      { node: 'lounge:coffee', wait: 4 },
      { node: 'lounge:in', wait: 0.5 },
      { node: 'war:door_in', wait: 3 },
      { node: 'corr:M', wait: 0.5 }
    ],
    actions: [
      { label: 'Bellek Temizle', icon: 'broom', log: [['cmd', '$ vault gc --stale'], ['ok', '37 eski kayıt arşivlendi, Vault: 375 kayıt']] },
      { label: 'Bağlamı Sıkıştır', icon: 'bolt', effect: 'boost', log: [['cmd', '$ rtk compact --all'], ['ok', 'bağlam %41 küçüldü, önbellek yenilendi']] }
    ],
    createBot: function () {
      const b = makeBot({ body: 0xffb88a, accent: 0xff8a65, model: 'barista', modelLabel: 'Context Compactor' });
      giveMug(b, 0xff7eb6);
      return b;
    }
  },

  // 2. IPC Dispatcher (Courier Botu - Ajanlar Arası Olay & Görev Kuryesi)
  courier: {
    id: 'courier',
    name: 'IPC Dispatcher',
    role: 'Ajanlar Arası Olay & Görev Kuryesi',
    color: 0x6fe3a0,
    metric: 'Kuyruk: 0 bekleyen · DAG Senkron',
    placeholder: 'Personele seslen...',
    startNode: 'corr:R',
    speed: 1.0,
    patrol: [
      { node: 'corr:R', wait: 1 },
      { node: 'server:rack', wait: 3 },
      { node: 'corr:M', wait: 0.5 },
      { node: 'spine:0', wait: 2 },
      { node: 'spine:-1', wait: 0.5 }
    ],
    actions: [
      { label: 'Kuyruğu İncele', icon: 'mail', log: [['info', 'IPC kuyruğu: 0 bekleyen, 14 teslim edildi'], ['ok', 'DAG düğümleri senkron']] },
      { label: 'Öncelikli İlet', icon: 'bolt', effect: 'boost', log: [['cmd', '$ ipc dispatch --priority high'], ['ok', 'öncelikli mesaj kuyruğun başına alındı']] }
    ],
    createBot: function () {
      const b = makeBot({ body: 0x9be8c0, accent: 0x6fe3a0, model: 'courier', modelLabel: 'IPC Dispatcher' });
      givePapers(b);
      return b;
    }
  },

  // 3. Standby Bekçisi (Idler Botu - Kota Koruma & Boşta Bekleme Monitörü)
  idler: {
    id: 'idler',
    name: 'Standby Bekçisi',
    role: 'Kota Koruma & Boşta Bekleme Monitörü',
    color: 0xa66bff,
    metric: 'Tasarruf: %62 (RTK + Idle Sleep) · Cooldown: 0s',
    placeholder: 'Personele seslen...',
    startNode: 'lounge:post',
    speed: 1.0,
    patrol: [],
    actions: [
      { label: 'Kotalar & Limitler', icon: 'gauge', onClick: function () { (window as unknown as { nexusOffice?: { openQuota?: () => void } }).nexusOffice?.openQuota?.(); } },
      { label: 'Kota Durumu', icon: 'shield', log: [['info', 'rate-limit: 5 sa pencere %18 dolu · token bütçesi %34'], ['ok', 'cooldown yok, tüm oturumlar uygun']] },
      { label: 'Hızlı Uyanış', icon: 'bolt', log: [['cmd', '$ standby wake --sessions waiting'], ['ok', 'bekleyen oturum yok, nöbet sürüyor']] }
    ],
    createBot: function () {
      return makeBot({ body: 0xd2b8ff, accent: 0xa66bff, model: 'nexus', modelLabel: 'Standby Bekçisi' });
    }
  }
};
