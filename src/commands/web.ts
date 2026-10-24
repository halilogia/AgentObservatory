// observatory web [--port 8788]: Claude Code, Codex, OpenCode ve Antigravity (agy) için sohbet arayüzü.
// serve.ts'in salt okunur API'sine ek olarak: statik arayüz, görev başlatma (POST /api/run) ve iptal.
// Güvenlik: yalnızca 127.0.0.1; Host + tam Origin denetimi; yazma uçları rastgele jeton ister (sayfaya meta etiketiyle verilir);
// çalışma klasörü izinli köklerle sınırlı; varsayılan salt okunur; dangerously_skip_permissions ve danger-full-access yok.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.ts';
import type { ExtraCtx } from './serve.ts';
import { resolveBinary } from '../core/paths.ts';

export interface ModelDef { id: string; label: string; sub: string }
export interface EngineDef { id: 'claude' | 'codex' | 'agy' | 'opencode'; label: string; color: string; models: ModelDef[]; efforts: string[]; write: boolean; note?: string }

export const ENGINES: EngineDef[] = [
  { id: 'claude', label: 'Claude Code', color: '#D97757', write: false, efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    note: 'Headless modda izin sorulamaz: yalnızca okuma ve yanıt.',
    models: [
      { id: 'sonnet', label: 'Claude Sonnet 5.5', sub: 'Günlük kodlama ve ajan işleri' },
      { id: 'opus', label: 'Claude Opus 5.5', sub: 'Karmaşık işler için amiral gemisi' },
      { id: 'haiku', label: 'Claude Haiku 5.5', sub: 'Hızlı yanıtlar' }
    ] },
  { id: 'codex', label: 'Codex', color: '#10A37F', write: true, efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    models: [{ id: 'gpt-6-astra', label: 'GPT-6 Astra', sub: 'OpenAI, ChatGPT girişiyle' }] },
  { id: 'opencode', label: 'OpenCode', color: '#AA82FF', write: true, efforts: [],
    note: 'Yazma kipinde dosya düzenler, kabuk komutu çalıştırmaz.',
    models: [{ id: 'opencode/big-pickle', label: 'Big Pickle', sub: 'Ücretsiz model' }] },
  { id: 'agy', label: 'Antigravity (agy)', color: '#4285F4', write: false, efforts: ['low', 'high'],
    note: 'Headless modda yazma izni yok. Düşük hacimde kullan.',
    models: [{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', sub: 'Google, resmî agy.exe' }] }
];

const MAX_BODY = 256 * 1024;
const MAX_ACTIVE = 4;
const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

export interface RunnerLike {
  startTask(o: any): { taskId: string; promise: Promise<unknown> };
  cancelTask?(taskId: string, reason?: string): unknown;
}

export interface WebOptions { port?: number; dbPath?: string; roots?: string[]; runner?: RunnerLike; token?: string; pollMs?: number; webDir?: string }

function defaultRoots(): string[] {
  const env = process.env.OBSERVATORY_WEB_ROOTS;
  if (env) return env.split(';').map((s) => s.trim()).filter(Boolean);
  return [path.join(os.homedir(), 'Desktop', 'GitHub')];
}

function insideRoots(dir: string, roots: string[]): boolean {
  let real: string;
  try { real = fs.realpathSync(dir); } catch { return false; }
  const norm = (p: string) => path.resolve(p).toLowerCase();
  return roots.some((r) => {
    let rr: string; try { rr = fs.realpathSync(r); } catch { return false; }
    const a = norm(real), b = norm(rr);
    return a === b || a.startsWith(b + path.sep);
  });
}

function listProjects(roots: string[]): Array<{ name: string; path: string }> {
  const out: Array<{ name: string; path: string }> = [];
  const dirs = (d: string) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => path.join(d, e.name)); } catch { return []; } };
  for (const root of roots) {
    // kökün kendisi listelenmez: çok büyük klasörde ajanlar (özellikle OpenCode) takılır; son değişen proje önce gelir
    for (const c of dirs(root)) {
      if (/^(public|private)$/i.test(path.basename(c))) for (const g of dirs(c)) out.push({ name: path.basename(g), path: g });
      else out.push({ name: path.basename(c), path: c });
    }
  }
  const mtime = (p: string) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
  return out.sort((a, b) => mtime(b.path) - mtime(a.path)).slice(0, 120);
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw Object.assign(new Error('gövde çok büyük'), { status: 413 });
    chunks.push(c as Buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('geçersiz JSON'), { status: 400 }); }
}

export function startWeb(opts: WebOptions = {}): { server: http.Server; token: string; port: number } {
  // Web'den başlatılan görevler konsol penceresi açmasın (arayüz zaten canlı gösterir)
  process.env.OBSERVATORY_NO_AUTO_TUI = '1';
  const port = opts.port ?? 8788;
  const token = opts.token || crypto.randomBytes(24).toString('hex');
  const roots = (opts.roots || defaultRoots()).filter((r) => fs.existsSync(r));
  const webDir = opts.webDir || WEB_DIR;
  const active = new Set<string>();
  let runnerPromise: Promise<RunnerLike> | null = null;
  const getRunner = (): Promise<RunnerLike> => {
    if (opts.runner) return Promise.resolve(opts.runner);
    runnerPromise = runnerPromise || import('../runtime/agent_runner.ts').then((m) => m.globalRunner as unknown as RunnerLike);
    return runnerPromise;
  };

  const tokenOk = (given: unknown): boolean => {
    const a = Buffer.from(String(given || '')), b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };

  function engineStatus(db: ExtraCtx['db'], e: EngineDef): { installed: boolean; limitedUntil: number | null } {
    const installed = fs.existsSync(resolveBinary(e.id));
    let limitedUntil: number | null = null;
    try {
      const fail = db.prepare("SELECT data, timestamp FROM events WHERE agent = ? AND type = 'task.failed' ORDER BY timestamp DESC LIMIT 1").get(e.id) as any;
      if (fail) {
        const d = JSON.parse(fail.data);
        if (d.errorKind === 'rate_limit') {
          const until = Number(fail.timestamp) + (Number(d.cooldownMs) || 30 * 60000);
          const ok = db.prepare("SELECT 1 FROM events WHERE agent = ? AND type = 'task.completed' AND timestamp > ? LIMIT 1").get(e.id, fail.timestamp);
          if (until > Date.now() && !ok) limitedUntil = until;
        }
      }
    } catch { /* durum bilinmiyor: sınırlı sayma */ }
    return { installed, limitedUntil };
  }

  const server = startServer({
    port, dbPath: opts.dbPath, pollMs: opts.pollMs,
    allowedOrigins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`],
    extra: async ({ req, res, url, json, db }) => {
      const method = req.method || 'GET';

      // ---- statik arayüz ----
      const staticFile = url.pathname === '/' ? 'index.html' : /^\/[\w-]+\.(html|js|css)$/.test(url.pathname) ? url.pathname.slice(1) : '';
      if (method === 'GET' && staticFile && fs.existsSync(path.join(webDir, staticFile))) {
        const file = staticFile;
        let body = fs.readFileSync(path.join(webDir, file), 'utf8');
        if (file === 'index.html') body = body.replace('__OBS_TOKEN__', token);
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file)] || 'text/plain',
          'Cache-Control': 'no-store',
          'X-Frame-Options': 'DENY',
          'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        });
        res.end(body);
        return true;
      }

      if (method === 'GET' && url.pathname === '/api/config') {
        const projects = listProjects(roots);
        // varsayılan klasör: sunucunun başlatıldığı proje (izinli kökün içindeyse, kökün kendisi değilse); yoksa en son değişen proje
        const here = path.resolve(process.cwd());
        const hereOk = fs.existsSync(here) && insideRoots(here, roots) && !roots.some((r) => path.resolve(r).toLowerCase() === here.toLowerCase());
        if (hereOk && !projects.some((p) => path.resolve(p.path).toLowerCase() === here.toLowerCase())) projects.unshift({ name: path.basename(here), path: here });
        json(200, {
          engines: ENGINES.map((e) => ({ ...e, ...engineStatus(db, e) })),
          roots, projects, defaultCwd: hereOk ? here : projects[0]?.path || roots[0] || os.homedir(), maxActive: MAX_ACTIVE
        });
        return true;
      }

      // ---- yazan uçlar: jeton + aynı köken ----
      if (method === 'POST' && (url.pathname === '/api/run' || url.pathname === '/api/cancel')) {
        const site = req.headers['sec-fetch-site'];
        if (site && site !== 'same-origin') { json(403, { error: 'yalnızca aynı kökenden' }); return true; }
        if (!tokenOk(req.headers['x-observatory-token'])) { json(403, { error: 'jeton geçersiz' }); return true; }
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) { json(415, { error: 'application/json gerekli' }); return true; }
        let b: any;
        try { b = await readJson(req); } catch (e: any) { json(e.status || 400, { error: e.message }); return true; }

        if (url.pathname === '/api/cancel') {
          if (typeof b.taskId !== 'string' || !active.has(b.taskId)) { json(404, { error: 'etkin görev yok' }); return true; }
          const runner = await getRunner();
          runner.cancelTask?.(b.taskId, 'Kullanıcı arayüzden iptal etti');
          json(200, { ok: true });
          return true;
        }

        const engine = ENGINES.find((e) => e.id === b.engine);
        if (!engine) { json(400, { error: 'bilinmeyen motor' }); return true; }
        const model = engine.models.find((m) => m.id === b.model);
        if (!model) { json(400, { error: 'bu motor için bilinmeyen model' }); return true; }
        if (typeof b.prompt !== 'string' || !b.prompt.trim() || b.prompt.length > 20000) { json(400, { error: 'istem boş ya da 20000 karakterden uzun' }); return true; }
        const effort = b.effort === undefined || b.effort === '' ? undefined : String(b.effort);
        if (effort !== undefined && !engine.efforts.includes(effort)) { json(400, { error: 'bu motor bu çabayı desteklemiyor' }); return true; }
        const write = b.mode === 'write';
        if (write && !engine.write) { json(400, { error: `${engine.label} yazma kipini desteklemiyor` }); return true; }
        const cwd = typeof b.cwd === 'string' && b.cwd ? b.cwd : roots[0];
        if (!cwd || !fs.existsSync(cwd) || !insideRoots(cwd, roots)) { json(400, { error: 'çalışma klasörü izinli köklerin dışında' }); return true; }
        if (active.size >= MAX_ACTIVE) { json(429, { error: `en çok ${MAX_ACTIVE} eşzamanlı görev` }); return true; }
        const st = engineStatus(db, engine);
        if (!st.installed) { json(409, { error: `${engine.label} kurulu değil` }); return true; }
        if (st.limitedUntil) { json(409, { error: `${engine.label} kotası dolu`, limitedUntil: st.limitedUntil }); return true; }

        // agy modeli çabaya göre seçilir (gemini-3.8-flash-low | -high); diğerlerinde model kimliği olduğu gibi
        const modelId = engine.id === 'agy' ? `${model.id}-${effort === 'low' ? 'low' : 'high'}` : model.id;
        const runner = await getRunner();
        const { taskId, promise } = runner.startTask({
          agent: engine.id, prompt: b.prompt, cwd: path.resolve(cwd), model: modelId,
          effort: engine.id === 'claude' || engine.id === 'codex' ? effort : undefined,
          sandbox: write ? 'workspace-write' : 'read-only',
          sessionId: typeof b.sessionId === 'string' && b.sessionId ? b.sessionId : undefined,
          dangerouslySkipPermissions: false, timeoutSeconds: 900
        });
        active.add(taskId);
        promise.catch(() => undefined).finally(() => active.delete(taskId));
        json(200, { taskId, engine: engine.id, model: modelId });
        return true;
      }
      return false;
    }
  });
  return { server, token, port };
}

export async function runWeb(args: string[]): Promise<void> {
  const pIdx = args.indexOf('--port');
  const port = pIdx >= 0 ? Number(args[pIdx + 1]) : Number(process.env.OBSERVATORY_WEB_PORT) || 8788;
  const { server } = startWeb({ port });
  await new Promise((r) => server.once('listening', r));
  console.log(`Observatory sohbet arayüzü: http://127.0.0.1:${port}`);
  console.log(`İzinli klasör kökleri: ${defaultRoots().join('; ')} (OBSERVATORY_WEB_ROOTS ile değişir). Varsayılan kip salt okunur.`);
}
