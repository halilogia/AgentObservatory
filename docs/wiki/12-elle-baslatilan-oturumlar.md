# 12. Elle başlatılan oturumlar (Tier 3: `observatory ingest`)

Sorun: Terminale doğrudan `codex`, `claude` veya `opencode` yazıp başlattığın oturumu Observatory görmüyordu; yalnızca kendi başlattığı görevleri görüyordu.

Çözüm: Ajanların kendi **kayıt dosyalarını salt okunur** okuyup olay deposuna eklemek. Kamera benzetmesiyle: ustalar artık kameradan habersiz çalışsa da, defterlerini (günlük dosyalarını) okuyup aynı kayda geçiriyoruz.

| Ajan | Okunan kaynak | Biçim |
|---|---|---|
| **claude** | `~/.claude/projects/<proje>/<oturum>.jsonl` | JSONL (`user`, `assistant`, `tool_use`, `tool_result`) |
| **codex** | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | JSONL (`response_item`, `event_msg`) |
| **opencode** | `~/.local/share/opencode/opencode.db` | SQLite (`session`, `message`, `part`), salt okunur |
| agy | (yok) | Antigravity kayıtları ayrı biçimde; henüz desteklenmiyor |

Kimlik bilgisi dosyalarına (`auth.json` vb.) dokunulmaz; yalnızca sohbet kayıtları okunur.

## Kullanım
```bash
node bin/observatory.js ingest --follow                 # canlı izle (Ctrl+C ile çık)
node bin/observatory.js ingest                          # bir kez tara
node bin/observatory.js ingest --backfill --active-minutes 120   # son 2 saatin oturumlarını baştan al
node bin/observatory.js ingest --sources claude,opencode
```

**Otomatik:** Observatory MCP sunucusu açıkken (Claude Code oturumu açıkken) arka planda kendiliğinden çalışır. Kapatmak için `OBSERVATORY_NO_INGEST=1`. Birden çok sunucu işlemi açıksa yalnızca biri okur (kilit dosyası `agent_observatory_ingest.lock`, 6 sn eskirse devralınır).

## Nasıl olaylara dönüşür?
- Her **kullanıcı istemi bir görev** olur: `ext_<ajan>_<oturum>_<sıra>` (ör. `ext_claude_024d25c1eb_1`). Önceki tur bitmeden yeni istem gelirse önceki `task.cancelled` olur.
- Metin → `message.delta`, araç çağrısı → `tool.invoked`, sonucu → `tool.completed`, token → `usage.updated`, tur sonu → `task.completed`.
- Olay `data.external: true` ve `tier: 3` taşır. Kimlik, satırın dosyadaki bayt konumundan türetilir: aynı satır iki kez okunsa bile tek kayıt olur.
- Sistemin eklediği bağlam (`<system-reminder>`, `<recommended_plugins>`, AGENTS.md metni) istem sayılmaz.
- Claude alt ajan (sidechain) satırları ve Codex koruyucu (guardian) inceleme alt oturumları atlanır.
- **Çift kayıt önleme:** Observatory'nin kendi başlattığı görev aynı istem ve ±3 dk içinde kayıtlıysa o tur dış olay olarak eklenmez.
- Codex kota hatası (`task_complete.error`) `task.failed` + `errorKind: rate_limit` olur.

Sonucu izlemek: `observatory chat --follow` (ajanın kendi CLI görünümüyle) veya `observatory serve` API'si; dış görevler `ext_` önekiyle ayrılır.

## Gerçek denemeler (2026-10-23)
- Elle başlatılan `claude -p "... BG-CLAUDE"` ve `opencode run "... BG-OC"` MCP sunucusunun arka plan izleyicisiyle birkaç saniyede `completed` görev olarak göründü, yanıt metinleri doğru.
- Codex ayrıştırıcısı gerçek rollout dosyalarına karşı denendi: 49 görev, 1663 olay. Canlı Codex denemesi, ChatGPT kullanım limiti dolduğu için yapılamadı; limit hatası ise gerçek kayıttan doğru okundu.

## Gizlilik
Bu özellik, ajanlarla yaptığın **bütün** konuşmaların metnini ve araç çıktılarını Observatory veritabanına kopyalar (`~/.observatory/observatory.sqlite`). Veritabanı yereldir ve `serve` yalnızca `127.0.0.1`'e bağlanır, ama veritabanı dosyasını paylaşma. İstemezsen `OBSERVATORY_NO_INGEST=1`.

## Sınırlar
- Yalnızca ingest çalışırken yazılan satırlar yakalanır; çalışmadığı zamanın oturumları için `--backfill`.
- Gerçek bir "oturum bitti" sinyali olmayan turlar (kapatılan terminal) açık görünebilir.
- Claude Code kancalarıyla (Tier 2) izleme yapılmadı: kayıt dosyası yöntemi yapılandırma değiştirmeden, her ajan için çalıştığı için seçildi.
