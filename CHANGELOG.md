# 📝 Değişiklik Günlüğü (CHANGELOG)

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenecektir.  
Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.0.0/) standardına dayanır ve [Semantic Versioning](https://semver.org/lang/tr/) kullanır.

---

## [1.0.0-alpha] - 2026-10-10

### Eklendi
- **Mimari:** Event-First Hybrid Agent Observatory mimari tasarımı oluşturuldu.
- **Tip Güvenliği:** %100 saf TypeScript mimarisi kuruldu (`npx tsc --noEmit` sıfır hata).
- **Resmi MCP SDK:** `@modelcontextprotocol/sdk` (StdioServerTransport + zod) entegrasyonu tamamlandı.
- **Kalıcı Depolama:** Node 24 yerel `node:sqlite` WAL modunda çapraz süreç (`cross-process`) olay ve görev havuzu eklendi.
- **Süreç Yönetimi:** Windows PID takibi ve `taskkill /pid <PID> /T /F` süreç ağacı sonlandırma altyapısı kuruldu.
- **CLI Doğrulama:** Claude Code ve OpenAI Codex gerçek canlı oturum akışı ve token telemetrisi doğrulandı.
- **Dokümantasyon:** 8 Çekirdek Doküman (README, ARCHITECTURE, ROADMAP, CHANGELOG, KNOWLEDGE, TASKS, AGENTS, LICENSE) kuruldu.
- **Lisans:** GNU General Public License v3.0 (GPL-3.0) eklendi.
- **Arşivleme:** Eski `agent-watch` ve prototip `agent-bridge` kodları `Desktop/GitHub/Archives` altına arşivlendi.
