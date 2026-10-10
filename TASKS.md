# 📋 Aktif Görev Takibi (TASKS)

---

## 🚀 Aktif Sprint (v1.0.0-alpha)

- [/] **Core Engine & Architecture**
  - [x] Eski araçları arşivle (`Archives/agent-watch-legacy`, `Archives/agent-bridge-prototype`).
  - [x] 8'li Core Docs dokümantasyonunu scaffold et.
  - [ ] Node.js `package.json` ve dizin yapısını kur (`src/core`, `src/runtime`, `src/adapters`, `src/ui`, `src/mcp`).
  - [ ] `src/core/types.js`: Ortak Olay Şeması (`TaskEvent`, `TaskState`).
  - [ ] `src/core/event_store.js`: In-Memory olay havuzu ve EventEmitter motoru.

- [ ] **Runtime & Adapters (Tier 1)**
  - [ ] `src/adapters/claude_adapter.js`: Claude Code CLI stream ayrıştırıcı ve session resume.
  - [ ] `src/adapters/codex_adapter.js`: Codex CLI JSONL ayrıştırıcı ve thread resume.
  - [ ] `src/adapters/agy_adapter.js`: Antigravity CLI stream ayrıştırıcı.
  - [ ] `src/runtime/agent_runner.js`: Süreç yaşam döngüsü, iptal (`kill`), timeout yönetimi.

- [ ] **Presentation & Antigravity MCP**
  - [ ] `src/ui/tui.js`: ANSI renkli, canlı yenilenen terminal dashboard.
  - [ ] `src/mcp/mcp_server.js`: Antigravity 2.0 için yerel MCP sunucusu.
  - [ ] `mcp_config.json` güncellemesi ve canlı E2E doğrulama.

---

## ⏳ Backlog

- [ ] Claude Code ve Antigravity için yerel HTTP/IPC Hook sunucusu (Tier 2).
- [ ] Tier 3 Session File Fallback entegrasyonu.
- [ ] SQLite kalıcı olay kaydı.
- [ ] Hermes Agent ve Ollama adaptörleri.

---

## ✅ Tamamlananlar

- [x] Mimari karar analizi ve Event-First yaklaşımının kararlaştırılması.
- [x] Eski prototiplerin güvenli şekilde arşivlenmesi.
