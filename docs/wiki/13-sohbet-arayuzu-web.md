# 13. Sohbet arayüzü (`observatory web`)

Tarayıcıda açılan, model seçicili bir sohbet sayfası. Seçici dört motoru temsil eder: **Claude Code**, **Codex**, **OpenCode** ve **Antigravity (agy.exe)**. İstemi yazarsın, seçili motor Observatory üzerinden çalışır, yanıt canlı akar.

```bash
node bin/observatory.js web                 # http://127.0.0.1:8788
node bin/observatory.js web --port 9000
```

## Ne var?
- **Model seçici** (sağ alt): motor + model listesi, her satırda renkli nokta, ad ve alt açıklama, seçili olanda onay işareti. **Düşünme çabası** model seçiciden ayrıdır: yanında, motor renginde, hassas yatay kaydırıcıdır (precision slider; tıklayarak veya kaydırarak ayarlanır, görev sürerken dalgalanır). **Çubuk sayısı motora göre değişir** (her CLI'nin gerçek seviyeleri): Claude Code 5 (low, medium, high, xhigh, max), Codex 6 (+ ultra), Antigravity 2 (low, high), OpenCode'da çaba olmadığı için ölçek hiç görünmez. Kurulu olmayan veya kotası dolu motor soluk görünür ve seçilemez.
- **`[+]` Ekle düğmesi ve menüsü** (sol alt): İstem kutusunun solundaki yuvarlak minimalist buton. Tıklandığında iki seçenekli kompakt menü açılır:
  - **`📎 Files` (Dosyalar):** Bilgisayardan kod veya metin dosyaları seçmeni sağlar; seçilen dosyaların içerikleri okunup istem kutusuna otomatik olarak ` ```dosya.ext ` formatında iliştirilir.
  - **`📁 Folder` (Klasör):** Doğrudan resmi Windows Dosya Gezgini'ni (`IFileOpenDialog`) açar. Seçtiğin klasörü bir projeye bağlar, `st.cwd` yapar ve üst barda `📁 PROJE: <ad> [✕]` rozetini gösterir.
- **Modern Windows Dosya Gezgini (`bin/pick_folder.exe`):** Windows 95 döneminden kalma ilkel WinForms ağaç kutusu yerine modern Windows 11/10 Dosya Gezgini (`CLSID_FileOpenDialog`, `FOS_PICKFOLDERS`) açılır. `WinSta0\Default` Win32 masaüstü köprüsü sayesinde, arka plan servislerinden veya izole terminallerden çağrılsa bile diyalog doğrudan kullanıcının fiziksel monitörünün en önüne odaklanır.
- **İnteraktif Onay Kartı ("Evet / Hayır" & `POST /api/approve`):** Tehlikeli kabuk komutlarında (Bash, PowerShell, exec vb.) `--dangerously-skip-permissions` körü körüne geçilmez. Ajan izin istediğinde arayüzde turuncu çerçeveli onay kartı (`[✓ İzin Ver (Evet)]` ve `[✗ Reddet (Hayır)]`) belirir. Kullanıcı karar verene kadar görev bekler; tıklandığında `child.stdin`'e `y\n` ya da `n\n` gönderilerek süreç güvenle devam ettirilir.
- **CLI Araçlarının Zengin Görselleştirmeleri:**
  - Claude Code `Edit` ve Codex `patch` araçları için GitHub tarzı yeşil/kırmızı satır farkları (`.diff-add`, `.diff-del`).
  - OpenCode için interaktif görev kontrol listesi (`task` checklist).
  - Terminal komutları için `$ <komut>` kabuk kutucukları.
- **Kip düğmesi**: `Salt okunur` (varsayılan) veya `Yazabilir`. Yazma yalnızca destekleyen motorlarda açılır.
- **Düşünme Süreci Akordiyonu (`<details class="thinking-box">`):** Antigravity ve akıl yürüten modellerin iç monoloğu (`o.thinking` / CoT) asistan yanıtından ayrılarak açılır-kapanır `▸ Düşünme süreci` akordiyonu içinde sunulur. Kapalıyken yanıtı temiz tutar, tıklandığında detayları açar.
- **Dinamik Başlık Seçimi (`pickSessionTitle`):** Terminal oturumları listesinde ilk mesajdaki kör kilit ("selam", "...", "say hello in 2 words") kaldırılmıştır. ChatGPT, Claude ve Cursor standardına uygun puanlama ile oturumun en bilgilendirici ve eylem odaklı istemi dinamik olarak başlık seçilir.
- **Canlı yanıt**: metin akar, araç çağrıları katlanabilir kartlarda görünür (komut ve çıktısı), altta süre ve token, **Kopyala** düğmesi. Hata olursa türüne göre Türkçe açıklama.
- **Başka motorla dene**: Görev hata verirse (kota, model, giriş...) altında kullanılabilir diğer motorların düğmeleri çıkar; tıklayınca aynı istem o motorla yeniden çalışır.
- **Sohbet geçmişi** (sol kenar çubuğu): sohbetler tarayıcıda saklanır (`localStorage`, sunucuya gitmez), Bugün / Dün / Daha önce diye gruplanır. Bir sohbeti açınca mesajlar, araç kartları ve model ayarı geri gelir; yazdığın her şey o oturumu sürdürür. Silme düğmesi satırın üzerine gelince çıkar. Kenar çubuğu açılıp kapanır (dar ekranda üstten kayar).
- **Projeler** (kenar çubuğunun üstü, `+`): bir proje = **ad + klasör + talimatlar**. Projeye tıklayınca klasör seçilir ve o projede yeni sohbet başlar; sohbetler projenin altında listelenir (ok ile açılır/kapanır), projesiz sohbetler aşağıda tarihe göre durur. Başlıkta proje adı çıkar, yanındaki çarpı projeden çıkarır. **Talimatlar her yeni CLI oturumunun başında** `<PROJECT_INSTRUCTIONS>` olarak modele verilir (aynı oturum sürerken tekrar eklenmez; motor ya da klasör değişince, geri sarınca yeniden eklenir, bağlam özetiyle birlikte). Kalem simgesiyle düzenlenir ya da silinir (silinince sohbetler kalır, projesiz olur). Projeler de sohbetler gibi tarayıcıda saklanır (`localStorage`, en çok 30).
- **`/` komutları**: kutuya `/` yazınca liste açılır: `/model`, `/yeni`, `/klasor`, `/yaz`, `/gecmis`, `/kopyala`. Oklar ve Enter ile seçilir.
- **Markdown**: başlık, liste, tablo, alıntı, kod bloğu (her birinde Kopyala), kalın, italik, satır içi kod, bağlantı (yalnızca http/https, yeni sekmede). HTML hiçbir zaman çizilmez.
- **Akıllı kaydırma**: yeni metin geldikçe en alta iner, ama sen yukarı kaydırdıysan seni çekmez; "En alta in" düğmesi çıkar.
- **Bağlam taşıma**: Motor, klasör ya da kayıtlı oturum değişince CLI yeni oturum açar ve yeni model eski konuşmayı bilmezdi. Artık önceki turlar (istem, yanıt, araç özeti) `<CONTEXT_SUMMARY>` etiketiyle yeni isteme eklenir (`web/context.js`): en yeni iki tur tam, eskiler kısaltılmış, toplam en çok ~9000 karakter. Özet yapay zekâyla değil kuralla çıkar (ek maliyet ve gecikme yok). Ekranda yalnızca senin yazdığın görünür. Aynı motor ve klasörde oturum zaten sürdüğü için özet eklenmez.
- **Eski noktaya dön**: kendi mesajının üstüne gelince solda çıkan geri oku tıkla. Sohbet o mesajdan önceki haline döner, mesaj yazma kutusuna geri gelir (düzenleyip yeniden gönderebilirsin). CLI oturumu geri alınan turları hâlâ hatırlayacağı için yeni oturum açılır ve önceki bağlam özetle taşınır. **Dosya geri alma:** Yazabilir kipinde her görevden önce klasörün git ağaç anlık görüntüsü alınır (`src/commands/web_snapshot.ts`; gerçek indeks, dal ve commit'lere dokunulmaz, `.gitignore`'daki dosyalar dahil değildir). Geri alınan turlar dosya değiştirdiyse bir pencere sorar: "Sohbeti ve dosyaları geri al" / "Yalnızca sohbeti geri al" / "Vazgeç". Dosyalar geri alınırken sonradan eklenenler silinir, değişenler ve silinenler geri gelir; yalnızca seçili klasörün altı etkilenir.
- **Yetenekler** (sağ üstte parlama simgesi): her CLI'nin becerileri (skill), ajanları, komutları, MCP sunucuları ve eklentileri; motor sekmesiyle değişir, arama kutusu vardır, seçili klasöre özel olanlar "proje" rozetli görünür. Salt okunur: yalnızca ad ve kısa açıklama (`src/commands/web_capabilities.ts`); MCP env, jeton ve argüman gibi gizli değerler okunmaz. Kaynaklar: Claude `~/.claude` (+ `~/.claude.json`, proje `.claude/`, `.mcp.json`), Codex `~/.codex` (`config.toml`, `skills`, `prompts`), OpenCode `~/.config/opencode` (+ yerleşik `build`/`plan`), Antigravity `~/.gemini/config` (`skills`, `mcp_config.json`).
- **Sohbet devamı**: Aynı motor ve klasörde ikinci mesaj, önceki oturumu sürdürür (Claude `--resume`, Codex `exec resume`, agy `--conversation`, OpenCode `--session`). Motor veya klasör değişince yeni oturum başlar. Model veya düşünme çabası değiştiğinde de aynı oturum kesintisiz sürdürülür.
- **Durdur** düğmesi çalışan görevi iptal eder. **Yeni sohbet** oturumu sıfırlar.
- Sol altta motor durumu (kurulu mu, kota dolu mu); 60 sn'de bir yenilenir.
- Menüler pencereye sığar: yer yoksa aşağı açılır, yükseklik sınırlanır ve içeride kaydırılır.
- Varsayılan klasör, sunucuyu başlattığın proje klasörüdür (izinli kökün içindeyse).
- **Aydınlık tema varsayılan**; üstteki ay/güneş düğmesiyle koyu temaya geçilir, seçim saklanır. Tema ilk boyamadan önce uygulanır (yanıp sönme yok).
- **Kahve fincanı** (sağ üst, yalnızca Claude sohbetinde): Claude Code `cache-clock` modundaki piksel-art'ın birebir aynısı (`web/cup.js`, 14x10 piksel, aynı renkler ve duman). Duman = istem önbelleği (prompt cache) sıcak; son mesajdan 60 dk sonra fincan grileşir ve duman biter. Üstüne gelince kalan süre görünür. Görev sürerken her zaman sıcak.
- **Türkçe ve İngilizce**: üstteki dil düğmesiyle tüm arayüz, menüler, hata mesajları, `/` komutları (`/yeni` / `/new`), tarih ve süre biçimleri anında çevrilir; açık sohbetin süre ve hata satırları da yeniden çevrilir. İlk açılışta tarayıcı dili Türkçeyse Türkçe, değilse İngilizce; seçim saklanır.

## Motorlar

| Motor | Modeller | Çaba | Yazma | Not |
|---|---|---|---|---|
| Claude Code | Sonnet 5.5, Opus 5.5, Haiku 5.5 | 5 kademe (`--effort`) | yok | Headless modda izin sorulamaz: yalnızca okuma ve yanıt |
| Codex | GPT-6 Astra | 6 kademe: low, medium, high, xhigh, max, ultra (hepsi doğrudan geçer; xhigh ve ultra 2026-10-24'te canlı denendi) | `workspace-write` | ChatGPT girişi; kotası dolunca rozet "limit ... kadar" gösterir |
| OpenCode | **Ücretsiz modeller `opencode models` CLI çıktısından canlı okunur** (10 dk önbellek). 2026-10-24 listesi, hepsi tek tek denendi: Big Pickle, Beam, Deepseek V4.1 Flash, Flint 40B, GLM 5.3 Flash, Mimo V2.6 Flash, Nemotron 3 Ultra, Nemotron 3.5 Lightning, Nemotron 3.5 Super VL | yok | düzenleme açık, kabuk kapalı | OpenCode tarafında liste değişince menü kendiliğinden güncellenir; CLI okunamazsa Big Pickle yedek olarak kalır |
| Antigravity (agy) | Gemini 3.8 Flash | Düşük / Yüksek (modelin `-low` / `-high` sürümü) | yok | Resmî `agy.exe`; Antigravity şartları nedeniyle düşük hacimde kullan |

## Model ve Düşünme Çabası (Thinking Effort) Değişince Bağlam Kopar mı?

**HAYIR, AYNI MOTOR İÇİNDE BAĞLAM ASLA KOPMAZ.**

Agent Observatory'nin adaptör mimarisi, oturum devamlılığını motor seviyesinde korur:

1. **Aynı Motor İçinde Model veya Düşünme Çabası Değişirse:**
   - Web arayüzü `chat.session.id` değerini korur (`sessionId: resume`).
   - **Claude Code:** `--resume <sessionId> --model <yeniModel> --effort <yeniEffort>` bayraklarıyla çağrılır. Claude diskteki konuşma ve dosya hafızasını aynen korur; sadece bir sonraki yanıtı yeni model/çabayla üretir.
   - **Codex:** `exec resume <threadId> <prompt> --model <yeniModel> -c model_reasoning_effort="<yeniEffort>"` ile çağrılır. Codex ChatGPT thread'ini kaldığı yerden devam ettirir.
   - **OpenCode:** `run <prompt> --session <sessionId> --model <yeniModel>` ile çağrılır. Oturum belleği ve araç geçmişi silinmez.
   - **Antigravity (`agy`):** `-p <prompt> --conversation <sessionId> --model <yeniModel>` ile aynı konuşmayı sürdürür.

2. **Farklı Bir Motora Geçilirse (Örn. Claude'dan Codex'e):**
   - Farklı motorlar birbirlerinin yerel CLI süreçlerini veya gizli oturum veritabanlarını okuyamaz (`claude` session'ını `codex` bilemez).
   - Bu durumda `web/context.js` devreye girer: Önceki sohbet turlarının, çalıştırılan araçların ve sonuçların akıllı bir kural tabanlı özetini (`<CONTEXT_SUMMARY>`) derler ve yeni motorun ilk istemine otomatik olarak iliştirir. Böylece kullanıcı sıfırdan başlamak zorunda kalmaz, yeni motor önceki bağlamı özet olarak devralır.

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
- Geçmiş yalnızca bu tarayıcıda ve bu adreste (`127.0.0.1:8788`) saklanır; başka tarayıcıda veya portta görünmez. En çok 40 sohbet tutulur, araç çıktıları 2000 karaktere kısaltılır. Çalışırken (görev sürerken) sohbet değiştirilemez.
- **Sunucuyu yeniden başlat:** Arayüz dosyaları (`web/`) her istekte diskten okunur, ama sunucu kodu (`web.ts`) bellekte kalır. `web.ts` değiştiyse (API, motor tablosu, dosya sunum kuralı) çalışan `observatory web` işlemini kapatıp yeniden başlat. Eski bir sunucu yeni dosyaları (`i18n.js`, `theme.js`...) 404 verir, `app.js` `ObsI18n is not defined` ile çöker ve arayüz boş görünür (2026-10-24'te yaşandı). Çözüm: sunucuyu yeniden başlat, sayfayı Ctrl+Shift+R ile yenile.
- Eski sürümde kaydedilmiş sohbetlerin süre ve hata satırları sabit Türkçe metin olarak kalır (dil değişince çevrilmez); yeni sohbetler dile göre çevrilir.

## Çok dillilik (i18n) nasıl çalışır?
i18next ile aynı kullanım biçimine sahip küçük bir katman (`web/i18n.js`): `t(anahtar, {ara_değer})`, `changeLanguage`, `on('languageChanged')`, `{{ad}}` ara değerleri, çoğul (`key_one` / `key_other`, `Intl.PluralRules`), yedek dil ve `data-i18n` bağlama. Bağımlılık eklenmedi: sunucunun sıkı CSP'si (`script-src 'self'`) dış kitaplık yüklemeye izin vermez.

- Metinler `web/lang-tr.js` ve `web/lang-en.js` dosyalarında. **Yeni dil eklemek:** `lang-xx.js` oluştur, `index.html`'e ekle, `i18n.js` içindeki `languages` listesine yaz.
- Sunucu hata yanıtları `code` taşır (ör. `no_write`, `cwd_forbidden`); arayüz bunu seçili dile çevirir. Motor notları ve model açıklamaları da çeviri anahtarı olarak gelir (`engines.claude.note`, `models.free`).
- Model adları (Claude Sonnet 5.5, GPT-6 Astra...) özel isim olduğu için çevrilmez. Ajanın yanıtı kendi dilinde kalır.
- `test/web_i18n.test.ts`: iki dilde aynı anahtarlar, kodda ve HTML'de kullanılan her anahtarın tanımlı olması, sunucu hata kodları ile motor ve model anahtarlarının çevirisi, ara değer, çoğul, dil değişimi.
