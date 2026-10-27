# 🗺️ Agent Observatory Yol Haritası (Mission Control & Adaptive Orchestrator)

Bu doküman, projenin sürüm aşamalarını, tamamlanan kilometre taşlarını ve aktif fazlarını listeler.

---

## 🎯 Tamamlanan Sürümler & Altyapı
- [x] **v1.0.0 (MVP - Hibrit Temel):** Event-First mimari, SQLite kalıcı olay deposu (events.db), 6 CLI adaptörü (Claude Code, OpenAI Codex, Antigravity, OpenCode, Freebuff, CommandCode).
- [x] **v1.1.0 (Web UI & Gözlemlenebilirlik):** Web gösterge paneli, SSE canlı akış, TUI ofis simülasyonu, mobil QR eşleştirme (qr.js).
- [x] **Multi-Agent Fleet & Git Worktree:** WorktreeManager, ResourceBroker, FleetOrchestrator ve MCP entegrasyonu.

---

## 🚀 Yeni Nesil Mimari: Adaptive Mission Orchestrator (F0 - F8)

| Faz | Açıklama | Durum |
| :--- | :--- | :---: |
| **F0** | Mevcut router ve 30 test paketinin regresyon kilidi | ✅ [x] Tamamlandı |
| **F1** | Domain Modelleri (mission_types.ts) ve SQLite Kalıcılığı (sqlite_store.ts) | ✅ [x] Tamamlandı (45ca235) |
| **F2** | AgentAdapter Standardizasyonu & Capability Discovery (probe()) | 🟡 [ ] **Aktif Sprint** |
| **F3** | SQLite State Machine & Crash Recovery (PID Heartbeat & Lease Fencing) | ⏳ [ ] Sıradaki |
| **F4** | Mission Contract & Direct Mode (Regex'siz Tek Ajan Yürütme) | ⏳ [ ] Sıradaki |
| **F5** | Task Graph (DAG) Scheduler & Validator | ⏳ [ ] Sıradaki |
| **F6** | Mission Control Web UI (Task Graph, Agent Fleet, Diff Viewer) | ⏳ [ ] Sıradaki |
| **F7** | Git Worktree İzolasyonu & Immutable Review Gates | ⏳ [ ] Sıradaki |
| **F8** | Performans Odaklı Telemetri & Dinamik Routing | ⏳ [ ] Sıradaki |
