# 7. Geliştirme önerileri

Öncelik sırasıyla. Her madde "neden" ve "kabul ölçütü" içerir.

**Durum (2026-10-23):** 1 (`serve`), 3 (gerçek çıktı testleri), 4 (`doctor`) ve 6'nın hata türü kısmı (`errorKind: rate_limit`) yapıldı. Robotun dinlenme odasına gitmesi gibi sonuçlar tüketici tarafında yapılacak.

| # | Öneri | Neden | Kabul ölçütü |
|---|---|---|---|
| 1 | **`observatory serve`**: SQLite'tan okuyan HTTP + SSE uç noktası (`/events`, `/tasks`) | Tarayıcı SQLite okuyamaz; 3D sahne ve web panel olayları canlı alamıyor | `curl -N localhost:PORT/events` görev başlatınca satır akıtır |
| 2 | **OpenCode izin bayrağını düzelt**: `--dangerously-skip-permissions` yerine `--auto` | Adaptör bugün OpenCode'un bilmediği bir bayrak gönderiyor | `dangerously_skip_permissions: true` ile OpenCode hata vermeden çalışır. Otomatik onay riskli olduğundan açık kullanıcı onayıyla |
| 3 | **Gerçek çıktıyla adaptör testleri (golden dosyalar)** | Bu wiki'nin yazıldığı gün üç adaptör gerçek CLI çıktısını okuyamıyordu; testler geçiyordu | `test/fixtures/<motor>.jsonl` gerçek çıktıdan alınır, adaptör olay listesi eşleşir |
| 4 | **`observatory doctor`** komutu | Hangi program kurulu, giriş var mı, hangi model çalışıyor sorusunu tek komutla yanıtlar | Her motor için "var / yok / giriş yok / model reddedildi" |
| 5 | **Model ve izin ayarı dosyası** (`~/.observatory/config.json`) | Varsayılan modeller şimdi kodda ve ortam değişkeninde; hesap değişince kod değişiyor | Motor başına model, sandbox, zaman aşımı buradan okunur |
| 6 | **Kota / hız sınırı olayı**: `rate_limited` durumu + bekleme süresi | Orkestratör kotası dolan motoru bilmeli; 3D'de robot dinlenme odasına gitmeli | Hata metni kalıbı eşleşince `task.failed` yanında `rate_limit` olayı |
| 7 | **Tier 2: Claude Code kancaları** (`PreToolUse`, `PostToolUse`, `SessionStart`) HTTP'ye gönderir | Observatory dışında açılan oturumlar da görünür. Benzer yaklaşım: [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) | Elle açılan Claude oturumu `watch`'ta görünür |
| 8 | **OpenTelemetry alıcısı** (Claude Code OTel olayları) | Maliyet ve araç sonucu gibi alanlar resmî olarak dışa aktarılıyor ([belge](https://code.claude.com/docs/en/monitoring-usage)) | OTLP uç noktasına gelen olaylar `events` tablosuna yazılır |
| 9 | **Gizli bilgi temizleme** olay yazmadan önce (`sanitizer`) | İstem ve araç girdileri veritabanına yazılıyor; anahtar sızabilir | Bilinen anahtar kalıpları `***` olarak kaydedilir |
| 10 | **`run_fleet`'i isteğe bağlı yap**, worktree varsayılan olmasın | Worktree kullanmayan projelerde sürpriz dal / klasör açar | Bayrak yoksa worktree açılmaz |
| 11 | **Saklama süresi**: eski olayları sil / sıkıştır | `events` tablosu sınırsız büyür | `observatory prune --older-than 30d` |
| 12 | **Web paneli**: TUI'nin tarayıcı sürümü (görev listesi, zaman çizelgesi) | Terminal olmadan izleme, 3D ile aynı veriyi kullanır | Madde 1'in SSE'sine bağlanır |

## Önerilen sıra
`3` → `1` → `4` → `6` → `7`. İlk üçü (test, SSE, doctor) hem güvenilirliği hem 3D bağlantısını açar.

## Yapılmaması gerekenler
- Antigravity OAuth tokenlarını üçüncü taraf bir araca vermek: Google şartları (Bölüm 6) bunu açıkça yasaklar ve hesap kapatma örnekleri yaşandı. Observatory yalnızca resmî `agy.exe`'yi çalıştırmalı, kimlik bilgisini okumamalı.
- Codex `auth.json` içeriğini Observatory'nin okuyup yazması.
