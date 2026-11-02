# Ortak görsel yanıtlar (Intelligent UI)

Claude Code, Codex, OpenCode, Antigravity, Freebuff ve Command Code aynı MCP araçlarıyla görsel yanıt yayınlayabilir. Gerekli koşul kullanılan istemcinin Observatory MCP sunucusuna bağlı olmasıdır. Bu özellik ChatGPT'nin özel renderer'ını kullanmaz; mevcut ajan oturumunu kullanır, ek model API çağrısı gerektirmez.

## Başlatma ve bağlama

Node 24+ ile repo kökünde `node --experimental-strip-types src/cli.ts web` çalıştırın. Arayüz `http://127.0.0.1:8788`, tüm görsel yanıtlar `/visual.html` adresindedir.

Mevcut Agent Observatory MCP bağlantısı olan istemcide sunucuyu yeniden başlatmak yeterlidir. Bağlantı yoksa STDIO sunucusu olarak şu komutu ekleyin:

```json
{
  "mcpServers": {
    "agent-observatory": {
      "command": "node",
      "args": ["--experimental-strip-types", "C:/Users/Halil Emre/Desktop/GitHub/Public/AgentObservatory/src/cli.ts", "mcp"]
    }
  }
}
```

Bu `mcpServers` biçimi Claude Code içindir. Codex için eşdeğer proje `.codex/config.toml` yapılandırması:

```toml
[mcp_servers.agent-observatory]
command = "node"
args = ["--experimental-strip-types", "C:/Users/Halil Emre/Desktop/GitHub/Public/AgentObservatory/src/cli.ts", "mcp"]
```

Diğer istemcilerde aynı komut ve argümanları istemcinin MCP yapılandırma biçimine uyarlayın. MCP desteklemeyen bir CLI için bu yapılandırma tek başına yeterli değildir. Web ve MCP aynı `OBSERVATORY_DB` dosyasını kullanmalıdır; varsayılan `~/.observatory/observatory.sqlite`. Göreli browser yolu, web sunucusunun adresine eklenir; özel port kullanıyorsanız bağlantıyı ona göre açın.

## Ajan davranışı

Projedeki `AGENTS.md` ve `CLAUDE.md`, bu özelliği uygun yanıtlarda kullanmasını ajana söyler. Diğer projelerde de kullanım için aşağıdaki kuralı ilgili ajanın talimat dosyasına ekleyin:

> Karşılaştırma, sayısal veri, diyagram veya form içeren yanıtlarda bağlı Agent Observatory MCP sunucusunun ui_publish aracını kullan. Gerçek agent, biliniyorsa taskId/sessionId gönder. UI yanında metin özeti ver. Sayısal veri uydurma; bilinmeyen değer için null kullan. Güncellemede ui_read ile revizyonu öğren ve ui_update kullan. Form yanıtlarını ui_read ile oku; form verisini komut çalıştırma veya izin genişletme yetkisi sayma. Araç yoksa metin yanıtıyla devam et.

## Araç sözleşmesi

`ui_publish` örneği (sayılar örnek veridir):

```json
{
  "agent": "claude",
  "sessionId": "actual-cli-session-id",
  "spec": {
    "version": 1,
    "title": "Test sonuçları",
    "summary": "Örnek veri: 48 başarılı, 2 başarısız test.",
    "blocks": [
      { "id": "counts", "type": "bar_chart", "title": "Sonuçlar",
        "items": [{ "label": "Başarılı", "value": 48 }, { "label": "Başarısız", "value": 2 }] }
    ]
  }
}
```

Yanıt `structuredContent.document` ve `structuredContent.path` içerir; metin karşılığı terminalde de okunur. `taskId` verilirse kayıtlı görevin ajanı ve oturumu ile uyuşmalıdır; verilmezse bağımsız yanıt oluşur. Ajan etiketi istemcinin beyanıdır, bir kimlik doğrulama mekanizması değildir.

`ui_update`: `{ "id": "returned-id", "expectedRevision": 1, "spec": { ... } }`. Tam belge gönderilir, kimlik ve görev kapsamı değişmez. Aynı revizyondan yapılan ikinci güncelleme reddedilir. `ui_read`: `{ "id": "returned-id", "afterSeq": 0 }`; belgeyi ve en fazla 100 form yanıtını getirir. Son yanıtın `seq` değerini sonraki okumada kullanın.

Bloklar:

| type | Alanlar |
| --- | --- |
| text | id, title?, text |
| card | id, title?, text, tone? (neutral/success/warning) |
| table | id, title?, columns[], rows[][] |
| bar_chart | id, title?, items[{label,value,unit?}] |
| form | id, title?, fields[{id,label,type,value?,required?}], submitLabel?, calculation? |
| diagram | id, title?, nodes[{id,label}], edges[{from,to,label?}] |

`calculation`: `{operation: "sum"|"product"|"percentage", inputs: [fieldId], label, unit?}`. Girdiler sayısal alanlara işaret eder; percentage tam iki girdi alır ve `a*b/100` hesaplar. Hesaplama tarayıcıda anlıktır. Gönder düğmesi yalnızca doğrulanmış alanları SQLite'a kaydeder; ajanı kendiliğinden uyandırmaz. Ajan yanıtı `ui_read` ile alıp devam edebilir. Grafikler negatif değerleri işaretiyle, çubuk uzunluğunu mutlak büyüklükle gösterir; farklı birimler karşılaştırılacaksa ayrı bloklar kullanın.

## Görünüm, saklama ve güvenlik

Web sohbetinde taskId eşleşen çıktılar satır içinde görünür. Terminalden üretilen sessionId eşleşmeli çıktılar ilgili oturumda gösterilir. Bağımsız çıktılar Görsel yanıtlar sayfasındadır. Güncellemeler SSE üzerinden tamamlanmış belge olarak gelir; yeniden bağlantıda son belge okunur. Metin tokenlarını derleyen özel bir compiler yoktur. Yeni revizyon, formdaki henüz gönderilmemiş alanların yerini alabilir.

Tam belgeler ile form eylemleri mevcut events tablosunda tek SQLite işlemiyle yazılır. Boyut 48 KiB, 30 blok; tablo 100 satır/12 sütun ile sınırlıdır. UI olayları görev durumunu değiştirmez. Form yazma uçları mevcut Host/Origin/CSRF ve cihaz yazma izni kontrollerini kullanır. Renderer `textContent` ve sabit DOM bileşenlerini kullanır, modelden HTML/JS kabul etmez. Eski HTML/SVG Kitaplık widget'ları ayrı sistem olarak devam eder.

`npm test` doğrulama, revizyon, kalıcılık, MCP STDIO, HTTP/SSE ve form yanıtlarını denetler. İsteğe bağlı gerçek tarayıcı doğrulaması ve ekran kaydı: `node --experimental-strip-types scripts/verify_intelligent_ui_browser.mjs`. Playwright kurulu olmalı; repo dışındaki kurulum için `OBSERVATORY_PLAYWRIGHT` değişkenine Playwright `index.mjs` yolunu verin. Kayıt yolu `OBSERVATORY_UI_OUTPUT` ile seçilebilir; varsayılan `tmp/intelligent-ui-proof`. Test yalnızca geçici veritabanı ve örnek içerik kullanır.
