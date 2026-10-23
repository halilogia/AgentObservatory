# 10. HTTP + SSE API (`observatory serve`)

Benzetme: kameranın canlı yayın kablosu. Kayıt zaten SQLite dosyasında; `serve` aynı kaydı tarayıcıların ve panellerin okuyabileceği bir yayına çevirir.

```bash
node bin/observatory.js serve --port 8787
```

Adres: `http://127.0.0.1:8787` (varsayılan port 8787 veya `OBSERVATORY_PORT`). Veritabanı: `~/.observatory/observatory.sqlite` (`OBSERVATORY_DB` ile değişir). Salt okunurdur: API görev başlatmaz, veri yazmaz.

## Uç noktalar

| Yol | Döner |
|---|---|
| `GET /health` | `{ ok, db, lastSeq }`, `lastSeq` son olay sıra numarası |
| `GET /tasks?limit=50` | Görev satırları (en yeni önce, en çok 500) |
| `GET /tasks/<taskId>` | `{ task, events }`, görevin tüm olayları sırayla |
| `GET /events?since=<seq>` | `seq` değerinden sonraki en çok 500 olay |
| `GET /stream` | **SSE**: yeni olayları canlı akıtır |

Olay biçimi (`seq` sıra numarasıdır, artarak gider):

```json
{ "seq": 4998, "id": "evt_8fd6...", "taskId": "task_mvleu4vg_g827", "sessionId": null,
  "agent": "codex", "tier": 1, "type": "task.started", "data": { "prompt": "Reply with exactly: OK" },
  "timestamp": 1792784990000, "parentTaskId": null }
```

## SSE örneği

```js
const es = new EventSource('http://127.0.0.1:8787/stream');
es.addEventListener('observatory', (e) => {
  const ev = JSON.parse(e.data);
  console.log(ev.agent, ev.type, ev.data);
});
```

- Bağlanınca yalnızca **yeni** olaylar gelir. Geçmişi görmek için `?since=0` ekle.
- Bağlantı kopar ve tarayıcı yeniden bağlanırsa `Last-Event-ID` ile kaldığı yerden devam eder.
- Sunucu SQLite'ı 300 ms'de bir yoklar; başka süreçlerin (MCP, `run`) yazdığı olaylar da akar.

## Güvenlik

| Önlem | Etkisi |
|---|---|
| Yalnızca `127.0.0.1`'e bağlanır | Ağdaki başka makineler erişemez |
| `Host` başlığı `localhost` / `127.0.0.1` / `[::1]` olmalı | DNS rebinding saldırısını engeller |
| `Origin` başlığı varsa yerel olmalı | Başka sitelerdeki script veriyi okuyamaz (403) |

Olaylar istem metinlerini ve araç girdilerini içerir. Bu yüzden uç noktayı dışarıya açma (port yönlendirme, tünel).

## Hızlı deneme

```bash
curl http://127.0.0.1:8787/health
curl "http://127.0.0.1:8787/tasks?limit=3"
curl -N http://127.0.0.1:8787/stream
```

Başka bir terminalde `observatory run codex "Reply with exactly: OK"` çalıştırınca `/stream` satır satır olay gösterir.
