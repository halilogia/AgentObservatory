// observatory serve [--port 8787]: SQLite olaylarını HTTP + SSE ile dışarı verir (3D ofis, web paneli, mod).
// Yalnızca 127.0.0.1'e bağlanır; Host ve Origin denetimi yerel olmayan sayfaların veriyi okumasını engeller.
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const LOCAL_HOST_RE = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const LOCAL_ORIGIN_RE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

function parseRow(row: any) {
  let data: unknown = {};
  try { data = JSON.parse(row.data); } catch { data = { raw: row.data }; }
  return {
    seq: Number(row.seq), id: row.id, taskId: row.task_id, sessionId: row.session_id, agent: row.agent,
    tier: row.tier, type: row.type, data, timestamp: Number(row.timestamp), parentTaskId: row.parent_task_id ?? null
  };
}

/** Ek yollar (ör. web arayüzü): true dönerse yanıt verilmiştir. Host/Origin korumasından SONRA çağrılır. */
export interface ExtraCtx { req: http.IncomingMessage; res: http.ServerResponse; url: URL; json: (code: number, body: unknown) => void; db: DatabaseSync }
export type ExtraHandler = (ctx: ExtraCtx) => boolean | Promise<boolean>;

/** Uzaktan erişim (ör. Tailscale): yerel olmayan Host yalnızca açıkça izin verilenlerse kabul edilir; `gate` her istekte (Host/Origin sonrası) kimlik denetimi yapar. */
export type GateHandler = (ctx: ExtraCtx & { remote: boolean }) => boolean | Promise<boolean>;

export function startServer(opts: { port?: number; dbPath?: string; pollMs?: number; allowedOrigins?: string[] | (() => string[]); extra?: ExtraHandler; allowedHosts?: () => string[]; gate?: GateHandler } = {}): http.Server {
  const dbPath = opts.dbPath || process.env.OBSERVATORY_DB || path.join(os.homedir(), '.observatory', 'observatory.sqlite');
  if (!fs.existsSync(dbPath)) throw new Error(`Veritabanı yok: ${dbPath} (önce bir görev çalıştır)`);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA query_only = 1;');
  const pollMs = opts.pollMs ?? 300;

  const q = {
    tasks: db.prepare('SELECT * FROM tasks ORDER BY start_time DESC LIMIT ?'),
    task: db.prepare('SELECT * FROM tasks WHERE task_id = ?'),
    taskEvents: db.prepare('SELECT rowid AS seq, * FROM events WHERE task_id = ? ORDER BY rowid'),
    since: db.prepare('SELECT rowid AS seq, * FROM events WHERE rowid > ? ORDER BY rowid LIMIT 500'),
    maxSeq: db.prepare('SELECT COALESCE(MAX(rowid), 0) AS m FROM events')
  };

  const clients = new Set<http.ServerResponse>();
  const lastSeq = new Map<http.ServerResponse, number>();

  const timer = setInterval(() => {
    for (const res of clients) {
      const rows = q.since.all(lastSeq.get(res) ?? 0) as any[];
      for (const row of rows) {
        const ev = parseRow(row);
        res.write(`id: ${ev.seq}\nevent: observatory\ndata: ${JSON.stringify(ev)}\n\n`);
        lastSeq.set(res, ev.seq);
      }
    }
  }, pollMs);

  const server = http.createServer(async (req, res) => {
    const host = String(req.headers.host || '');
    const remote = !LOCAL_HOST_RE.test(host);
    if (remote && !(opts.allowedHosts?.() || []).includes(host.toLowerCase())) { res.writeHead(403).end('forbidden host'); return; }
    const origin = String(req.headers.origin || '');
    if (origin) {
      // allowedOrigins verilirse (web arayüzü) yalnızca o kökenler; aksi halde herhangi bir yerel köken (salt okunur API)
      const list = typeof opts.allowedOrigins === 'function' ? opts.allowedOrigins() : opts.allowedOrigins;
      const ok = list ? list.includes(origin) : LOCAL_ORIGIN_RE.test(origin);
      if (!ok) { res.writeHead(403).end('forbidden origin'); return; }
      if (!opts.allowedOrigins) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
    }
    const url = new URL(req.url || '/', `http://${host}`);
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    try {
      if (opts.gate && (await opts.gate({ req, res, url, json, db, remote }))) return;
      if (opts.extra && (await opts.extra({ req, res, url, json, db }))) return;
      if (url.pathname === '/health') return json(200, { ok: true, db: dbPath, lastSeq: Number((q.maxSeq.get() as any).m) });
      if (url.pathname === '/tasks') {
        const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 500);
        return json(200, q.tasks.all(limit));
      }
      const m = /^\/tasks\/([\w.-]+)$/.exec(url.pathname);
      if (m) {
        const task = q.task.get(m[1]);
        if (!task) return json(404, { error: 'görev yok' });
        return json(200, { task, events: (q.taskEvents.all(m[1]) as any[]).map(parseRow) });
      }
      if (url.pathname === '/events') {
        const since = Number(url.searchParams.get('since')) || 0;
        return json(200, (q.since.all(since) as any[]).map(parseRow));
      }
      if (url.pathname === '/stream') {
        // Last-Event-ID ile kaldığı yerden devam; yoksa yalnızca yeni olaylar
        const fromHeader = Number(req.headers['last-event-id']);
        const fromQuery = url.searchParams.get('since');
        const start = Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : fromQuery !== null ? Number(fromQuery) : Number((q.maxSeq.get() as any).m);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(': bağlandı\n\n');
        clients.add(res);
        lastSeq.set(res, start);
        req.on('close', () => { clients.delete(res); lastSeq.delete(res); });
        return;
      }
      return json(404, { error: 'bilinmeyen yol', paths: ['/health', '/tasks', '/tasks/:id', '/events?since=', '/stream'] });
    } catch (err: any) {
      return json(500, { error: String(err.message) });
    }
  });

  server.on('close', () => { clearInterval(timer); db.close(); });
  server.listen(opts.port ?? 8787, '127.0.0.1');
  return server;
}
