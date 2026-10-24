# 13. Sohbet arayüzü (`observatory web`)

Tarayıcıda açılan, model seçicili bir sohbet sayfası. Seçici dört motoru temsil eder: **Claude Code**, **Codex**, **OpenCode** ve **Antigravity (agy.exe)**. İstemi yazarsın, seçili motor Observatory üzerinden çalışır, yanıt canlı akar.

```bash
node bin/observatory.js web                 # http://127.0.0.1:8788
node bin/observatory.js web --port 9000
```

## Ne var?
- **Model seçici** (sağ alt): motor + model listesi, her satırda renkli nokta, ad ve alt açıklama, seçili olanda onay işareti. Altında **Düşünme çabası** (Düşük / Orta / Yüksek / Çok yüksek / En yüksek). Kurulu olmayan veya kotası dolu motor soluk görünür ve seçilemez.
- **Klasör seçici** (sol alt): ajanın çalışacağı proje. Liste izinli köklerin altındaki projelerdir, en son değişen önce.
- **Kip düğmesi**: `Salt okunur` (varsayılan) veya `Yazabilir`. Yazma yalnızca destekleyen motorlarda açılır.
- **Canlı yanıt**: metin akar, araç çağrıları katlanabilir kartlarda görünür (komut ve çıktısı), altta süre ve token. Hata olursa türüne göre Türkçe açıklama (ör. "Kota doldu, başka motor seç").
- **Sohbet devamı**: Aynı motor ve klasörde ikinci mesaj, önceki oturumu sürdürür (Claude `--resume`, Codex `exec resume`, agy `--conversation`, OpenCode `--session`). Motor veya klasör değişince yeni oturum başlar.
- **Durdur** düğmesi çalışan görevi iptal eder. **Yeni sohbet** oturumu sıfırlar.
- Üstteki rozetler motor durumunu gösterir (kurulu mu, kota dolu mu).
- Açık ve koyu tema (sistem ayarına uyar).

## Motorlar

| Motor | Modeller | Çaba | Yazma | Not |
|---|---|---|---|---|
| Claude Code | Sonnet 5.5, Opus 5.5, Haiku 5.5 | 5 kademe (`--effort`) | yok | Headless modda izin sorulamaz: yalnızca okuma ve yanıt |
| Codex | GPT-6 Astra | 5 kademe (en yüksek ikisi `high`'a iner) | `workspace-write` | ChatGPT girişi; kotası dolunca rozet "limit ... kadar" gösterir |
| OpenCode | Big Pickle (ücretsiz) | yok | düzenleme açık, kabuk kapalı | |
| Antigravity (agy) | Gemini 3.8 Flash | Düşük / Yüksek (modelin `-low` / `-high` sürümü) | yok | Resmî `agy.exe`; Antigravity şartları nedeniyle düşük hacimde kullan |

## Güvenlik
Bu sayfa bilgisayarında ajan çalıştırabildiği için sıkı korunur:

| Önlem | Etkisi |
|---|---|
| Yalnızca `127.0.0.1`'e bağlanır | Ağdan erişilemez |
| `Host` ve **tam** `Origin` denetimi | Başka bir yerel portta (ör. `localhost:3000`) çalışan sayfa bile istek atamaz; DNS rebinding engellenir |
| Yazan uçlar (`/api/run`, `/api/cancel`) rastgele **jeton** ister | Jeton her başlatmada üretilir, sayfaya `meta` etiketiyle verilir |
| `Sec-Fetch-Site` aynı köken olmalı, `Content-Type: application/json` zorunlu | Çapraz site istekleri reddedilir |
| Çalışma klasörü **izinli köklerle** sınırlı | Varsayılan `~/Desktop/GitHub`; `OBSERVATORY_WEB_ROOTS` (`;` ile ayrılmış) ile değişir |
| Varsayılan **salt okunur**; `dangerously_skip_permissions` ve `danger-full-access` yok | Yazma yalnızca bilinçli olarak, destekleyen motorlarda |
| Sıkı CSP (`script-src 'self'`, dış kaynak yok), `X-Frame-Options: DENY` | Sayfa içeriği başka yerde gömülemez |
| En çok 4 eşzamanlı görev, 15 dk zaman aşımı | Kaçak süreç birikmez |

Web'den başlatılan görevler konsol penceresi açmaz (`OBSERVATORY_NO_AUTO_TUI=1` sunucuda ayarlanır).

## Nasıl çalışır?
```
tarayıcı  --POST /api/run (jeton)-->  web.ts  -->  globalRunner.startTask  -->  ajan CLI
tarayıcı  <--SSE /stream (olaylar)--  serve.ts <--  SQLite olay deposu  <--  adaptörler
```
Sayfa tek bir SSE bağlantısı açar ve `taskId`'ye göre olayları mesajlara dağıtır. Gönderme ile bağlantı arasında kaçan olaylar için kısa bir ara bellek vardır. `serve.ts` aynı sunucu olarak kalır; `web.ts` ona ek yol (`extra`) ve katı köken listesi verir.

Dosyalar: `src/commands/web.ts` (sunucu ve motor tablosu), `web/index.html`, `web/app.css`, `web/app.js` (çerçevesiz, `innerHTML` ile ham metin basılmaz).

## Gerçek denemeler (2026-10-24)
- Tarayıcıda OpenCode · Big Pickle seçilip "Reply with exactly: UI-OK" gönderildi: yanıt `UI-OK`, 4 sn.
- İkinci mesaj ("önceki mesajda ne yazmamı istedim?") oturumu sürdürdü ve `UI-OK` cevabını verdi.
- Otomatik test `test/web.test.ts`: arayüz ve CSP, yapılandırma, jeton / Origin / Sec-Fetch-Site korumaları, doğrulamalar, sahte runner ile gönder → SSE akışı.

## Bilinen sınırlar
- **Çok büyük klasörlerde** OpenCode takılabilir (denemede `Desktop\GitHub` kökünde yanıt metni gelmedi). Bu yüzden kök seçilemez, proje seçilir; yanıt gelmezse arayüz bunu bildirir.
- Codex şu an kotası dolu olabilir; durum rozetinde görünür.
- Arayüz Markdown'ı sadeleştirilmiş gösterir (kod bloğu, madde, kalın, satır içi kod); tablo ve bağlantı çizmez.
- Konuşma geçmişi tarayıcıda saklanmaz; sayfa yenilenince sohbet temizlenir (görevler yine de `observatory chat` ile görülebilir).
