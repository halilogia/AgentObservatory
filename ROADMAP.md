# 🗺️ Agent Observatory Yol Haritası

Bu doküman, projenin ana sürüm kilometre taşlarını ve uzun vadeli vizyonunu listeler. Günlük aktif sprint ve görev takibi için tasks.md kullanılır.

---

## 🎯 Sürüm Kilometre Taşları (Milestones)

### 🚀 v1.0.0 (MVP - Hibrit Temel) - [Tamamlandı]
- [x] Olay-Öncelikli (Event-First) hibrit mimari ve SQLite kalıcı olay deposu (events.db).
- [x] 6 CLI Ajan Adaptörü (Claude Code, OpenAI Codex, Antigravity, OpenCode, Freebuff, Command Code).
- [x] Süreç yaşam döngüsü, iptal durum makinesi ve güvenlik denetimleri.

### 🛰️ v1.1.0 (Mission Control & Çoklu Ajan) - [Tamamlandı]
- [x] Web gösterge paneli, SSE canlı akışı, mobil QR eşleştirme ve AI ofis simülasyonu.
- [x] Temel domain modelleri (Mission, MissionContract, TaskNode, AgentRun) ve kalıcılık şeması.
- [x] Adaptive Mission Orchestrator (Yetenek tabanlı yönlendirme, direct runner ve deterministik DAG scheduler).
- [x] Git Worktree izolasyonu ve otomatik Acceptance Gate (İzole çalışma ve temiz merge).
- [x] Mission Control Web Arayüzü (Mission Composer, canlı DAG ağacı, Agent Fleet, sekmeli Git Diff paneli).
- [x] Telemetri & Akıllı Yönlendirme (p50/p95, başarı oranı, routing skoru).

---

## 🔮 v2.0.0 (Gelecek Vizyon & İleri Fikirler)
- [ ] Dağıtık Ajan Düğüm Ağı (Farklı yerel makinelerdeki CLI'ları tek dashboard'da kümeleme).
- [ ] Dinamik Token & Maliyet Arbitrajı (Ajanlar arasında anlık hız/maliyet optimizasyonu).
- [ ] Bağımsız Headless CI/CD Bot Modu (GitHub Actions ve yerel Git hook tetikleyicileri).
- [ ] Tam Sesli Ajan Komuta Hattı (Yerel Whisper & ElevenLabs sesli diyalog).
