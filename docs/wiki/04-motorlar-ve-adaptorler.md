# 4. Motorlar ve adaptörler

Adaptör = bir ajanın komutunu kuran (`buildCommand`) ve çıktı satırlarını olaya çeviren (`handleStdoutLine`) sınıf. Ortak taban: `src/adapters/base_adapter.ts`.

## Karşılaştırma

| Motor | Çıktı biçimi | Varsayılan model | Yazma izni | Not |
|---|---|---|---|---|
| **claude** | `stream-json` | Claude hesabı varsayılanı | `dangerously_skip_permissions` | Oturum devam ettirme (`--resume`) |
| **codex** | `exec --json` (JSONL) | `gpt-6-astra` | `sandbox: workspace-write` | `~/.codex/config.toml` varsayılanı (`gpt-6.1-sol`) ChatGPT hesabında 400 verdiği için adaptör modeli her zaman açıkça verir |
| **agy** | `--output-format stream-json` | agy varsayılanı | Headless modda izin sorulamaz; yazma `--dangerously-skip-permissions` ister | Gerçek akış: `init`, `step_update`, `result` |
| **opencode** | `run --format json` | `opencode/big-pickle` | `read-only`: yerleşik `plan` ajanı (dosya değiştiremez). Diğer: dosya düzenleme açık, **kabuk ve web kapalı** (`OPENCODE_CONFIG_CONTENT`). `dangerously_skip_permissions` OpenCode'da karşılıksızdır, otomatik onay bayrağı eklenmez | `opencode.exe` doğrudan çağrılır (`.cmd` Node'da `spawn EINVAL` verir); `--dir` açıkça verilir |
| **freebuff** | yok | -- | -- | **Headless çalışmaz** (0.2.29, gerçek denemeyle doğrulandı): CLI konumsal argüman olarak yalnızca `login` kabul eder, istem verilince hata verir. Adaptör bu yüzden açık bir hata fırlatır (`OBSERVATORY_FREEBUFF_EXPERIMENTAL=1` ile eski davranış). Freebuff'ı elle, etkileşimli kullan |

## Ajan programının bulunması
`resolveBinary(name)` (`src/core/paths.ts`) sırayla bakar:
1. `<AD>_BIN` ortam değişkeni
2. Bilinen kurulum yolları (ör. `%LOCALAPPDATA%\agy\bin\agy.exe`)
3. PATH

OpenCode için sıra: `~/.opencode/bin/opencode.exe`, ardından npm paketinin içindeki `opencode.exe`, sonra `opencode.cmd`.

## Yeni motor eklemek
1. `src/adapters/<ad>_adapter.ts` oluştur, `BaseAdapter`'dan türet.
2. `buildCommand` içinde komut, bayraklar, model ve `resolveBinary('<ad>')` döndür.
3. `handleStdoutLine` içinde gerçek çıktı satırlarını `createEvent` ile olaya çevir. **Önce motoru elle çalıştırıp gerçek çıktıyı kaydet**, tahmin etme.
4. `src/core/types.ts` içindeki `AgentType`'a ekle, `paths.ts`'e aday yolları yaz.
5. `test/` altına gerçek çıktıdan alınmış örnek satırlarla test ekle.

## Bilinen farklar (gerçek denemeyle bulundu)
- agy `-p` çıktısı `PLANNER_RESPONSE` değil `event: step_update` biçimindedir; yanıt metni `text_delta` alanındadır.
- opencode `--format json` metni `part.text` içinde verir; `step_start` yalnızca adım işaretidir.
- Codex `--sandbox read-only` ile yazamaz; kod yazdıracaksan `workspace-write`.
