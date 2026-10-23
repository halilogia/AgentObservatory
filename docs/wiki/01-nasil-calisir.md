# 1. Nasıl çalışır

## Benzetme
Bir müteahhit (orkestratör, ör. Antigravity) ustalara iş dağıtıyor. Şantiyeye kamera koymazsan yalnızca "bitti / bitmedi" haberi gelir. Observatory kameradır: ustaların işini değiştirmez, sadece izler ve kaydeder.

## Parçalar

| Parça | Görevi | Dosya |
|---|---|---|
| **Runner** | Ajanın programını çocuk süreç olarak başlatır, süre sınırı ve sessizlik bekçisi kurar, iptal eder | `src/runtime/agent_runner.ts` |
| **Adaptör** | Her ajanın kendi çıktı biçimini ortak olaya çevirir | `src/adapters/*_adapter.ts` |
| **Olay deposu** | Olayları SQLite dosyasına yazar | `src/core/sqlite_store.ts` |
| **TUI** | SQLite'ı 300 ms'de bir okuyup terminalde gösterir | `src/ui/tui.ts` |
| **MCP sunucusu** | Antigravity / Claude Code gibi istemcilere araç olarak sunar | `src/mcp/mcp_server.ts` |

## Akış

```
Ajan CLI  ->  Adaptör  ->  Olay deposu (SQLite)  ->  TUI / MCP / 3D
(kendi formatı)  (ortak format)  (~/.observatory/observatory.sqlite)
```

1. İstemci görev verir (`start_task` veya `observatory run`).
2. Runner süreci başlatır ve bir görev kimliği (`task_mvldqryu_nlsz` gibi) üretir.
3. Süreç ekrana ne yazarsa Runner onu **satır satır** okur (`readline`).
4. Her satırı adaptör `handleStdoutLine` ile olaya çevirir.
5. Süreç kapanınca `handleExit`: çıkış kodu 0 ise `task.completed`, değilse `task.failed`.

## Gerçek örnek (agy)
Komut: `agy -p "Reply with exactly: OK" --model gemini-3.8-flash-low --output-format stream-json`

Ekrana gelen satırlar:

```
{"event":"init","conversation_id":"5af022ec-...","init":{"model":"gemini-3.8-flash-low", ...}}
{"event":"step_update","step_update":{"step_type":"agent_response","text_delta":"OK"}}
{"event":"result","result":{"status":"SUCCESS","usage":{"input_tokens":11317,"output_tokens":1}}}
```

Adaptörün ürettiği olaylar:

| Gelen satır | Olay |
|---|---|
| `init` | `task.started` (oturum `5af022ec-...`) |
| `step_update` + `text_delta:"OK"` | `message.delta` (`OK`) |
| `result` + `usage` | `usage.updated` (girdi 11317, çıktı 1) |
| süreç çıkış kodu 0 | `task.completed` |

Codex ve OpenCode farklı satırlar basar; adaptör hepsini aynı olay listesine çevirir. Ekran ve MCP kodu bu yüzden tek biçimi bilir.

## Neden SQLite dosyası?
Antigravity, Claude Code ve TUI **ayrı süreçlerdir**. Hepsi aynı dosyaya bakar (WAL kipinde, eşzamanlı okuma/yazma güvenli). Birisi çökse bile kayıt kaybolmaz.

## Sınırlar
- Yalnızca **Observatory üzerinden başlatılan** görevleri görür.
- Dışarıda başlatılan oturumlar için tasarlanan Tier 2 (kanca) ve Tier 3 (dosya izleme) henüz yapılmadı (`TASKS.md` Backlog).
- Observatory karar vermez: zorluğa göre motor seçme ve kota yedeği yoktur.
