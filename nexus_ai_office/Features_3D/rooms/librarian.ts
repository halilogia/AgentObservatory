// Kütüphaneci botu (ChatGPT Web): kütüphane masasının arkasında durur, aralıklarla elinde kitapla okur.
// Obsidian bilgi kasasının ve ChatGPT Web MCP'sinin bekçisi; tıklanınca kütüphane çekmecesi (staff) açılır.
import * as THREE from 'three';
import { onTick, registerInspectable, unregisterInspectable, STATION_LIBRARY } from '../../core';
import { t, onLanguageChange } from '../../core/i18n';
import { makeBot, createAnimator, giveBook, removeBook } from '../bots';

const ID = 'librarian';
/** masanın (z -10.4, derinlik 0.8) arkasında, kitaplıkla masa arasında */
const POST = { x: STATION_LIBRARY.x, z: STATION_LIBRARY.z - 1.1 };

export function buildLibrarian(parent: THREE.Object3D): void {
  const bot = makeBot({ body: 0xcdb8f0, accent: 0x2dd4bf, glasses: true, bowtie: true, model: 'chatgpt', modelLabel: t('rooms.librarian.name') });
  bot.group.position.set(POST.x, 0, POST.z); bot.group.rotation.y = 0; // ziyaretçilere (+z) bakar
  parent.add(bot.group);
  const anim = createAnimator(bot);
  let phase = -1;
  onTick(function (time, dt) {
    const p = Math.floor(time / 6) % 3; // 6 sn: kitap okur, 12 sn: ziyaretçiye bakar
    const reading = p === 0;
    if (p !== phase) {
      phase = p;
      if (reading) { giveBook(bot, 0x7c3aed); anim.setPose('reading'); } else { removeBook(bot); anim.setPose('idle'); }
    }
    anim.update(dt, time);
  });

  const register = function (): void {
    unregisterInspectable(ID);
    registerInspectable({
      id: ID, kind: 'staff', title: t('rooms.librarian.name'), subtitle: t('rooms.librarian.subtitle'), color: 0x10a37f, object: bot.group,
      focusOffset: new THREE.Vector3(0, 1.0, 0), radius: 1.1, agents: [{ id: ID, name: t('rooms.librarian.name'), role: t('rooms.librarian.role') }],
      metric: t('rooms.librarian.metric'), placeholder: t('rooms.librarian.placeholder'),
      actions: [
        { label: t('rooms.librarian.scan'), icon: 'search', log: [['cmd', '$ obsidian vault scan --links'], ['ok', '412 not tarandı, 38 yeni bağlantı bulundu']] },
        { label: t('rooms.librarian.graph'), icon: 'chart', log: [['info', 'bilgi ağı: 16 düğüm, 27 bağlantı'], ['ok', 'yetim not: 2 (bağlanması önerildi)']] },
        { label: t('rooms.librarian.ask'), icon: 'book', log: [['cmd', '$ chatgpt-web ask --context vault'], ['ok', 'yanıt kasaya not olarak eklendi']] }
      ]
    });
  };
  register();
  onLanguageChange(register);
}
