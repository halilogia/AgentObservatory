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
  - [x] Düşünme çabasını model seçiciden ayır (kendi düğmesi, daha kolay arayüz).
  - [x] Telefondan erişim (mesaj gönderme): sunucu + arayüz + testler tamam (Tailscale, tek kullanımlık kod, cihaz çerezi, hesap kilidi, yerel-özel uçlar, yazma izni varsayılan kapalı). Wiki 14. CLI'lar bilgisayarda çalışır, telefon yalnızca ekran/klavye.
  - [x] Telefon düzeni: dar ekranda içerik 0 genişlikli sütuna düşüyordu (ızgara hatası), alt çubuk taşıyordu; ikisi düzeltildi.
  - [x] Düşünme çabası çubuğu (animasyonlu, motor renginde) + her CLI'nin gerçek seviyeleri (Codex 6, Claude 5, agy 2, OpenCode yok); Codex'te eski `xhigh/max -> high` sınırlaması kaldırıldı (canlı doğrulandı).
  - [ ] Gerçek Tailscale + telefonla uçtan uca deneme (kullanıcı: Tailscale girişi, `tailscale serve --bg 8788`, HTTPS izni).
  - [ ] Eşleştirme için QR kod (bağımlılıksız üretici; şimdilik kod + adres metni).
  - [x] GravityGuard: commit'e yerel yol girmesini engelleyen kapı (varsayılan: engelle, izin listesi + tek seferlik kaçış). GravityGuard reposunda (`e6e58c5`) ve `~/.git-template` şablonunda hazır; testler geçti.
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
