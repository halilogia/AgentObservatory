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
