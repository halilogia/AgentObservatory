# 🔭 Agent Observatory

[![License: GPL-3.0](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Runtime](https://img.shields.io/badge/Node.js-v24%2B-green.svg)](https://nodejs.org/)
[![Architecture](https://img.shields.io/badge/Architecture-Event--First%20Hybrid-orange.svg)](ARCHITECTURE.md)
[![Status](https://img.shields.io/badge/Status-Active%20Sprint-brightgreen.svg)](TASKS.md)

> **Agent Observatory**, yerel yapay zekâ CLI ajanlarını (Claude Code, OpenAI Codex, Antigravity CLI, Hermes vb.) tek bir çatı altından yöneten, gerçek zamanlı olay akışlarını (native event streams) ve kancaları (hooks) normalize edip izleyen olay-öncelikli hibrit gözlem ve çalışma zamanı (Observatory & Runtime) platformudur.

---

## ⚡ Hızlı Başlangıç

### 1. Kurulum
```bash
git clone https://github.com/halilogia/AgentObservatory.git
cd AgentObservatory
npm install
```

### 2. Terminal UI (Canlı Telemetri İzleyici)
```bash
node bin/observatory.js watch
```

### 3. Ajan Çalıştırma (CLI / MCP)
```bash
node bin/observatory.js run claude "Dosya yapısını özetle"
node bin/observatory.js run codex "Unit testleri çalıştır"
```

---

## 🏛️ Mimari Özet (3 Kademeli Gözlem)

| Öncelik | Katman | Mekanizma | Kapsam |
| :---: | :--- | :--- | :--- |
| **Tier 1** | **Native Event Stream** | Doğrudan CLI `stdio` (`stream-json` / JSON-RPC) | Observatory tarafından başlatılan tüm görevler |
| **Tier 2** | **Hooks & Telemetry** | HTTP/IPC Kancaları (`PostToolUse`, `SessionStart`) | Harici terminallerde bağımsız başlatılan ajanlar |
| **Tier 3** | **File Watcher Fallback** | Yerel oturum disk tarayıcısı (`.jsonl`) | Kanca ve stream sunamayan arka plan oturumları |

---

## 📚 Dokümantasyon İndeksi

| Doküman | Sorumluluk |
| :--- | :--- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Katmanlar, Olay Modeli, Sorumluluk Ayrımı ve Mermaid diyagramı |
| [ROADMAP.md](ROADMAP.md) | Sürüm hedefleri, MVP ve gelecek vizyon |
| [CHANGELOG.md](CHANGELOG.md) | Sürüm geçmişi (SemVer & Keep a Changelog) |
| [KNOWLEDGE.md](KNOWLEDGE.md) | Kalıcı mühendislik hafızası, tuzaklar ve ADR kararları |
| [TASKS.md](TASKS.md) | Aktif sprint görevleri ve backlog |
| [AGENTS.md](AGENTS.md) | Ajan anayasası, dokunulmaz sınırlar ve kod kuralları |
| [LICENSE](LICENSE) | GNU General Public License v3.0 (GPL-3.0) |
