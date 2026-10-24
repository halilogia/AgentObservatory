# 📋 Aktif Görev Takibi (TASKS)

---

## 🚀 Aktif Sprint (v1.0.0-alpha)



  - [x] `src/ui/tui.ts`: ANSI renkli, canlı SQLite WAL polling destekli terminal dashboard.
  - [x] `src/mcp/mcp_server.ts`: Resmi `@modelcontextprotocol/sdk` (StdioServerTransport + zod) MCP sunucusu.
  - [x] Canlı E2E testleri (Claude ve Codex CLI gerçek görev ve token akışı doğrulaması).

### Web arayüzü (2026-10-24)
  - [x] Sade arayüz (alt yazı, öneri çipleri, boş durum metni kaldırıldı) + kahve fincanı (şeffaf).
  - [x] Klasör ekle: yol yazarak proje klasörü ekleme, `~/.agent-observatory/web.json`, varsayılan kök = başlatılan klasörün üstü.
  - [x] Model/motor değişiminde bağlamı taşı (önceki konuşma özeti yeni motora ilk istemle gider).
  - [x] Eski noktaya dön: sohbeti seçilen mesaja geri sar; Yazabilir kipinde dosyaları git ağacı anlık görüntüsüyle geri al.

### Orkestra: Claude orkestratör + küçük model sürüsü + Claude↔Codex GAN döngüsü (2026-10-24)
  - [x] Kaynak videodan (Avenox, 07:22-07:37) çıkarım: büyük model orkestratör, çok sayıda küçük model alt ajan; küçük modeller kısıtlara uymayabilir (06:36-06:46).
  - [x] `swarm` becerisine "hipotez sürüsü" bölümü (farklı aileden küçük modeller, salt okunur, çoğunluk/aykırı değer ayrımı, ben doğrularım).
  - [x] Yeni `gan-dongusu` becerisi: Üretici (Claude) ↔ Ayırt edici (Codex, kanıtlı saldırı), gerçek test = ground truth, durma ölçütleri.
  - [ ] Pilot: küçük gerçek bir işte (kota harcayarak) denemek; onay bekliyor.
  - [ ] Observatory: tek çağrıda çok-model sürüsü (`run_swarm`) ve döngü kaydı; pilot sonucuna göre.

### Yetenekler, telefon, yerel yol kapısı (2026-10-24)
  - [x] Yetenekler penceresi: her CLI'nin skill / ajan / komut / MCP / eklenti adlarını göster (salt okunur; yalnızca adlar ve açıklamalar, gizli değerler okunmaz).
  - [ ] Telefondan erişim (mesaj gönderme): erişim yöntemi kararı bekliyor (öneri: Tailscale + eşleştirme kodu).
  - [ ] GravityGuard: commit'e yerel yol (`C:\Users\<ad>\...`) girmesini engelleyen kapı (`publication_guard.py`); karar bekliyor.

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
