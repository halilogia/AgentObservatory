// observatory web [--port 8788]: Claude Code, Codex, OpenCode ve Antigravity (agy) için sohbet arayüzü.
// serve.ts'in salt okunur API'sine ek olarak: statik arayüz, görev başlatma (POST /api/run) ve iptal.
// Güvenlik: yalnızca 127.0.0.1; Host + tam Origin denetimi; yazma uçları rastgele jeton ister (sayfaya meta etiketiyle verilir);
// çalışma klasörü izinli köklerle sınırlı; varsayılan salt okunur; dangerously_skip_permissions ve danger-full-access yok.
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.ts';
import type { ExtraCtx } from './serve.ts';
import { resolveBinary } from '../core/paths.ts';
import { AccountPoolManager, globalAccountPool } from '../core/account_pool.ts';
import type { PooledAgent } from '../core/account_pool.ts';
import { restoreTree, snapshotTree } from './web_snapshot.ts';
import { readCapabilities } from './web_capabilities.ts';
import { Remote } from './web_remote.ts';
import { groupSessions, sessionEvents, subagentsOf } from './web_sessions.ts';
import { scanWidgets, renderWidgetSvg } from '../core/library_widgets.ts';
import { globalTasteStore } from '../core/taste_store.ts';

export interface ModelDef { id: string; label: string; sub: string }
export type TeamId = 'turuncu' | 'mavi' | 'kirmizi' | 'siyah';
/** Takım meta bilgisi tek yerde: renk + dil anahtarı (ad, lang-tr/lang-en içindeki team.<id> anahtarından gelir) */
export const TEAMS: Array<{ id: TeamId; color: string; labelKey: string }> = [
  { id: 'turuncu', color: '#D97757', labelKey: 'team.turuncu' },
  { id: 'mavi', color: '#4285F4', labelKey: 'team.mavi' },
  { id: 'kirmizi', color: '#E5484D', labelKey: 'team.kirmizi' },
  { id: 'siyah', color: '#3A3A3C', labelKey: 'team.siyah' }
];
export interface EngineDef { id: 'claude' | 'codex' | 'agy' | 'opencode' | 'commandcode'; team: TeamId; label: string; color: string; models: ModelDef[]; efforts: string[]; write: boolean; note?: string }

export const ENGINES: EngineDef[] = [
  { id: 'claude', team: 'turuncu', label: 'Claude Code', color: '#D97757', write: false, efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    note: 'engines.claude.note',
    models: [
      { id: 'sonnet', label: 'Claude Sonnet 5.5', sub: 'models.sonnet' },
      { id: 'opus', label: 'Claude Opus 5.5', sub: 'models.opus' },
      { id: 'haiku', label: 'Claude Haiku 5.5', sub: 'models.haiku' }
    ] },
  { id: 'codex', team: 'kirmizi', label: 'Codex', color: '#E5484D', write: true, efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
    models: [{ id: 'gpt-6-astra', label: 'GPT-6 Astra', sub: 'models.gpt6astra' }] },
  { id: 'opencode', team: 'siyah', label: 'OpenCode', color: '#3A3A3C', write: true, efforts: [],
    note: 'engines.opencode.note',
    models: [
      { id: 'opencode/deepseek-v4.1-flash-free', label: 'DeepSeek V4.1 Flash', sub: 'models.free' },
      { id: 'opencode/big-pickle', label: 'Big Pickle', sub: 'models.free' }
    ] },
  { id: 'commandcode', team: 'siyah', label: 'Command Code', color: '#3A3A3C', write: false, efforts: [],
    note: 'engines.commandcode.note', models: [{ id: '', label: 'Command Code', sub: 'models.cliDefault' }] },
  { id: 'agy', team: 'mavi', label: 'Antigravity (agy)', color: '#4285F4', write: false, efforts: ['low', 'medium', 'high'],
    note: 'engines.agy.note',
    models: [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', sub: 'models.gemini38flash' },
      { id: 'gemini-4-argon', label: 'Gemini 4 Argon', sub: 'models.gemini4argon' }
    ] }
];

/** `opencode models` çıktısından ücretsiz OpenCode (Zen) modelleri: 'opencode/...' satırları, big-pickle önce */
export function parseOpenCodeModels(text: string): ModelDef[] {
  const ids = Array.from(new Set(String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => /^opencode\/[\w.-]+$/.test(l))));
  ids.sort((a, b) => {
    const aDeep = a.toLowerCase().includes('deepseek');
    const bDeep = b.toLowerCase().includes('deepseek');
    if (aDeep && !bDeep) return -1;
    if (!aDeep && bDeep) return 1;
    if (a === 'opencode/big-pickle') return -1;
    if (b === 'opencode/big-pickle') return 1;
    return a.localeCompare(b);
  });
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
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

export interface RunnerLike {
  startTask(o: any): { taskId: string; promise: Promise<unknown> };
  cancelTask?(taskId: string, reason?: string): unknown;
  approveTask?(taskId: string, approved: boolean): boolean;
}

export interface WebOptions { opencodeListing?: () => Promise<string>; port?: number; dbPath?: string; roots?: string[]; runner?: RunnerLike; token?: string; pollMs?: number; ingest?: boolean; webDir?: string; configPath?: string; home?: string; detectTailscale?: () => Promise<import('./web_remote.ts').TsInfo>; accountPool?: AccountPoolManager }

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
  return []; // Asla kendiliginden ust klasore cikip disk taramasi yapmaz
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
    for (const c of dirs(root)) {
      out.push({ name: path.basename(c), path: c });
    }
  }
  const mtime = (p: string) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
  return out.sort((a, b) => mtime(b.path) - mtime(a.path)).slice(0, 50);
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

function openNativeFolderPicker(): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const exePath = path.join(rootDir, 'bin', 'pick_folder.exe');
    const ps1Path = path.join(rootDir, 'src', 'runtime', 'pick_folder.ps1');

    const finish = (chosen: string | null) => {
      resolve(chosen && fs.existsSync(chosen) ? chosen : null);
    };

    if (fs.existsSync(exePath)) {
      execFile(exePath, ['Select Project Root'], { timeout: 120000, encoding: 'utf8' }, (err, stdout) => {
        if (!err && stdout && stdout.trim() && fs.existsSync(stdout.trim())) {
          return finish(stdout.trim());
        }
        if (err && typeof err === 'object' && 'code' in err && (err as { code?: number }).code === 1) {
          return resolve(null);
        }
        if (fs.existsSync(ps1Path)) {
          execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', ps1Path, 'Select Project Root'], { timeout: 120000, encoding: 'utf8' }, (pErr, pStdout) => {
            if (pErr) return resolve(null);
            finish(pStdout ? pStdout.trim() : null);
          });
          return;
        }
        resolve(null);
      });
      return;
    }

    if (fs.existsSync(ps1Path)) {
      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', ps1Path, 'Select Project Root'], { timeout: 120000, encoding: 'utf8' }, (err, stdout) => {
        if (err) return resolve(null);
        finish(stdout ? stdout.trim() : null);
      });
      return;
    }

    resolve(null);
  });
}

export function startWeb(opts: WebOptions = {}): { server: http.Server; token: string; port: number } {
  // Web'den başlatılan görevler konsol penceresi açmasın (arayüz zaten canlı gösterir)
  process.env.OBSERVATORY_NO_AUTO_TUI = '1';
  const port = opts.port ?? 8788;
  const token = opts.token || crypto.randomBytes(24).toString('hex');
  const configPath = opts.configPath || CONFIG_PATH;
  const remote = new Remote(configPath, opts.port ?? 8788, opts.detectTailscale);
  const cfg = readConfig(configPath);
  const roots = (opts.roots || defaultRoots(cfg)).filter((r) => fs.existsSync(r));
  // tek tek eklenmiş proje klasörleri (kökten bağımsız); açılışta olmayanlar atılır
  let folders = (cfg.folders || []).filter((f) => fs.existsSync(f) && !tooBroad(f));
  const scratchDir = path.join(os.homedir(), '.agent-observatory', 'scratch');
  const allowedDir = (dir: string): boolean => {
    if (insideRoots(dir, roots)) return true;
    if (folders.some((f) => insideRoots(dir, [f]))) return true;
    if (insideRoots(dir, [scratchDir])) return true;
    const here = path.resolve(process.cwd());
    if (fs.existsSync(here) && !tooBroad(here) && insideRoots(dir, [here])) return true;
    return false;
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

  const pool = opts.accountPool || (opts.configPath ? new AccountPoolManager({ baseDir: path.dirname(opts.configPath) }) : globalAccountPool);

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
      if (e.id === 'agy' || e.id === 'claude') {
        const pooled = pool.listAccounts(e.id);
        if (pooled.length > 0) {
          if (pooled.some((a) => a.isAvailable)) {
            limitedUntil = null;
          } else {
            const minUntil = Math.min(...pooled.map((a) => a.cooldownUntil || 0).filter((u) => u > Date.now()));
            if (Number.isFinite(minUntil) && minUntil > Date.now()) limitedUntil = minUntil;
          }
        }
      }
    } catch (err) {
      if (process.env.DEBUG_ACCOUNTS) console.error('[web] engineStatus error:', err);
    }
    return { installed, limitedUntil };
  }

  if (remote.enabled) { void remote.refreshTs(true); }
  const tsTimer = setInterval(() => { if (remote.enabled) void remote.refreshTs(); }, 60000); tsTimer.unref();
  let libraryCache: { at: number; items: Array<{ path: string; name: string; ext: string; mtime: number; size: number; agent: string; sessionId: string; title: string; widgetId?: string; kind?: string; seq?: number }> } | null = null;
  const server = startServer({
    port, dbPath: opts.dbPath, pollMs: opts.pollMs, ingest: opts.ingest,
    allowedOrigins: () => [`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...remote.origins()],
    allowedHosts: remote.hosts,
    gate: (ctx) => remote.gate(ctx, () => fs.readFileSync(path.join(webDir, 'pair.html'), 'utf8'), () => fs.readFileSync(path.join(webDir, 'pair.js'), 'utf8')),
    extra: async ({ req, res, url, json, db }) => {
      const method = req.method || 'GET';

      // ---- statik arayüz ----
      const staticFile = url.pathname === '/' ? 'index.html' : /^\/[\w-]+\.(html|js|css|svg|png|ico|webp)$/.test(url.pathname) ? url.pathname.slice(1) : '';
      if (method === 'GET' && staticFile && fs.existsSync(path.join(webDir, staticFile))) {
        const file = staticFile;
        const ext = path.extname(file).toLowerCase();
        const isBinary = ['.png', '.ico', '.webp'].includes(ext);
        let body: string | Buffer = isBinary ? fs.readFileSync(path.join(webDir, file)) : fs.readFileSync(path.join(webDir, file), 'utf8');
        if (typeof body === 'string' && file === 'index.html') body = body.replace('__OBS_TOKEN__', token);
        const xFrameOptions = 'DENY';
        const csp = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'text/plain',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          'X-Frame-Options': xFrameOptions,
          'Content-Security-Policy': csp
        });
        res.end(body);
        return true;
      }

      // ---- Kitaplık (Library): tüm oturumlardaki üretilen görseller ve SVG'ler ----
      if (method === 'GET' && url.pathname === '/api/library') {
        if (libraryCache && Date.now() - libraryCache.at < 60000) { json(200, libraryCache.items); return true; }
        const rows = db.prepare("SELECT e.task_id, e.session_id, e.agent, e.data, e.timestamp, t.prompt FROM events e LEFT JOIN tasks t ON t.task_id = e.task_id WHERE e.type IN ('tool.invoked', 'tool.completed', 'message.delta') AND (e.data LIKE '%.png%' OR e.data LIKE '%.gif%' OR e.data LIKE '%.svg%' OR e.data LIKE '%.webp%' OR e.data LIKE '%.jpg%') ORDER BY e.timestamp DESC LIMIT 600").all() as any[];
        const seen = new Set<string>();
        const items: Array<{ path: string; name: string; ext: string; mtime: number; size: number; agent: string; sessionId: string; title: string; widgetId?: string; kind?: string; seq?: number }> = [];
        const pathRe = /(?:[A-Za-z]:[\\/][^\s"'`<>|*?]+?\.(?:png|gif|svg|webp|jpg|jpeg)|(?:docs|assets|web|scratch)[\\/][^\s"'`<>|*?]+?\.(?:png|gif|svg|webp|jpg|jpeg))/gi;
        const addFile = (rawPath: string, meta: { agent: string; sessionId: string; title: string; ts: number }) => {
          try {
            const clean = rawPath.replace(/\\+/g, path.sep).replace(/\/+/g, path.sep);
            const abs = path.isAbsolute(clean) ? path.resolve(clean) : path.resolve(process.cwd(), clean);
            const key = abs.toLowerCase();
            if (seen.has(key)) return;
            const base = path.basename(abs).toLowerCase();
            if (base.startsWith('favicon') || base.startsWith('icon-') || base.includes('node_modules')) return;
            if (!fs.existsSync(abs)) return;
            const st = fs.statSync(abs);
            if (!st.isFile() || st.size <= 0 || st.size > 15 * 1024 * 1024) return;
            seen.add(key);
            items.push({
              path: abs,
              name: path.basename(abs),
              ext: path.extname(abs).slice(1).toLowerCase(),
              mtime: meta.ts || st.mtimeMs,
              size: st.size,
              agent: meta.agent || 'agy',
              sessionId: meta.sessionId || '',
              title: (meta.title || path.basename(abs)).slice(0, 80)
            });
          } catch { /* ignore */ }
        };
        for (const r of rows) {
          const text = String(r.data || '');
          let m: RegExpExecArray | null;
          pathRe.lastIndex = 0;
          while ((m = pathRe.exec(text)) !== null) {
            addFile(m[0], { agent: r.agent, sessionId: r.session_id || '', title: r.prompt || '', ts: Number(r.timestamp) || 0 });
            if (items.length >= 60) break;
          }
          if (items.length >= 60) break;
        }
        // Ayrıca Antigravity brain dizinini ve çalışma dizinindeki görselleri RECURSIVE tara
        const extraDirs = [
          path.join(os.homedir(), '.gemini', 'antigravity', 'brain'),
          path.resolve(process.cwd())
        ];
        const IMG_RE = /\.(png|gif|svg|webp|jpg|jpeg)$/i;
        const walk = (dir: string, depth: number, cwdTop: boolean) => {
          if (depth > (cwdTop ? 1 : 4)) return;
          let entries: fs.Dirent[] = [];
          try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
          for (const ent of entries) {
            const p = path.join(dir, ent.name);
            if (ent.isFile()) {
              if (IMG_RE.test(ent.name)) addFile(p, { agent: 'agy', sessionId: '', title: ent.name, ts: 0 });
            } else if (ent.isDirectory() && !['node_modules', '.git', '.godot', '.venv', '__pycache__'].includes(ent.name)) {
              if (cwdTop && ent.name !== 'scratch') continue; // proje kökünde yalnızca scratch alt klasörüne in (diğerleri zaten tüm ağaçta taranır)
              // Antigravity brain: .system_generated/steps tek başına 34 bin dizin tutar ve neredeyse hiç görsel içermez
              if (path.basename(dir) === '.system_generated' && ['steps', 'messages', 'tasks', 'subagents'].includes(ent.name)) continue;
              walk(p, depth + 1, cwdTop);
            }
          }
        };
        for (const d of extraDirs) {
          if (!fs.existsSync(d)) continue;
          walk(d, 0, d === extraDirs[1]);
        }
        // Claude Code'un satır içi çizdiği SVG/HTML parçacıkları (oturum JSONL'larından)
        try {
          const perSession = new Map<string, number>();
          for (const w of scanWidgets(path.join(opts.home || os.homedir(), '.claude')).sort((a, b) => a.ts - b.ts)) {
            const seq = perSession.get(w.sessionId) || 0; perSession.set(w.sessionId, seq + 1);
            items.push({ path: '', widgetId: w.id, kind: 'widget', seq, name: w.title + '.' + w.kind, ext: w.kind, mtime: w.ts, size: w.size, agent: 'claude', sessionId: w.sessionId, title: w.title });
          }
        } catch { /* widget taraması kitaplığı bozmaz */ }
        items.sort((a, b) => b.mtime - a.mtime);
        libraryCache = { at: Date.now(), items: items.slice(0, 60) };
        json(200, libraryCache.items);
        return true;
      }

      if (method === 'GET' && url.pathname === '/api/library/widget') {
        const wid = url.searchParams.get('id') || '';
        const w = /^[\w.:\-]{1,200}$/.test(wid) ? scanWidgets(path.join(opts.home || os.homedir(), '.claude')).find((x) => x.id === wid) : undefined;
        if (!w) { res.writeHead(404); res.end(); return true; }
        if (w.kind === 'svg') {
          res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:" });
          res.end(renderWidgetSvg(w.code));
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'" });
          res.end(w.code);
        }
        return true;
      }

      if (method === 'GET' && url.pathname === '/api/library/file') {
        const raw = url.searchParams.get('path') || '';
        if (!raw) { res.writeHead(400); res.end(); return true; }
        let abs = '';
        try { abs = fs.realpathSync(path.resolve(raw)); } catch { res.writeHead(404); res.end(); return true; }
        const ext = path.extname(abs).toLowerCase();
        if (!['.png', '.gif', '.svg', '.webp', '.jpg', '.jpeg'].includes(ext)) { res.writeHead(403); res.end(); return true; }
        const brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
        const tempDir = path.resolve(os.tmpdir());
        const safe = allowedDir(abs) || insideRoots(abs, [brainDir, tempDir, path.resolve(process.cwd()), ...roots]);
        if (!safe || !fs.existsSync(abs)) { res.writeHead(404); res.end(); return true; }
        if (ext === '.svg') {
          let svgText = fs.readFileSync(abs, 'utf8');
          svgText = svgText.replace(/@import\s+url\([^)]+\);?/gi, '');
          res.writeHead(200, {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'public, max-age=300',
            'X-Content-Type-Options': 'nosniff'
          });
          res.end(svgText);
          return true;
        }
        const buf = fs.readFileSync(abs);
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff'
        });
        res.end(buf);
        return true;
      }

      // her CLI'nin skill / ajan / komut / MCP / eklenti adları (yalnızca ad ve kısa açıklama; gizli değer okunmaz)
            if (method === 'GET' && url.pathname === '/api/taste') {
        json(200, {
          rules: globalTasteStore.getRules(),
          categories: globalTasteStore.getCategories()
        });
        return true;
      }

      if (method === 'GET' && url.pathname === '/api/capabilities') {
        const q = url.searchParams.get('cwd') || '';
        json(200, readCapabilities(opts.home || os.homedir(), q && fs.existsSync(q) && allowedDir(q) ? path.resolve(q) : undefined));
        return true;
      }

      // TUI / terminal oturumları: veritabanındaki tüm oturumlar (web'den başlatılanlar da dahil; arayüz kendi sohbetlerini ayıklar)
      if (method === 'GET' && url.pathname === '/api/sessions') {
        const rows = db.prepare('SELECT task_id, session_id, agent, model, status, prompt, start_time, end_time FROM tasks WHERE session_id IS NOT NULL AND parent_task_id IS NULL ORDER BY start_time DESC LIMIT 800').all() as any[];
        // alt ajan, ebeveyninin oturumunda sayılır (başka ajanın kendi oturumu olsa bile; ör. Claude'un başlattığı Codex)
        const subRows = db.prepare('SELECT p.session_id, c.status, c.start_time FROM tasks c JOIN tasks p ON p.task_id = c.parent_task_id WHERE c.parent_task_id IS NOT NULL AND p.session_id IS NOT NULL').all() as any[];
        json(200, groupSessions(rows, Date.now(), subRows).slice(0, 60));
        return true;
      }
      if (method === 'GET' && url.pathname === '/api/session') {
        const id = url.searchParams.get('id') || '';
        const tasks = db.prepare('SELECT task_id, agent, model, status, prompt, start_time, end_time, error FROM tasks WHERE session_id = ? AND parent_task_id IS NULL ORDER BY start_time ASC, rowid ASC').all(id) as any[];
        if (!tasks.length) { json(404, { code: 'no_session', error: 'oturum yok' }); return true; }
        const rawEvents = db.prepare('SELECT task_id, type, data, timestamp FROM events WHERE session_id = ? AND parent_task_id IS NULL ORDER BY rowid ASC').all(id) as any[];
        // alt ajanlar ana akıştan ayrı döner (ana akış süzmesi aynı kalır)
        const subTasks = db.prepare('SELECT task_id, parent_task_id, agent, model, status, prompt, start_time, end_time FROM tasks WHERE parent_task_id IS NOT NULL AND (session_id = ? OR parent_task_id IN (SELECT task_id FROM tasks WHERE session_id = ?)) ORDER BY start_time ASC, rowid ASC').all(id, id) as any[];
        const subRaw = subTasks.length ? db.prepare(`SELECT task_id, type, data, timestamp FROM events WHERE task_id IN (${subTasks.map(() => '?').join(',')}) ORDER BY rowid ASC`).all(...subTasks.map((t) => t.task_id)) as any[] : [];
        const tastes = globalTasteStore.getSessionTastes(id);
        json(200, { id, tasks, events: sessionEvents(tasks, rawEvents), subs: subagentsOf(subTasks, subRaw), tastes });
        return true;
      }

      // telefon eşleştirme durumu (yalnızca yerel sayfa; kapı uzak istekleri zaten reddeder)
      if (method === 'GET' && url.pathname === '/api/remote') { await remote.manage(url.pathname, method, {}, json); return true; }

      const safeAccounts = () => pool.listAccounts().map(({ credentialBase64: _secret, ...rest }) => rest);

      if (method === 'GET' && url.pathname === '/api/accounts') {
        json(200, {
          accounts: safeAccounts(),
          active: {
            agy: pool.getActiveAccount('agy')?.name || null,
            claude: pool.getActiveAccount('claude')?.name || null
          }
        });
        return true;
      }

      if (method === 'GET' && url.pathname === '/api/config') {
        const same = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
        const added = folders.filter((f) => fs.existsSync(f)).map((f) => ({ name: path.basename(f), path: f, custom: true }));
        const projects: Array<{ name: string; path: string; custom?: boolean }> = [...added, ...listProjects(roots).filter((p) => !added.some((a) => same(a.path, p.path)))];
        json(200, {
          engines: (await enginesNow()).map((e) => ({ ...e, ...engineStatus(db, e) })),
          teams: TEAMS, roots, projects, defaultCwd: projects[0]?.path || roots[0] || '', maxActive: MAX_ACTIVE,
          accounts: safeAccounts(),
          // uzak (telefon) oturumu: yerel yönetim düğmeleri gizlenir, yazma izni cihaza bağlıdır
          remote: !!remote.deviceOf(req), writeAllowed: remote.deviceOf(req)?.write ?? true
        });
        return true;
      }

      // ---- yazan uçlar: jeton + aynı köken ----
      if (method === 'POST' && ['/api/run', '/api/cancel', '/api/approve', '/api/accounts', '/api/folders', '/api/folders/browse', '/api/folders/remove', '/api/snapshot', '/api/restore', '/api/remote', '/api/pair/new', '/api/devices/write', '/api/devices/remove'].includes(url.pathname)) {
        // hata yanıtları `code` taşır: arayüz bunu seçili dile çevirir; `error` Türkçe yedek metindir
        const fail = (status: number, code: string, error: string, params: Record<string, unknown> = {}) => { json(status, { code, error, params }); return true; };
        const site = req.headers['sec-fetch-site'];
        if (site && site !== 'same-origin') return fail(403, 'bad_origin', 'yalnızca aynı kökenden');
        if (!tokenOk(req.headers['x-observatory-token'])) return fail(403, 'bad_token', 'jeton geçersiz');
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) return fail(415, 'bad_content_type', 'application/json gerekli');
        let b: any;
        try { b = await readJson(req); } catch (e: any) { return fail(e.status || 400, e.status === 413 ? 'too_large' : 'bad_json', e.message); }

        if (url.pathname === '/api/remote' || url.pathname === '/api/pair/new' || url.pathname.startsWith('/api/devices/')) {
          await remote.manage(url.pathname, method, b, json);
          return true;
        }

        if (url.pathname === '/api/accounts') {
          if (remote.deviceOf(req)) return fail(403, 'local_only', 'bu işlem yalnızca bilgisayardaki sayfadan yapılır');
          const agent = b.agent === 'agy' || b.agent === 'claude' ? (b.agent as PooledAgent) : null;
          if (!agent) return fail(400, 'acc_bad_agent', 'geçersiz motor (agy veya claude olmalı)');
          const action = String(b.action || '');
          const name = typeof b.name === 'string' ? b.name.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : '';
          try {
            if (action === 'save') {
              if (!name) return fail(400, 'acc_name_needed', 'hesap adı gerekli');
              const label = typeof b.label === 'string' && b.label.trim() ? b.label.trim().slice(0, 60) : undefined;
              const { credentialBase64: _s, ...entry } = pool.saveAccount(agent, name, label);
              json(200, { ok: true, entry, accounts: safeAccounts() });
              return true;
            }
            if (action === 'switch') {
              if (!name) return fail(400, 'acc_name_needed', 'hesap adı gerekli');
              const { credentialBase64: _s, ...entry } = pool.switchAccount(agent, name);
              json(200, { ok: true, entry, accounts: safeAccounts() });
              return true;
            }
            if (action === 'clear') {
              if (!name) return fail(400, 'acc_name_needed', 'hesap adı gerekli');
              const ok = pool.clearCooldown(agent, name);
              json(200, { ok, accounts: safeAccounts() });
              return true;
            }
            if (action === 'remove') {
              if (!name) return fail(400, 'acc_name_needed', 'hesap adı gerekli');
              const ok = pool.removeAccount(agent, name);
              json(200, { ok, accounts: safeAccounts() });
              return true;
            }
            if (action === 'login') {
              const bin = resolveBinary(agent);
              const env: Record<string, string> = { ...(process.env as Record<string, string>) };
              if (agent === 'claude' && name) {
                const entry = pool.saveAccount('claude', name, typeof b.label === 'string' && b.label.trim() ? b.label.trim().slice(0, 60) : undefined);
                if (entry.configDir) env.CLAUDE_CONFIG_DIR = entry.configDir;
              }
              if (process.platform === 'win32' && process.env.NODE_ENV !== 'test') {
                const title = agent === 'agy' ? 'Antigravity (agy) Hesap Girisi' : `Claude Code Hesap Girisi (${name || 'varsayilan'})`;
                const hint = agent === 'agy'
                  ? '1) Acilan agy ekraninda /logout ve ardindan /login yazip diger Google Pro hesabinizla giris yapin. 2) Giris bitince Web arayuzunde Hesap Adi yazip [Mevcut Oturumu Kaydet] dugmesine basin.'
                  : `1) Acilan claude ekraninda /login yazip hesabinizla giris yapin (${name || 'claude'}).`;
                const child = spawn('cmd.exe', ['/c', 'start', title, 'cmd.exe', '/k', `echo ${hint} & echo. & "${bin}"`], {
                  env,
                  stdio: 'ignore',
                  windowsHide: false,
                  detached: true
                });
                child.unref();
              }
              json(200, { ok: true, accounts: safeAccounts() });
              return true;
            }
            return fail(400, 'acc_bad_action', 'geçersiz hesap işlemi');
          } catch (err: any) {
            return fail(400, 'acc_failed', err?.message || 'hesap işlemi başarısız');
          }
        }

        if (url.pathname === '/api/folders/browse') {
          const chosen = await openNativeFolderPicker();
          if (!chosen) {
            json(200, { canceled: true });
            return true;
          }
          const dir = path.resolve(chosen);
          const same = (a: string, c: string) => path.resolve(a).toLowerCase() === path.resolve(c).toLowerCase();
          if (tooBroad(dir)) return fail(400, 'folder_too_broad', 'çok geniş klasör: sürücü kökü ya da kullanıcı klasörü eklenemez');
          if (!folders.some((f) => same(f, dir))) { folders.unshift(dir); saveFolders(); }
          json(200, { ok: true, path: dir, name: path.basename(dir) });
          return true;
        }

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

        if (url.pathname === '/api/snapshot' || url.pathname === '/api/restore') {
          const dir = typeof b.cwd === 'string' ? b.cwd : '';
          if (!dir || !fs.existsSync(dir) || !allowedDir(dir)) return fail(400, 'cwd_forbidden', 'çalışma klasörü izinli köklerin dışında');
          if (url.pathname === '/api/snapshot') { json(200, { snap: await snapshotTree(path.resolve(dir)) }); return true; }
          if (typeof b.snap !== 'string' || !/^[0-9a-f]{40,64}$/.test(b.snap)) return fail(400, 'bad_snap', 'anlık görüntü kimliği geçersiz');
          if (active.size) return fail(409, 'busy', 'görev çalışırken dosyalar geri alınamaz');
          try { json(200, await restoreTree(path.resolve(dir), b.snap)); }
          catch (e: any) { return fail(e.message === 'snap_missing' ? 410 : 400, ['snap_missing', 'not_git', 'bad_snap'].includes(e.message) ? e.message : 'restore_failed', 'geri alma başarısız'); }
          return true;
        }

        if (url.pathname === '/api/cancel') {
          if (typeof b.taskId !== 'string' || !active.has(b.taskId)) return fail(404, 'no_active_task', 'etkin görev yok');
          const runner = await getRunner();
          runner.cancelTask?.(b.taskId, 'Kullanıcı arayüzden iptal etti');
          json(200, { ok: true });
          return true;
        }

        if (url.pathname === '/api/approve') {
          if (typeof b.taskId !== 'string' || !active.has(b.taskId)) return fail(404, 'no_active_task', 'etkin görev yok');
          if (typeof b.approved !== 'boolean') return fail(400, 'bad_approval', 'onay durumu (true/false) gerekli');
          const runner = await getRunner();
          const ok = runner.approveTask?.(b.taskId, b.approved);
          if (!ok) return fail(400, 'approval_failed', 'onay iletilemedi');
          json(200, { ok: true, taskId: b.taskId, approved: b.approved });
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
        const dev = remote.deviceOf(req);
        if (dev && write && !dev.write) return fail(403, 'remote_write_forbidden', 'bu cihazdan yazma izni kapalı');
        if (write && !engine.write) return fail(400, 'no_write', `${engine.label} yazma kipini desteklemiyor`, { engine: engine.label });
        const cwd = typeof b.cwd === 'string' && b.cwd ? b.cwd : (folders[0] || roots[0] || scratchDir);
        // izin ÖNCE: izinli köklerin dışında klasör oluşturulmaz (eskiden mkdir izin kontrolünden önce çalışıyordu)
        if (!allowedDir(cwd)) return fail(400, 'cwd_forbidden', 'çalışma klasörü izinli köklerin dışında');
        if (!fs.existsSync(cwd)) {
          try { fs.mkdirSync(cwd, { recursive: true }); }
          catch (e: any) { return fail(400, 'folder_missing', `klasör oluşturulamadı: ${e.message}`); }
        }
        if (!cwd || !fs.existsSync(cwd) || !allowedDir(cwd)) return fail(400, 'cwd_forbidden', 'çalışma klasörü izinli köklerin dışında');
        if (active.size >= MAX_ACTIVE) return fail(429, 'too_many', `en çok ${MAX_ACTIVE} eşzamanlı görev`, { max: MAX_ACTIVE });
        const st = engineStatus(db, engine);
        if (!st.installed) return fail(409, 'not_installed', `${engine.label} kurulu değil`, { engine: engine.label });
        if (st.limitedUntil) return fail(409, 'limited', `${engine.label} kotası dolu`, { engine: engine.label, limitedUntil: st.limitedUntil });

        // agy modeli çabaya göre seçilir (gemini-3.8-flash-low | -high); diğerlerinde model kimliği olduğu gibi
        const agyEffort = model.id === 'gemini-4-argon' ? (effort === 'low' || effort === 'high' ? effort : 'medium') : (effort === 'low' ? 'low' : 'high');
        const modelId = engine.id === 'agy' ? `${model.id}-${agyEffort}` : model.id;
        const runner = await getRunner();
        const { taskId, promise } = runner.startTask({
          agent: engine.id, prompt: b.prompt, cwd: path.resolve(cwd), model: modelId,
          effort: engine.id === 'claude' || engine.id === 'codex' ? effort : undefined,
          sandbox: write ? 'workspace-write' : 'read-only',
          sessionId: typeof b.sessionId === 'string' && b.sessionId ? b.sessionId : undefined,
          account: typeof b.account === 'string' && b.account.trim() ? b.account.trim() : undefined,
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
  // programın ad vermediği oturumlara Gemini ile başlık üretilir (yalnızca bu komutla açılan sunucuda; testler ağa çıkmaz)
  const { enableTitleGeneration, TITLE_MODEL } = await import('../core/title_generator.ts');
  if (enableTitleGeneration()) console.log(`Oturum başlıkları: adı olmayan oturumlar ${TITLE_MODEL} ile adlandırılır (kapatmak için OBS_TITLE_GEN=0).`);
  const roots = flagRoots.length ? flagRoots : defaultRoots(readConfig(CONFIG_PATH));
  console.log(`Klasör kökleri: ${roots.join('; ') || '(yok)'}. Arayüzden "Klasör ekle" ile başka klasör ekleyebilirsin (ayar: ${CONFIG_PATH}). Varsayılan kip salt okunur.`);
}
