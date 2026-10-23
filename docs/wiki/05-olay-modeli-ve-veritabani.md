# 5. Olay modeli ve veritabanı

## Olay (`TaskEvent`)
Her ajan çıktısı şu ortak biçime çevrilir:

| Alan | Anlamı |
|---|---|
| `id` | benzersiz olay kimliği |
| `taskId` | Observatory görev kimliği (`task_...`) |
| `sessionId` | ajanın kendi oturum / thread kimliği |
| `agent` | `claude`, `codex`, `agy`, `opencode`, ... |
| `tier` | 1: doğrudan akış, 2: kanca (yapılmadı), 3: dosya izleme (yapılmadı) |
| `type` | aşağıdaki olay türleri |
| `data` | türe özgü JSON |
| `timestamp` | milisaniye |

## Olay türleri

| Tür | Ne zaman | `data` örneği |
|---|---|---|
| `task.started` | süreç başladı | `{ prompt, cwd, pid }` veya `{ model }` |
| `message.delta` | ajan metin yazdı | `{ text: "OK" }` |
| `tool.invoked` | araç çağırdı | `{ name: "Bash", input: {...} }` |
| `tool.completed` | araç sonucu | `{ name, result }` |
| `usage.updated` | token bilgisi | `{ usage: { input_tokens: 11317, output_tokens: 1 } }` |
| `task.completed` | çıkış kodu 0 | `{ exitCode: 0, result }` |
| `task.failed` | hata | `{ exitCode, error }` |
| `task.cancelled` | iptal | `{ reason }` |

Bir görev bittiğinde (`completed`, `failed`, `cancelled`) durumu değişmez; iptal edilmiş görev sonradan `failed` olarak yazılmaz.

## SQLite şeması
Dosya: `~/.observatory/observatory.sqlite` (WAL).

**events**: `id, task_id, session_id, agent, tier, type, data (JSON metin), timestamp, parent_task_id`

**tasks**: `task_id, session_id, agent, status, prompt, model, pid, start_time, end_time, duration_ms, assistant_text, input_tokens, ..., parent_task_id`

Büyük alanlar WAL şişmesin diye belirli bayt sınırında kesilir (`sqlite_store.ts`).

## Sorgu örnekleri

Son 10 görev:

```sql
SELECT task_id, agent, status, duration_ms FROM tasks ORDER BY start_time DESC LIMIT 10;
```

Bir görevin akışı:

```sql
SELECT type, substr(data, 1, 80) FROM events WHERE task_id = 'task_mvldqryu_nlsz' ORDER BY timestamp;
```

Motor başına başarı sayısı:

```sql
SELECT agent, status, COUNT(*) FROM tasks GROUP BY agent, status;
```

Node 24 ile:

```js
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.env.USERPROFILE + '/.observatory/observatory.sqlite', { readOnly: true });
console.log(db.prepare('SELECT agent, COUNT(*) n FROM tasks GROUP BY agent').all());
```
