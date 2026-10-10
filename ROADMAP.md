# 🗺️ Agent Observatory Yol Haritası

Bu doküman, projenin sürüm aşamalarını, aktif hedeflerini ve uzun vadeli vizyonunu listeler.

---

## 🎯 Sürüm Aşamaları

### 🚀 v1.0.0 (MVP - Hibrit Temel) - [Aktif Sprint]
- [x] Mimari analizi ve eski sistemlerin arşivlenmesi (`GitHub/Archives`).
- [x] 8'li Core Docs dokümantasyon paketinin kurulumu (GPL-3.0).
- [ ] Ortak Olay Modeli (`types.js`) ve Olay Deposu (`event_store.js`) çekirdeği.
- [ ] Native Stream Adaptörleri:
  - [ ] Claude Code CLI Adapter (`stream-json` parser & session resume).
  - [ ] OpenAI Codex CLI Adapter (`jsonl` parser & thread resume).
  - [ ] Antigravity CLI Adapter (`agy` stream parser).
- [ ] Universal Agent Runner (`agent_runner.js`):
  - [ ] Timeout, AbortController ile anında süreç iptali (`kill`).
  - [ ] Oturum sürekliliği (`session_id`).
- [ ] Canlı Terminal UI (TUI):
  - [ ] ANSI renkli, gerçek zamanlı tek pencereli olay akışı.
- [ ] Antigravity 2.0 MCP Köprüsü:
  - [ ] `run_agent`, `cancel_task`, `list_tasks`, `get_timeline`, `launch_tui` araçları.

---

### ⏳ v1.1.0 (Kancalar & Gelişmiş Entegrasyon) - [Sıradaki]
- [ ] Claude Code Hook Alıcısı (`SessionStart`, `PostToolUse` HTTP/IPC listener).
- [ ] Antigravity IDE Kanca Entegrasyonu (`PreToolUse`, `PostToolUse`).
- [ ] OpenTelemetry (OTel) hafif alıcı modülü.
- [ ] SQLite Kalıcı Olay Geçmişi ve Oturum Arama.
- [ ] Ek CLI desteği: Hermes Agent, Ollama, OpenCode.

---

### 🔮 v2.0.0 (Gelecek Vizyon) - [Gelecek]
- [ ] Web Tabanlı Gerçek Zamanlı Dashboard (WebSocket / SSE).
- [ ] Çoklu Ajan Orkestrasyonu (Agent-to-Agent iş akışları ve delegasyon).
- [ ] Otomatik Token & Maliyet Optimizasyonu (En ucuz/en hızlı modele dinamik yönlendirme).
- [ ] Çapraz Platform Desteği (Linux/macOS terminal entegrasyonu).
