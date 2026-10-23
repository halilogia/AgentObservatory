# 6. Sorun giderme

Önce motoru Observatory'siz elle çalıştır. Elle çalışmıyorsa sorun Observatory'de değildir.

| Belirti | Olası neden | Çözüm |
|---|---|---|
| Codex: `The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account` | `~/.codex/config.toml` varsayılanı hesapta desteklenmiyor | Adaptör artık `gpt-6-astra` verir. Elle: `codex exec -m gpt-6-astra ...` veya `CODEX_DEFAULT_MODEL` |
| agy "Başarılı" ama yanıt boş (`Çıktı üretilmedi`) | Adaptör eski akış biçimini bekliyordu | `agy_adapter.ts` artık `step_update` / `result` satırlarını okur. Hâlâ boşsa `agy -p "..." --output-format stream-json` çıktısını elle incele |
| agy: `jetski: no output produced ... write_file permission` | Headless modda izin sorulamıyor | Yazma gerekiyorsa bilinçli olarak `dangerously_skip_permissions: true`; yoksa salt-okunur görev ver |
| OpenCode: `spawn EINVAL` | `.cmd` dosyası Node'da doğrudan çalıştırılamaz | `opencode.exe` yolunu kullan (`OPENCODE_BIN` veya `paths.ts` adayı) |
| OpenCode: `No active credentials for provider: codex` | Model verilmedi, varsayılan sağlayıcıda kimlik yok | `model: "opencode/big-pickle"` ver (artık varsayılan) |
| OpenCode dosya yazdı ama yanlış klasöre | `--dir` verilmeden yalnızca süreç cwd'sine güvenildi | Düzeltildi: adaptör `--dir <cwd>` verir |
| OpenCode kabuk komutu çalıştıramıyor | Bilinçli: yazma kipinde `bash` kapalı | Komut gerekiyorsa o görevi Codex'e ver |
| `Geçersiz veya bulunamayan çalışma dizini` | `cwd` yok | Var olan bir klasör ver |
| Görev sonsuza dek `running` | Süreç takıldı | `cancel_task` veya `taskkill /pid <pid> /T /F`; varsayılan süre sınırı 1800 sn |
| agy `-p` hiç dönmüyor | Bazı sürümlerde TTY yoksa takıldığı bildirildi ([google-antigravity/antigravity-cli#318](https://github.com/google-antigravity/antigravity-cli/issues/318)) | Bu makinede Observatory üzerinden denendiğinde çalıştı; takılırsa zaman aşımıyla iptal et |
| `watch` boş görünüyor | Varsayılan olarak yalnızca yeni olayları gösterir | `watch --history` |

## Hata türü (`errorKind`)
Bir görev `task.failed` olduğunda olayın `data.errorKind` alanı nedenini söyler (`src/core/failure.ts`):

| `errorKind` | Anlamı | Orkestratör ne yapmalı |
|---|---|---|
| `rate_limit` | Kota / hız sınırı (`data.cooldownMs` bekleme tahmini, ipucu yoksa 30 dk) | Başka motora geç, bunu bekletme |
| `model_unsupported` | Hesap bu modeli desteklemiyor | Model değiştir |
| `auth` | Giriş yok / kimlik bilgisi eksik | Kullanıcıdan giriş iste |
| `permission` | Headless modda izin sorulamadı | Salt-okunur görev ver veya izni bilinçli aç |
| `spawn_failed` | Süreç hiç başlamadı (`ENOENT`, `EINVAL`, `EACCES`): yol yanlış veya `.cmd` dosyası | `observatory doctor` ile yolu kontrol et |
| `unknown` | Diğer | Hata metnine bak |

`errorKind` iki yerde yazılır: ajan çıkış kodu sıfır dışı kapanınca (`base_adapter.ts`) ve süreç hiç başlayamayınca (`agent_runner.ts`). İptal (`task.cancelled`) ayrı bir olaydır.

## Test
```bash
npm test
```
`verify_core.ts` komut kurma ve olay işlemeyi, `adapter_fixtures.test.ts` ise `test/fixtures/` altındaki **gerçek CLI çıktılarını** (agy, codex, opencode: "Reply with exactly: OK") adaptörlerden geçirip yanıtın `OK` çıktığını doğrular. Hata sınıflandırması da burada sınanır. Gerçek CLI'ı çalıştırmak için `doctor --live` kullan.

## Hızlı canlı doğrulama
MCP üzerinden her motora salt-okunur "Reply with exactly: OK" göndermek, üç motorun da yaklaşık 16-25 saniyede `OK` döndürdüğünü gösterdi (2026-10-23).
