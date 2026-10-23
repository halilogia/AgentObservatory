# 2. Kurulum ve kullanım

## Gereksinimler
- Node.js 24+ (`node:sqlite` ve `--experimental-strip-types` kullanılır)
- Kullanacağın ajan CLI'ları kurulu ve giriş yapılmış olmalı: `claude`, `codex`, `agy`, `opencode`

```bash
cd AgentObservatory
npm install
npm test
```

## Komutlar

| Komut | Ne yapar |
|---|---|
| `node bin/observatory.js run <ajan> "<istek>"` | Ajanı çalıştırır ve canlı izler. Ajan: `claude`, `codex`, `agy` (diğerleri MCP üzerinden) |
| `node bin/observatory.js watch` | Canlı olay akışı. Varsayılan: yalnızca yeni olaylar |
| `node bin/observatory.js watch --history` | Geçmiş olaylarla birlikte |
| `node bin/observatory.js sessions` | Son oturumlar listesi. Yukarı/aşağı ok ile seç, `C` canlı, `S` liste, `Q` çıkış |
| `node bin/observatory.js inspect <taskId>` | Tek görevin tüm olayları |
| `node bin/observatory.js mcp` | MCP sunucusunu stdio üzerinde başlatır |
| `node bin/observatory.js chat [taskId] [--follow]` | Oturumu ajanın CLI görünümünde gösterir ([ayrıntı](11-oturum-gorunumu.md)) |
| `node bin/observatory.js doctor` | Hangi ajan kurulu, sürümü ne |
| `node bin/observatory.js doctor --live` | Her ajana kısa bir "OK" görevi verip gerçekten yanıt veriyor mu bakar |
| `node bin/observatory.js serve [--port 8787]` | Olayları HTTP + SSE ile yayınlar ([API](10-http-sse-api.md)) |

Masaüstünde `Agent Observatory.bat` aynı TUI'yi açan bir kısayoldur (1: canlı, 2: oturum listesi, 3: geçmiş).

## İlk görev (iki terminal)

Terminal 1, izleyici:

```bash
node bin/observatory.js watch
```

Terminal 2, görev:

```bash
node bin/observatory.js run codex "Bu klasörün dosya yapısını özetle"
```

Terminal 1'de `task.started`, `tool.invoked`, `message.delta`, `usage.updated`, `task.completed` olayları akar.

## Ortam değişkenleri

| Değişken | Anlamı | Varsayılan |
|---|---|---|
| `CLAUDE_BIN`, `CODEX_BIN`, `AGY_BIN`, `OPENCODE_BIN`, ... | Ajan programının tam yolu | `src/core/paths.ts` içindeki aday listesi |
| `CODEX_DEFAULT_MODEL` | Model verilmediğinde Codex modeli | `gpt-6-astra` |
| `OPENCODE_DEFAULT_MODEL` | Model verilmediğinde OpenCode modeli | `opencode/big-pickle` |

## Claude Code'a MCP olarak ekleme

```bash
claude mcp add agent-observatory --scope user -- node --experimental-strip-types "C:\Users\Halil Emre\Desktop\GitHub\Public\AgentObservatory\src\cli.ts" mcp
claude mcp list
```

Yeni bir Claude Code oturumunda araçlar `mcp__agent-observatory__*` adıyla görünür. Ayrıntı: [MCP araçları](03-mcp-araclari.md).

## Veri nerede?
`~/.observatory/observatory.sqlite` (WAL kipi). Silmek geçmişi sıfırlar; program yeniden oluşturur.
