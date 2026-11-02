# Görsel yanıtlar (Intelligent UI)

Benzetme: ajanlar konuşur, Observatory de ortak bir **sunum tahtası** açar. Ajan tahtaya kart, tablo, grafik, form veya diyagram çizer; sen tahtada yanıt verirsin; ajan aynı odada konuşmaya devam eder.

Bu sayfa, `ui_*` MCP araçlarının nasıl çalıştığını ve günlük kullanımda nelere dikkat edileceğini anlatır. Ayrıntılı sözleşme: [`docs/intelligent-ui.md`](../intelligent-ui.md).

## 1. Akış

```text
CLI ajanı (Claude Code / Codex / OpenCode / agy / Freebuff / Command Code)
        │  MCP: ui_publish / ui_update / ui_patch
        ▼
Agent Observatory MCP sunucusu
        │  tek SQLite işlemi (tam görüntü)
        ▼
Observatory web + SSE  ──►  sohbet içi kart veya /visual.html
        ▲
        │  form yanıtı (ui.action)
Kullanıcı
```

- Her olay **tam belge** olarak yazılır; okuyucu yarım JSON görmez.
- Güncellemeler `revision` numarasıyla çakışmadan uygulanır.
- Form yanıtı ayrı olaydır; ajan `ui_read` ile okur.

## 2. Araçlar

| Araç | Ne yapar | Ne zaman |
|---|---|---|
| `ui_publish` | Yeni görsel yanıt yayınlar | İlk gösterim |
| `ui_update` | Belgenin tamamını yenisiyle değiştirir | Çok blok değiştiyse |
| `ui_patch` | Yalnızca ekle / değiştir / sil blokları gönderir | Tek blok değiştiyse (önerilen) |
| `ui_read` | Belgeyi, form yanıtlarını ve devam durumunu okur | Kullanıcı yanıtından sonra |
| `ui_delete` | Yanıtı siler, içeriği redakte eder, kimliği rezerve eder | Temizlik (güncel revizyon gerekir) |

`ui_patch` örneği:

```json
{
  "id": "test-sonuclari",
  "expectedRevision": 2,
  "ops": [
    { "op": "replace", "block": { "id": "ozet", "type": "card", "text": "48 test geçti", "tone": "success" } },
    { "op": "add", "block": { "id": "yeni", "type": "text", "text": "Ek not" } },
    { "op": "remove", "blockId": "eski" }
  ]
}
```

## 3. Blok türleri

| Tür | Alanlar | Not |
|---|---|---|
| `text` | `text` | Düz metin, satır sonları korunur |
| `card` | `text`, `tone` | `neutral` / `success` / `warning` |
| `table` | `columns`, `rows` | En fazla 12 sütun, 100 satır |
| `bar_chart` | `items[{label,value,unit}]` | Negatif değer işaretiyle gösterilir |
| `form` | `fields`, `calculation`, `submitLabel` | Yerel hesaplama; yanıt SQLite'a yazılır |
| `diagram` | `nodes`, `edges` | SVG yerleşim; döngü ve kendine bağ desteklenir |

Diyagram artık kutucuk listesi değil: katmanlı yerleşim, oklu bağlantılar, uzun etiket sarma ve “Bağlantılar” metin alternatifi vardır.

## 4. Form ve aynı oturumda devam

Formdaki **“Gönderince ajan aynı oturum ve izinlerle devam etsin”** seçeneği varsayılan kapalıdır.

Açıksa:

1. Yanıt doğrulanır ve kaydedilir; onay (`continue: true`) sunucuda da denetlenir, yalnızca kutuyu işaretlemek yetmez.
2. Aynı ajan, model, klasör, hesap ve izinlerle devam görevi başlar.
3. Kota doluysa, oturum meşgulse veya klasör izinli değilse **yeni süreç başlamaz**; yanıt yine kayıtlı kalır.
4. Aynı form isteği iki kez gönderilirse ikinci süreç açılmaz.
5. Sayfa yenilenince son yanıt ve devam durumu geri yüklenir; gönderilmemiş taslak aynı sekmede korunur.

> Form verisi **komut çalıştırma veya izin genişletme yetkisi değildir**. Ajan yalnızca kayıtlı kaynak görevin izinleriyle devam eder.

## 5. Görsel yanıtlar sayfası

`http://127.0.0.1:8788/visual.html`

- Ajan adına göre gruplama, başlık/ajan/özet araması
- Türkçe/İngilizce düğmesi ve açık/koyu tema (ana uygulamayla aynı)
- Tek yanıt görünümünde **Sil** düğmesi (salt okunur cihazda gizli)
- Sohbetteki kartla aynı içerik; canlı güncellemeler SSE ile gelir

## 6. Sınırlar ve saklama

| Sınır | Değer |
|---|---|
| Belge boyutu | 48 KiB |
| Blok sayısı | 30 |
| Tablo | 100 satır × 12 sütun |
| Grafik öğesi | 40 |
| Form alanı | 12 |
| Liste sorgusu | Son 500 belge |

- Silme kalıcıdır: önceki belge gövdeleri redakte edilir, form yanıtları silinir, olay günlüğünde yalnızca “silindi” kaydı kalır. Kimlik yeniden kullanılamaz.
- Eski belgeler listede kalmaz ve `/api/ui` üzerinden okunamaz.
- Otomatik saklama süresi yoktur; temizlik `ui_delete` veya arayüzdeki Sil düğmesiyle yapılır.

## 7. Güvenlik

- Modelden gelen HTML/JavaScript **çalıştırılmaz**; yalnızca metin ve sabit DOM bileşenleri kullanılır.
- Form gönderimi jeton, aynı köken ve cihaz yazma izni denetiminden geçer.
- Telefondan bağlı salt okunur cihaz yanıt gönderemez ve silemez.
- `agent` etiketi istemcinin beyanıdır; kimlik doğrulaması yerine geçmez.
- Yerel MCP istemcileri aynı güven alanını paylaşır: belge kimliğini bilen yerel bir istemci güncelleyebilir veya silebilir. Farklı güven düzeyleri için ayrı kullanıcı/veritabanı izolasyonu kullanın.

## 8. Kurulum

MCP sunucusunu istemciye ekle (Claude Code örneği):

```json
{
  "mcpServers": {
    "agent-observatory": {
      "command": "node",
      "args": ["--experimental-strip-types", "C:/yol/AgentObservatory/src/cli.ts", "mcp"]
    }
  }
}
```

Codex için `.codex/config.toml`:

```toml
[mcp_servers.agent-observatory]
command = "node"
args = ["--experimental-strip-types", "C:/yol/AgentObservatory/src/cli.ts", "mcp"]
```

Web ve MCP **aynı** `OBSERVATORY_DB` dosyasını kullanmalıdır (varsayılan `~/.observatory/observatory.sqlite`). Web sunucusu varsayılan olarak yalnızca `127.0.0.1` dinler; ağ erişimi için `OBSERVATORY_HOST` açıkça ayarlanmalıdır.

## 9. Doğrulama

```powershell
npm test
npx tsc --noEmit
node --experimental-strip-types scripts/verify_intelligent_ui_browser.mjs
```

Tarayıcı betiği gerçek Chrome ile form gönderimi, canlı güncelleme, taslak koruma, diyagram, liste araması, dil/tema ve silme akışını denetler; canlı model kotası harcamaz.

## 10. Bilinen sınırlar

- Diyagram yerleşimi küçük/orta grafikler için tasarlandı; çok yoğun grafiklerde yatay kaydırma gerekir.
- Gönderilmemiş taslak sekmeler arasında paylaşılmaz (aynı sekmede korunur).
- Claude Code ve Codex ile canlı uçtan uca doğrulama, abonelik kotasına bağlıdır; sahte çalıştırıcı testleri her zaman çalışır.
