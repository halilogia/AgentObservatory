# 📜 Tasks Log (Görev Arşivi)

> Bu dosya GravityGuard Task Archiver tarafından otomatik yönetilir.
> tasks.md dosyasının şişmesini önlemek için tamamlanan görevler buraya aktarılır.

## [2026-10-23]
- [x] **Core Engine & Architecture (TypeScript)**
  - [x] Eski araçları arşivle (`Archives/agent-watch-legacy`, `Archives/agent-bridge-prototype`).
  - [x] 8'li Core Docs dokümantasyonunu scaffold et.
  - [x] Node.js `package.json` ve saf TypeScript dizin yapısını kur (`src/core`, `src/runtime`, `src/adapters`, `src/ui`, `src/mcp`).
  - [x] `src/core/types.ts`: Ortak Olay Şeması (`TaskEvent`, `TaskState`).
  - [x] `src/core/event_store.ts`: In-Memory olay havuzu ve EventEmitter motoru.
  - [x] `src/core/sqlite_store.ts`: Node 24 `node:sqlite` WAL kalıcı çapraz süreç veritabanı.
- [x] **Runtime & Adapters (Tier 1)**
  - [x] `src/adapters/claude_adapter.ts`: Claude Code CLI stream ayrıştırıcı ve session resume.
  - [x] `src/adapters/codex_adapter.ts`: Codex CLI JSONL ayrıştırıcı ve thread resume.
  - [x] `src/adapters/agy_adapter.ts`: Antigravity CLI stream ayrıştırıcı.
  - [x] `src/runtime/agent_runner.ts`: Süreç yaşam döngüsü, PID tabanlı `taskkill` iptal yönetimi.
- [x] **Presentation & Antigravity MCP**

## [2026-10-25]
  - [x] `src/ui/tui.ts`: ANSI renkli, canlı SQLite WAL polling destekli terminal dashboard.
  - [x] `src/mcp/mcp_server.ts`: Resmi `@modelcontextprotocol/sdk` (StdioServerTransport + zod) MCP sunucusu.
  - [x] Canlı E2E testleri (Claude ve Codex CLI gerçek görev ve token akışı doğrulaması).
  - [x] Sade arayüz (alt yazı, öneri çipleri, boş durum metni kaldırıldı) + kahve fincanı (şeffaf).
  - [x] Klasör ekle: yol yazarak proje klasörü ekleme, `~/.agent-observatory/web.json`, varsayılan kök = başlatılan klasörün üstü.
  - [x] Model/motor değişiminde bağlamı taşı (önceki konuşma özeti yeni motora ilk istemle gider).
  - [x] Eski noktaya dön: sohbeti seçilen mesaja geri sar; Yazabilir kipinde dosyaları git ağacı anlık görüntüsüyle geri al.
  - [x] Kaynak videodan (Avenox, 07:22-07:37) çıkarım: büyük model orkestratör, çok sayıda küçük model alt ajan; küçük modeller kısıtlara uymayabilir (06:36-06:46).
  - [x] `swarm` becerisine "hipotez sürüsü" bölümü (farklı aileden küçük modeller, salt okunur, çoğunluk/aykırı değer ayrımı, ben doğrularım).
  - [x] Yeni `gan-dongusu` becerisi: Üretici (Claude) ↔ Ayırt edici (Codex, kanıtlı saldırı), gerçek test = ground truth, durma ölçütleri.
  - [x] Yetenekler penceresi: her CLI'nin skill / ajan / komut / MCP / eklenti adlarını göster (salt okunur; yalnızca adlar ve açıklamalar, gizli değerler okunmaz).
  - [x] Düşünme çabasını model seçiciden ayır (kendi düğmesi, daha kolay arayüz).
  - [x] Telefondan erişim (mesaj gönderme): sunucu + arayüz + testler tamam (Tailscale, tek kullanımlık kod, cihaz çerezi, hesap kilidi, yerel-özel uçlar, yazma izni varsayılan kapalı). Wiki 14. CLI'lar bilgisayarda çalışır, telefon yalnızca ekran/klavye.
  - [x] Telefon düzeni: dar ekranda içerik 0 genişlikli sütuna düşüyordu (ızgara hatası), alt çubuk taşıyordu; ikisi düzeltildi.
  - [x] Düşünme çabası çubuğu (animasyonlu, motor renginde) + her CLI'nin gerçek seviyeleri (Codex 6, Claude 5, agy 2, OpenCode yok); Codex'te eski `xhigh/max -> high` sınırlaması kaldırıldı (canlı doğrulandı).
  - [x] Projeler: ad + klasör + talimatlar, kenar çubuğunda gruplu sohbetler, başlıkta proje rozeti; talimatlar yeni oturum başında `<PROJECT_INSTRUCTIONS>` (test + tarayıcıda doğrulandı).
  - [x] GravityGuard: commit'e yerel yol girmesini engelleyen kapı (varsayılan: engelle, izin listesi + tek seferlik kaçış). GravityGuard reposunda (`e6e58c5`) ve `~/.git-template` şablonunda hazır; testler geçti.
