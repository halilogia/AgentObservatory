# 3. MCP araçları

MCP (Model Context Protocol), bir yapay zekâ istemcisinin (Claude Code, Antigravity) dışarıdaki araçları çağırma standardıdır. Observatory bir **MCP sunucusu** olarak 14 araç sunar.

Sunucu adı: `AgentObservatory`. Başlatma: `node --experimental-strip-types src/cli.ts mcp` (stdio).

## Araçlar

| Araç | Ne yapar | Ne zaman |
|---|---|---|
| `run_agent` | Görevi çalıştırır ve **bitince** raporu döner | Kısa, tek görev |
| `start_task` | Görevi arka planda başlatır, hemen `taskId` döner | Paralel / uzun görev |
| `get_task` | `taskId` ile durumu ve yanıtı getirir | `start_task` sonrası |
| `list_tasks` | Görevleri listeler | Genel bakış |
| `cancel_task` | Süreç ağacını `taskkill` ile kapatır | Takılan görev |
| `run_claude`, `run_codex`, `run_agy` | Motora özel kısayollar | Motor sabitse |
| `list_agent_sessions` | Son oturumlar | Devam ettirmek için `session_id` bul |
| `launch_observatory_tui`, `launch_agent_watch` | İzleme penceresini açar | İzlemek için |
| `run_fleet`, `list_worktrees`, `cleanup_worktree` | DAG bağımlılıklı çoklu ajan, **git worktree** ile izole | Worktree kullanmayan projelerde kullanma |

## `run_agent` / `start_task` parametreleri

| Parametre | Değer | Not |
|---|---|---|
| `agent` | `claude`, `codex`, `agy`, `opencode`, `freebuff` | zorunlu |
| `prompt` | metin | zorunlu |
| `cwd` | klasör yolu | doğrulanır, yoksa hata |
| `session_id` | oturum / thread kimliği | önceki oturuma devam |
| `sandbox` | `read-only`, `workspace-write`, `danger-full-access` | Codex için; varsayılan `workspace-write` |
| `dangerously_skip_permissions` | `true` / `false` | **varsayılan false**; yalnızca bilerek aç |
| `timeout_seconds` | sayı | varsayılan 1800 |
| `effort` | `low` ... `max` | Claude / Codex |
| `model` | metin | boşsa motorun varsayılanı |
| `detailed` | `true` / `false` | `true` ise ayrıntılı araç günlüğü |

## Örnek: paralel iki görev

1. `start_task { agent: "codex", prompt: "tests/ klasöründeki testleri çalıştır", sandbox: "read-only" }` → `task_aaa`
2. `start_task { agent: "agy", prompt: "README.md'yi özetle" }` → `task_bbb`
3. `get_task { task_id: "task_aaa" }`, `get_task { task_id: "task_bbb" }` ile sonuçları topla.

## Rapor biçimi
Araçlar kompakt bir rapor döner: ajan, durum, süre, görev kimliği, oturum, token sayıları ve yanıt metni. `detailed: true` ile araç çağrıları da gelir.

## Güvenlik notları
- `dangerously_skip_permissions` motorlarda farklı bayraklara karşılık gelir; her ajanın sayfasına bak: [Motorlar](04-motorlar-ve-adaptorler.md).
- Gerçek olay kayıtlarında istem metni ve araç girdileri saklanır; gizli anahtar içeren istemler göndermeyin.
