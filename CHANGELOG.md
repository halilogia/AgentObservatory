# 📝 Değişiklik Günlüğü (CHANGELOG)

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenecektir.  
Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.0.0/) standardına dayanır ve [Semantic Versioning](https://semver.org/lang/tr/) kullanır.

---

## [Unreleased]

- **Canlı AI Ofis Simülasyonu (2026-10-27):** `web/office_sim.js` (saf Canvas 2D, CSP uyumlu) Ajan Operasyon Panosu çekmecesine eklendi. SSE olayları animasyona eşlenir: yazma/komut araçları → masada klavye, okuma/arama → kitaplık, `permission.requested` → ünlem rozeti, `task.completed` → yeşil onay + beyaz tahta sayacı, boşta → kahve/su alanı. Ajana tıklayınca kartı vurgulanır. Test: `test/web_office_sim.test.ts`.
- **Nexus AI 2D & 3D Ofis Entegrasyonu ve Stabilizasyonu (2026-10-26):**
  - **TUI [O] Tuşu Çökme Onarımı (`office_opener.ts`):** Windows `cmd.exe start` argüman ayrıştırmasındaki emoji uyumsuzlukları temiz ASCII başlık (`Nexus AI 2D Office`) ve `/D` çalışma dizini parametresi ile giderildi. ESM modülünde `fileURLToPath(import.meta.url)` üzerinden güvenli yol çözümlemesi ve `child.on('error')` ile tam hata yakalama garantisi sağlandı.
  - **Web Paneli 3D Ofis Entegrasyonu (`index.html`, `app.js`, `app.css`, `web.ts`):** 3D Ofis ayrı sekme yerine ana SPA içerik alanına `#officeView` iframe konteyneri ile entegre edildi. Üst bardaki `#officeBtn` ve kapatma butonu ile kesintisiz görünüm geçişi sağlandı; CSP `frame-src 'self'` ve `frame-ancestors 'self'` ile güvenli gömme yapılandırıldı.
- **Dinamik Effort & Model Kontrolü (Claude, Codex, Agy Eşitliği):**
  - Claude adaptörüne `--effort` ve `--model` eklendi (varsayılan `medium`).
  - OpenAI Codex adaptörüne `--model`, `-c model_reasoning_effort="..."` ve `--dangerously-bypass-approvals-and-sandbox` parametreleri eklendi.
  - Antigravity Agy adaptörüne `--model` parametresi eklendi.
- **Multi-Agent Fleet & Git Worktree Orchestrator (Ajan Ordusu Mimarisi):**
  - `WorktreeManager`: Ajanların birbirlerinin dosyalarını ezmesini önleyen Git Worktree yaşam döngüsü (`createWorktree`, `removeWorktree`, `listWorktrees`, `mergeBranch`).
  - `ResourceBroker`: Donanım ve API kaynaklarını denetleyen eşzamanlılık semaforu (`acquireSlot`), tekil entegrasyon yazıcı mutex kilidi (`acquireIntegrationLock`) ve bayat işçi koruması (`lease fencing`).
  - `FleetOrchestrator`: Kahn algoritmasıyla döngü korumalı DAG görev ağacı planlayıcı, paralel worktree yürütme ve otomatik candidate branch (`fleet/integration/*`) hakemlik motoru.
  - MCP Araçları: `run_fleet`, `list_worktrees`, `cleanup_worktree` eklendi.
- **Demo Modülü:** `src/demo_obligation.ts` ve ilişkili `test/demo_obligation.test.ts` eklendi (`calculateMetrics`, `divideMetrics`).



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
### Güvenlik & Doğruluk İyileştirmeleri (Hardening)
- **P0 Güvenlik Varsayılanları:** `dangerouslySkipPermissions` tüm adaptörlerde varsayılan olarak `false` yapıldı. Codex varsayılan sandbox'ı `workspace-write` olarak kısıtlandı.
- **P0 CWD Doğrulaması:** `validateCwd` eklenerek geçersiz ve sistem kök dizinleri (`C:\Windows` vb.) engellendi.
- **P0 Oturum İzolasyonu:** `CodexAdapter` içindeki paylaşılan `currentSessionId` durumu kaldırıldı; görev bazlı `taskSessions` Map yapısına geçilerek paralel oturum çakışması önlendi.
- **P0 İptal Durum Makinesi:** İptal edilen görevlerin süreç kapandıktan sonra `handleExit` tarafından `failed` olarak ezilmesini engelleyen değiştirilemez terminal durum koruması (`isCancelled` & immutable terminal state) eklendi.
- **Süreç Ağacı Sonlandırma:** `taskkill /pid <PID> /T /F` senkron (`execFileSync`) çalıştırılarak alt süreçlerin yetim kalması önlendi.
- **Veri Tutarlılığı & Olay Sıralaması:** SQLite olayları yerleşik `rowid` üzerinden kesin monotonik artan sıra (`getEventsSinceSeq`) ile dinleniyor. Ardışık aynı içerikli `message.delta` parçaları artık yutulmuyor.
- **İzole Test Paketi:** `test/verify_core.ts` in-memory SQLite (`:memory:`) kullanarak kullanıcı veritabanını kirletmeden 6 aşamalı kapsamlı test icra ediyor.
- **Taşınabilirlik:** Sabit Windows yolları yerine dinamik `resolveBinary` ve çevre değişkeni desteği eklendi. README GitHub repo linki `halilogia` olarak düzeltildi.
