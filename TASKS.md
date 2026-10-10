# 📋 Aktif Görev Takibi (TASKS)

---

## 🚀 Aktif Sprint (v1.0.0-alpha)

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
  - [x] `src/ui/tui.ts`: ANSI renkli, canlı SQLite WAL polling destekli terminal dashboard.
  - [x] `src/mcp/mcp_server.ts`: Resmi `@modelcontextprotocol/sdk` (StdioServerTransport + zod) MCP sunucusu.
  - [x] Canlı E2E testleri (Claude ve Codex CLI gerçek görev ve token akışı doğrulaması).

---

## ⏳ Backlog

- [ ] Claude Code ve Antigravity için yerel HTTP/IPC Hook sunucusu (Tier 2).
- [ ] Tier 3 Session File Fallback entegrasyonu.
- [ ] Hermes Agent ve Ollama adaptörleri.

---

## ✅ Tamamlananlar

- [x] Mimari karar analizi ve Event-First yaklaşımının kararlaştırılması.
- [x] Eski prototiplerin güvenli şekilde arşivlenmesi.
