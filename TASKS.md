# 📋 Aktif Görev Takibi (TASKS)

---

## 🚀 Aktif Sprint (v1.0.0-alpha)




### Web arayüzü (2026-10-24)
  - [x] Nexus AI 3D Ofisinin ana web paneline SPA olarak %100 entegre gömülmesi (`#officeView`, CSP frame-ancestors/frame-src).
  - [x] TUI [O] tuşu TrueColor 2D ofis açılışındaki çökme hatasının çözülmesi (ASCII başlık, `/D` flag, ESM yol koruması, error listener).

### Orkestra: Claude orkestratör + küçük model sürüsü + Claude↔Codex GAN döngüsü (2026-10-24)
  - [ ] Pilot: küçük gerçek bir işte (kota harcayarak) denemek; onay bekliyor.
  - [ ] Observatory: tek çağrıda çok-model sürüsü (`run_swarm`) ve döngü kaydı; pilot sonucuna göre.

### Yetenekler, telefon, yerel yol kapısı (2026-10-24)
  - [ ] Projeler: sohbeti sonradan projeye taşıma; proje adıyla universal-memory bağlamı (opt-in, onay kararı bekliyor).
  - [ ] DİKKAT: `src/commands/web.ts` başka bir ajan/kullanıcı tarafından değiştirilmiş (varsayılan kök kaldırıldı, Public/Private düzleştirme kalktı, liste 50); `test/web.test.ts` bu yüzden kırmızı. Sahibi karar vermeli.
  - [ ] Gerçek Tailscale + telefonla uçtan uca deneme (kullanıcı: Tailscale girişi, `tailscale serve --bg 8788`, HTTPS izni).
  - [ ] Eşleştirme için QR kod (bağımlılıksız üretici; şimdilik kod + adres metni).
  - [ ] Yerel yol kapısını mevcut 25 deponun `.git/hooks` klasörüne dağıtmak: toplu kanca değişikliği otomatik izne takıldı, kullanıcı çalıştıracak (`python ~/.git-template/rollout_path_gate.py --apply`).
  - [x] AgentObservatory test verilerindeki yerel yollar `Kullanici` ile değiştirildi (eski commit geçmişinde duruyor; geçmişi yeniden yazmak kullanıcı kararı).

---

## ⏳ Backlog

- [ ] Claude Code ve Antigravity için yerel HTTP/IPC Hook sunucusu (Tier 2).
- [x] Tier 3 Session File Fallback entegrasyonu (`src/ingest/`, Claude/Codex/OpenCode).
- [x] Web sohbet arayüzü (`observatory web`): aydınlık/koyu tema, TR/EN, geçmiş, markdown.
- [ ] Hermes Agent ve Ollama adaptörleri.

---

## ✅ Tamamlananlar

- [x] Mimari karar analizi ve Event-First yaklaşımının kararlaştırılması.
- [x] Eski prototiplerin güvenli şekilde arşivlenmesi.
