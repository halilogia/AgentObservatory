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
