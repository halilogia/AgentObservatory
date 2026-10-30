# 📦 Arşiv: 2D Piksel RPG Ofis Prototipi (/office)

**Oluşturulma Tarihi:** 30 Ekim 2026  
**Geliştirici Ajan:** OpenAI Codex (`gpt-6-astra`)  
**Durum:** Arşivlendi (Ana üretim kod tabanından ayrıştırıldı)

---

## 📌 Bu Arşivin Amacı ve İçeriği

Bu dizin, bağımsız `/office` rotası için geliştirilmiş olan deneysel 2D Canvas piksel-art RPG ofis prototipini içerir:

- `web/office.html`: Bağımsız retro piksel RPG tam ekran sayfası.
- `web/office_rpg.js`: Canvas 2D render motoru, 4 ajan masası (Antigravity, Claude, Codex, OpenCode), WASD/ok tuşları hareketi, çarpışma algılama, `WORLD`/`DIALOGUE`/`TEXT_INPUT` odak yönetimi ve [E] tuşu ile açılan diyalog sistemi.
- `web/office_rpg.css`: Retro piksel arayüz ve diyalog kutusu stilleri.
- `test/web_office_rpg.test.ts`: RPG hareket, durum makinesi, çarpışma ve görev onay akışı birim testleri.

---

## 🔄 Neden Arşivlendi?

Kullanıcı mevcut dashboard'daki telemetri ve çoklu ajan ofis görselleştirme mimarisini (2D/3D ve hook animasyonları) yeniden değerlendireceği için, aktif web sunucusundaki gereksiz rota ve dosya kalabalığı temizlenmiş; kodlar gelecekte incelenmek üzere bu arşivde güvenle korunmuştur.
