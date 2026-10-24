# 14. Telefondan erişim

Telefondan Agent Observatory'ye yazarsın; **CLI'lar (Claude Code, Codex, OpenCode, Antigravity) bilgisayarında çalışmaya devam eder**. Telefon yalnızca ekran ve klavyedir: istemi gönderir, yanıtı canlı izler. Bilgisayar açık ve internete bağlı olmalıdır (uyursa telefon erişemez).

```
telefon --HTTPS (Tailscale, özel ağ)--> bilgisayar: tailscale serve --> 127.0.0.1:8788 (observatory web) --> CLI
```

Sunucu **yine yalnızca 127.0.0.1'de dinler**. İnternete ya da yerel ağa açılmaz; `tailscale serve` yalnızca senin Tailscale ağındaki cihazlara HTTPS ile aktarır.

## Kurulum (bir kez)
1. Bilgisayara ve telefona **Tailscale** kur, ikisinde de **aynı hesapla** giriş yap. (`tailscale status` bilgisayarda `Running` göstermeli.)
2. Tailscale yönetim panelinde (DNS bölümü) **HTTPS Certificates** özelliğini aç.
3. `observatory web` çalışırken sayfanın sağ üstündeki **Telefon** düğmesine bas, **Telefon erişimini aç**.
4. Pencerede yazan komutu bilgisayarda bir kez çalıştır (HTTPS adresini telefona açar):
   ```bash
   tailscale serve --bg 8788
   ```
5. **Eşleştirme kodu üret**, telefonda pencerede yazan adresi (`https://<bilgisayar>.<ağ>.ts.net/pair`) aç, kodu gir. Telefon eşleşir ve ana sayfa açılır.

## Güvenlik
| Katman | Ne yapar |
|---|---|
| Varsayılan kapalı | Düğmeyle açmadıkça yerel olmayan hiçbir Host kabul edilmez |
| Yalnızca izinli Host | Tailscale adın dışındaki her Host (DNS rebinding dahil) reddedilir |
| Tek kullanımlık kod | 8 karakter, 5 dakika, 5 yanlışta 10 dakika kilit; doğru girilince geçersiz olur |
| Cihaz çerezi | Rastgele 256 bit; diskte yalnızca SHA-256 özeti; `HttpOnly; Secure; SameSite=Strict`; 180 gün |
| Hesap kilidi | İlk eşleşen Tailscale hesabı kaydedilir; başka hesap (ya da hesap başlığı olmayan istek) reddedilir |
| Telefon yalnızca sohbet eder | Klasör ekleme, dosya geri alma, eşleştirme ve cihaz yönetimi **yalnızca bilgisayardaki sayfadan** yapılır (`local_only`) |
| Yazma izni cihaz başına, varsayılan **kapalı** | Telefondan "Yazabilir" kipi, bilgisayardaki Telefon penceresinde o cihaz için açılmadıkça sunucuda reddedilir (`remote_write_forbidden`) |
| İptal | Telefon penceresinde **Çıkar**: o cihazın çerezi anında geçersiz olur |

Ayarlar `~/.agent-observatory/web.json` içinde `remote` anahtarındadır (cihaz özetleri, hesap, açık/kapalı).

## Bilinen sınırlar
- QR kod yok: adres ve kod metin olarak gösterilir.
- Tailscale **Funnel** (herkese açık adres) önerilmez; açarsan yine kod ve çerez gerekir ama internete açıklık artar.
- Telefon, bilgisayardaki tüm CLI görevlerinin olay akışını görebilir (`/stream`); eşleşmiş cihaz sahibi olarak kabul edilir.
- Bilgisayardaki "Klasör ekle" ve "dosyaları geri al" telefonda yoktur; klasörler bilgisayarda eklenir.
- Gerçek Tailscale + telefon ile uçtan uca deneme bu geliştirme makinesinde yapılamadı (Tailscale oturumu kapalıydı); sunucu davranışı `test/web_remote.test.ts` ile Host başlığı taklit edilerek sınandı.
