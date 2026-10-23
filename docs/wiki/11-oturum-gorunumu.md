# 11. Oturum görünümü (`observatory chat`)

Bir oturumu, geldiği CLI'ın görünümüne yakın bir sohbet olarak terminalde gösterir. Claude Code oturumu Claude Code gibi, Codex oturumu Codex gibi görünür. Böylece hangi ajanın ne yaptığını kendi ekranında izliyormuş gibi okursun.

```bash
node bin/observatory.js chat                 # en son görev
node bin/observatory.js chat <taskId>        # belirli görev
node bin/observatory.js chat --follow        # önce en son görev, sonra gelen tüm yeni olaylar canlı akar
node bin/observatory.js chat <taskId> --skin codex   # başka bir CLI'ın görünümüyle çiz
node bin/observatory.js chat <taskId> --plain        # renksiz (kopyalamak için)
node bin/observatory.js chat <taskId> --color        # yönlendirilmiş çıktıda da renk
```

Renk yalnızca terminalde (TTY) ve `NO_COLOR` tanımlı değilken açılır.

## Görünümler

| Görünüm | Başlık | İstem | Asistan | Araç | Sonuç | Alt bilgi |
|---|---|---|---|---|---|---|
| **claude** | turuncu çerçeve `* Claude Code` | `> istem` (gri) | `● metin` | `● Read(yol)` | `⎿  ilk satırlar` | `* Worked for 12s · in 2.0k` |
| **codex** | gri çerçeve `>_ OpenAI Codex` + model + dizin | `› istem` (kalın) | `• metin` | `• Ran komut` / `• Explored yol` | `└ ilk satırlar` | `─ Worked for 12s ───` |
| **agy** | mavi çerçeve `▲ Antigravity CLI` | `> istem` (camgöbeği) | `◆ metin` | `▸ Araç özet` | girintili gri | `▲ Done (24s) · in 11k` |
| **opencode** | `> build · model` | `┃ istem` | düz metin | `← Write yol` | girintili gri | `7s · in 15k · out 80` |

Doğruluk notu: claude, codex ve opencode görünümleri o CLI'ların bilinen düzenine dayanır. agy görünümü, Antigravity'nin CLI'ının gerçek ekranından değil, `Desktop\antigravity-cli` istemcisinin düzeninden ve Google mavisinden türetildi. Hepsi "yakın" görünümdür, birebir kopya değildir. Renk ve işaretler `src/ui/skins.ts` içinde tek yerde durur.

## Nasıl çizilir?
1. SQLite'tan görevin olayları sırayla okunur (`events` tablosu).
2. `task.started` → başlık + istem. İstem 10 satırı geçerse kısaltılır.
3. Art arda gelen `message.delta` parçaları tek asistan bloğunda birleşir.
4. `tool.invoked` → araç satırı. Ajanlar araçlara farklı adlar verir (`Bash`, `run_command`, `exec`); `describeTool` hepsini ortak türlere indirir (`exec`, `read`, `write`, `edit`, `search`).
5. `tool.completed` → sonucun ilk 3 satırı, kalanı `… +N lines`.
6. `usage.updated` → token toplamı. `task.completed` / `failed` / `cancelled` → alt bilgi (hata varsa `errorKind` ile).

Aynı `TranscriptRenderer` sınıfı canlı akışta da kullanılır: olayları tek tek alır, durumu kendisi tutar.

## Yeni görünüm eklemek
`src/ui/skins.ts` içindeki `buildSkin` fonksiyonuna yeni bir `case` ekle ve `SkinId` türüne adını yaz. Bir görünüm şu altı parçayı tanımlar: `header`, `user`, `assistantOpen` / `assistantIndent`, `tool`, `toolResult`, `footer`.

## Bilinen eksikler
- Başlıktaki model, olayda veya `tasks` tablosunda yoksa `(varsayılan)` yazar. Bazı adaptörler model bilgisini olaya yazmıyor.
- Markdown biçimlendirme (kalın, liste, kod bloğu) yapılmaz; metin olduğu gibi akar.
- Terminalin kendi satır kaydırması kullanılır; ayrı bir sayfalama yoktur.
- Mevcut `watch` panosu aynen duruyor; `chat` ondan bağımsız bir görünümdür.
