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

## Otomatik izleme penceresi
Bir görev **Observatory üzerinden** başlatılınca (MCP `start_task` / `run_agent`, `observatory run`) ve açık bir izleyici yoksa, `src/runtime/tui_launcher.ts` yeni bir konsol penceresi açar. Pencere `observatory chat latest --follow` çalıştırır: oturumu ajanın CLI görünümünde ([sayfa 11](11-oturum-gorunumu.md)) canlı gösterir ve sonradan gelen görevleri de akıtır.

Gerçek denemeyle doğrulandı (2026-10-23, MCP `start_task`, OpenCode):
- İzleyici yokken görev başlayınca pencere yaklaşık 6 sn içinde açıldı.
- Açık bir izleyici varken ikinci görev başlayınca ikinci pencere **açılmadı**.
- `OBSERVATORY_NO_AUTO_TUI=1` ile hiç açılmadı.

Kurallar: aynı anda en çok bir pencere (15 sn'lik kilit + çalışan işlem denetimi); testlerde (`NODE_ENV=test` veya `test/` altından çalışan betikler) ve Windows dışında kapalı. Eski pano için `OBSERVATORY_TUI_MODE=watch`.

**Not:** Pencereyi yalnızca Observatory üzerinden başlatılan görevler açar. Terminalde elle başlattığın Claude / Codex / OpenCode oturumları ise MCP sunucusu açıkken arka planda kayıt dosyalarından okunur ve açık pencerede görünür: [sayfa 12](12-elle-baslatilan-oturumlar.md). Pencerenin kendisini elle açıp (`chat --follow`) bu oturumları izleyebilirsin.

## Veri nerede?
`~/.observatory/observatory.sqlite` (WAL kipi). Silmek geçmişi sıfırlar; program yeniden oluşturur.
