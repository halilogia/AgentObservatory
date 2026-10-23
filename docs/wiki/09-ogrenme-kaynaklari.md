# 9. Öğrenme kaynakları

Aşağıdaki bağlantılar 2026-10-23'te aramayla bulundu. İçerik özetleri üçüncü taraf listelerinden; kullanmadan önce depo README'sini oku.

## Çoklu ajan izleme (Observatory'ye en yakın)

| Proje | Ne öğretir | Bağlantı |
|---|---|---|
| **disler/claude-code-hooks-multi-agent-observability** | Claude Code kancaları (12 olay türü) → Bun sunucu → SQLite → WebSocket → Vue panel. Tier 2 için en iyi örnek | <https://github.com/disler/claude-code-hooks-multi-agent-observability> |
| **simple10/agents-observe** | Claude Code eklentisi, React arayüz, SQLite sunucu; alt ajan hiyerarşisi ve oturum tekrar oynatma | <https://github.com/simple10/agents-observe> |

## Çoklu ajan yönetimi

| Proje | Ne öğretir | Bağlantı |
|---|---|---|
| **BloopAI/vibe-kanban** | Birden çok kodlama ajanını (Claude Code, Gemini CLI, Codex, Amp) pano üzerinden yönetme; görev kartı → worktree + ajan | <https://github.com/BloopAI/vibe-kanban> |
| **claude-squad** | Birden çok ajanı izole çalışma alanlarında terminal uygulamasıyla yönetme | Yalnızca bir listede adı geçti; resmî depo adresini kendin doğrula |

## Resmî belgeler

| Konu | Bağlantı |
|---|---|
| Claude Code OpenTelemetry (metrik, olay, iz) | <https://code.claude.com/docs/en/monitoring-usage> |
| Claude Code LLM ağ geçidi (desteklenen / desteklenmeyen kullanım) | <https://code.claude.com/docs/en/llm-gateway.md> |
| Antigravity şartları (üçüncü taraf araç yasağı Bölüm 6) | <https://antigravity.google/terms> |
| Antigravity CLI sorun kayıtları | <https://github.com/google-antigravity/antigravity-cli/issues> |
| Model Context Protocol | <https://modelcontextprotocol.io> |

## Ne öğrenmeli, hangi sırayla?
1. disler deposundaki **kanca → olay → panel** akışı (Tier 2 için).
2. Claude Code OpenTelemetry belgesi (maliyet ve araç sonucu alanları).
3. vibe-kanban'ın görev → ajan eşlemesi (yönlendirme fikri için).
4. MCP belirtimi (kendi araçlarını sade tutmak için).
