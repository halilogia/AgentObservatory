// observatory web [--port 8788]: Claude Code, Codex, OpenCode ve Antigravity (agy) için sohbet arayüzü.
// serve.ts'in salt okunur API'sine ek olarak: statik arayüz, görev başlatma (POST /api/run) ve iptal.
// Güvenlik: yalnızca 127.0.0.1; Host + tam Origin denetimi; yazma uçları rastgele jeton ister (sayfaya meta etiketiyle verilir);
// çalışma klasörü izinli köklerle sınırlı; varsayılan salt okunur; dangerously_skip_permissions ve danger-full-access yok.
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
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
    note: 'engines.claude.note',
    models: [
      { id: 'sonnet', label: 'Claude Sonnet 5.5', sub: 'models.sonnet' },
      { id: 'opus', label: 'Claude Opus 5.5', sub: 'models.opus' },
      { id: 'haiku', label: 'Claude Haiku 5.5', sub: 'models.haiku' }
    ] },
  { id: 'codex', label: 'Codex', color: '#10A37F', write: true, efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    models: [{ id: 'gpt-6-astra', label: 'GPT-6 Astra', sub: 'models.gpt6astra' }] },
  { id: 'opencode', label: 'OpenCode', color: '#AA82FF', write: true, efforts: [],
    note: 'engines.opencode.note',
    models: [{ id: 'opencode/big-pickle', label: 'Big Pickle', sub: 'models.free' }] },
  { id: 'agy', label: 'Antigravity (agy)', color: '#4285F4', write: false, efforts: ['low', 'high'],
    note: 'engines.agy.note',
    models: [{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', sub: 'models.gemini38flash' }] }
];

/** `opencode models` çıktısından ücretsiz OpenCode (Zen) modelleri: 'opencode/...' satırları, big-pickle önce */
export function parseOpenCodeModels(text: string): ModelDef[] {
  const ids = Array.from(new Set(String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => /^opencode\/[\w.-]+$/.test(l))));
  ids.sort((a, b) => (a === 'opencode/big-pickle' ? -1 : b === 'opencode/big-pickle' ? 1 : a.localeCompare(b)));
  return ids.map((id) => ({ id, label: humanizeModel(id), sub: 'models.free' }));
}

const UPPER = new Set(['vl', 'glm', 'gpt', 'llm', 'ai']);
export function humanizeModel(id: string): string {
  return id.replace(/^[^/]*\//, '').replace(/-free$/, '').split('-').filter(Boolean)
    .map((t) => (UPPER.has(t) || /^\d+b$/i.test(t) ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1))).join(' ');
}

const OPENCODE_TTL_MS = 10 * 60 * 1000;
function listOpenCodeViaCli(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(resolveBinary('opencode'), ['models'], { timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
  });
}

const MAX_BODY = 256 * 1024;
const MAX_ACTIVE = 4;
const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

export interface RunnerLike {
  startTask(o: any): { taskId: string; promise: Promise<unknown> };
  cancelTask?(taskId: string, reason?: string): unknown;
}

export interface WebOptions { opencodeListing?: () => Promise<string>; port?: number; dbPath?: string; roots?: string[]; runner?: RunnerLike; token?: string; pollMs?: number; webDir?: string; configPath?: string }

// Ayar dosyası: { roots?: string[]; folders?: string[] }. `roots` = altındaki klasörler listelenir; `folders` = tek tek eklenmiş proje klasörleri.
interface WebConfig { roots?: string[]; folders?: string[] }
const CONFIG_PATH = process.env.OBSERVATORY_CONFIG || path.join(os.homedir(), '.agent-observatory', 'web.json');

function readConfig(file: string): WebConfig {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    const strs = (a: unknown) => (Array.isArray(a) ? a.filter((s) => typeof s === 'string' && s) : undefined);
    return { roots: strs(v.roots), folders: strs(v.folders) };
  } catch { return {}; }
}
function writeConfig(file: string, cfg: WebConfig): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2), 'utf8');
}

/** çok geniş klasör: sürücü kökü, kullanıcı klasörü ya da onun üstü. Ajana tüm bilgisayarı açmamak için reddedilir. */
export function tooBroad(dir: string): boolean {
  const norm = (p: string) => path.resolve(p).toLowerCase();
  const d = norm(dir), home = norm(os.homedir());
  return d === norm(path.parse(d).root) || d === home || home.startsWith(d + path.sep);
}

/** Kök seçimi: --root / OBSERVATORY_WEB_ROOTS > ayar dosyası > başlatılan klasörün üstü (yanındaki projeler). */
function defaultRoots(cfg: WebConfig, cwd = process.cwd()): string[] {
  const env = process.env.OBSERVATORY_WEB_ROOTS;
  if (env) return env.split(';').map((s) => s.trim()).filter(Boolean);
  if (cfg.roots && cfg.roots.length) return cfg.roots;
  const up = path.dirname(path.resolve(cwd));
  return tooBroad(up) ? [] : [up];
}

export function insideRoots(dir: string, roots: string[]): boolean {
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
  const configPath = opts.configPath || CONFIG_PATH;
  const cfg = readConfig(configPath);
  const roots = (opts.roots || defaultRoots(cfg)).filter((r) => fs.existsSync(r));
  // tek tek eklenmiş proje klasörleri (kökten bağımsız); açılışta olmayanlar atılır
  let folders = (cfg.folders || []).filter((f) => fs.existsSync(f) && !tooBroad(f));
  const allowedDir = (dir: string): boolean => {
    if (insideRoots(dir, roots)) return true;
    return folders.some((f) => insideRoots(dir, [f]));
  };
  const saveFolders = () => writeConfig(configPath, { ...readConfig(configPath), folders });
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

  // OpenCode'un ücretsiz modelleri `opencode models` CLI çıktısından canlı okunur (10 dk önbellek; liste sık değişir)
  let ocModels: ModelDef[] | null = null;
  let ocAt = 0;
  let ocPending: Promise<void> | null = null;
  const listing = opts.opencodeListing || listOpenCodeViaCli;
  async function enginesNow(): Promise<EngineDef[]> {
    if (!ocModels || Date.now() - ocAt > OPENCODE_TTL_MS) {
      ocPending = ocPending || listing().then(
        (t) => { const m = parseOpenCodeModels(t); if (m.length) ocModels = m; ocAt = Date.now(); },
        () => { ocAt = Date.now() - OPENCODE_TTL_MS + 30000; } // başarısız: 30 sn sonra yeniden dene, o arada yedek liste
      ).finally(() => { ocPending = null; });
      if (!ocModels) await ocPending; // ilk açılışta bekle (yaklaşık 1,6 sn); sonrakilerde eski liste hemen döner
    }
    return ENGINES.map((e) => (e.id === 'opencode' && ocModels ? { ...e, models: ocModels } : e));
  }

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
        const same = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
        const added = folders.filter((f) => fs.existsSync(f)).map((f) => ({ name: path.basename(f), path: f, custom: true }));
        const projects: Array<{ name: string; path: string; custom?: boolean }> = [...added, ...listProjects(roots).filter((p) => !added.some((a) => same(a.path, p.path)))];
        // varsayılan klasör: sunucunun başlatıldığı proje (izinli kökün içindeyse, kökün kendisi değilse); yoksa en son değişen proje
        const here = path.resolve(process.cwd());
        const hereOk = fs.existsSync(here) && allowedDir(here) && !tooBroad(here) && !roots.some((r) => same(r, here));
        if (hereOk && !projects.some((p) => path.resolve(p.path).toLowerCase() === here.toLowerCase())) projects.unshift({ name: path.basename(here), path: here });
        json(200, {
          engines: (await enginesNow()).map((e) => ({ ...e, ...engineStatus(db, e) })),
          roots, projects, defaultCwd: hereOk ? here : projects[0]?.path || roots[0] || os.homedir(), maxActive: MAX_ACTIVE
        });
        return true;
      }

      // ---- yazan uçlar: jeton + aynı köken ----
      if (method === 'POST' && ['/api/run', '/api/cancel', '/api/folders', '/api/folders/remove'].includes(url.pathname)) {
        // hata yanıtları `code` taşır: arayüz bunu seçili dile çevirir; `error` Türkçe yedek metindir
        const fail = (status: number, code: string, error: string, params: Record<string, unknown> = {}) => { json(status, { code, error, params }); return true; };
        const site = req.headers['sec-fetch-site'];
        if (site && site !== 'same-origin') return fail(403, 'bad_origin', 'yalnızca aynı kökenden');
        if (!tokenOk(req.headers['x-observatory-token'])) return fail(403, 'bad_token', 'jeton geçersiz');
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) return fail(415, 'bad_content_type', 'application/json gerekli');
        let b: any;
        try { b = await readJson(req); } catch (e: any) { return fail(e.status || 400, e.status === 413 ? 'too_large' : 'bad_json', e.message); }

        if (url.pathname === '/api/folders' || url.pathname === '/api/folders/remove') {
          const raw = typeof b.path === 'string' ? b.path.trim().replace(/^"(.*)"$/, '$1') : '';
          if (!raw || !path.isAbsolute(raw)) return fail(400, 'folder_not_absolute', 'tam yol gerekli (ör. C:\\Users\\...\\proje)');
          const dir = path.resolve(raw);
          const same = (a: string, c: string) => path.resolve(a).toLowerCase() === path.resolve(c).toLowerCase();
          if (url.pathname === '/api/folders/remove') {
            folders = folders.filter((f) => !same(f, dir));
            saveFolders();
            json(200, { ok: true });
            return true;
          }
          let st: fs.Stats;
          try { st = fs.statSync(dir); } catch { return fail(400, 'folder_missing', 'klasör bulunamadı'); }
          if (!st.isDirectory()) return fail(400, 'folder_not_dir', 'bu bir klasör değil');
          if (tooBroad(dir)) return fail(400, 'folder_too_broad', 'çok geniş klasör: sürücü kökü ya da kullanıcı klasörü eklenemez');
          if (!folders.some((f) => same(f, dir))) { folders.unshift(dir); saveFolders(); }
          json(200, { ok: true, path: dir });
          return true;
        }

        if (url.pathname === '/api/cancel') {
          if (typeof b.taskId !== 'string' || !active.has(b.taskId)) return fail(404, 'no_active_task', 'etkin görev yok');
          const runner = await getRunner();
          runner.cancelTask?.(b.taskId, 'Kullanıcı arayüzden iptal etti');
          json(200, { ok: true });
          return true;
        }

        const engine = (await enginesNow()).find((e) => e.id === b.engine);
        if (!engine) return fail(400, 'unknown_engine', 'bilinmeyen motor');
        const model = engine.models.find((m) => m.id === b.model);
        if (!model) return fail(400, 'unknown_model', 'bu motor için bilinmeyen model');
        if (typeof b.prompt !== 'string' || !b.prompt.trim() || b.prompt.length > 20000) return fail(400, 'bad_prompt', 'istem boş ya da 20000 karakterden uzun');
        const effort = b.effort === undefined || b.effort === '' ? undefined : String(b.effort);
        if (effort !== undefined && !engine.efforts.includes(effort)) return fail(400, 'bad_effort', 'bu motor bu çabayı desteklemiyor');
        const write = b.mode === 'write';
        if (write && !engine.write) return fail(400, 'no_write', `${engine.label} yazma kipini desteklemiyor`, { engine: engine.label });
        const cwd = typeof b.cwd === 'string' && b.cwd ? b.cwd : roots[0] || folders[0];
        if (!cwd || !fs.existsSync(cwd) || !allowedDir(cwd)) return fail(400, 'cwd_forbidden', 'çalışma klasörü izinli köklerin dışında');
        if (active.size >= MAX_ACTIVE) return fail(429, 'too_many', `en çok ${MAX_ACTIVE} eşzamanlı görev`, { max: MAX_ACTIVE });
        const st = engineStatus(db, engine);
        if (!st.installed) return fail(409, 'not_installed', `${engine.label} kurulu değil`, { engine: engine.label });
        if (st.limitedUntil) return fail(409, 'limited', `${engine.label} kotası dolu`, { engine: engine.label, limitedUntil: st.limitedUntil });

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
  // --root <klasör> (tekrarlanabilir): bu klasörlerin altındaki projeler listelenir
  const flagRoots = args.flatMap((a, i) => (a === '--root' && args[i + 1] ? [path.resolve(args[i + 1])] : []));
  const { server } = startWeb({ port, roots: flagRoots.length ? flagRoots : undefined });
  await new Promise((r) => server.once('listening', r));
  console.log(`Observatory sohbet arayüzü: http://127.0.0.1:${port}`);
  const roots = flagRoots.length ? flagRoots : defaultRoots(readConfig(CONFIG_PATH));
  console.log(`Klasör kökleri: ${roots.join('; ') || '(yok)'}. Arayüzden "Klasör ekle" ile başka klasör ekleyebilirsin (ayar: ${CONFIG_PATH}). Varsayılan kip salt okunur.`);
}
