// Telefondan erişim: CLI'lar bilgisayarda çalışır, telefon yalnızca ekran ve klavyedir.
// Sunucu yine yalnızca 127.0.0.1'de dinler; Tailscale (`tailscale serve`) HTTPS adresini telefona aktarır.
// Güvenlik katmanları: (1) kapalı varsayılan, (2) yalnızca açıkça izin verilen Host, (3) tek kullanımlık eşleştirme kodu
// (5 dk, 5 yanlışta kilit), (4) cihaz başına rastgele çerez (yalnızca özeti saklanır; HttpOnly, Secure, SameSite=Strict),
// (5) uzak cihaz yalnızca sohbet eder: klasör ekleme, dosya geri alma, eşleştirme yönetimi YEREL sayfaya özeldir,
// (6) telefondan "Yazabilir" kipi cihaz başına ve varsayılan kapalı, (7) Tailscale hesabı ilk eşleşmede kilitlenir.
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { ExtraCtx } from './serve.ts';

export interface Device { id: string; name: string; hash: string; created: number; write: boolean; lastSeen?: number }
interface RemoteCfg { enabled: boolean; host?: string; login?: string; devices: Device[] }
export interface TsInfo { installed: boolean; state: string; dnsName?: string; online?: boolean }

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL_MS = 5 * 60000;
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60000;
const COOKIE = 'obs_dev';
const COOKIE_MAX_AGE = 180 * 24 * 3600;
/** uzak (telefon) cihazın ASLA çağıramayacağı yollar: yalnızca yerel sayfa */
const LOCAL_ONLY = [/^\/api\/pair\/new$/, /^\/api\/remote/, /^\/api\/devices/, /^\/api\/folders/, /^\/api\/snapshot$/, /^\/api\/restore$/];

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const normCode = (c: unknown) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function detectTailscale(): Promise<TsInfo> {
  return new Promise((resolve) => {
    execFile('tailscale', ['status', '--json'], { timeout: 4000, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      if (err && !out) return resolve({ installed: !(err as any).code || (err as any).code !== 'ENOENT', state: (err as any).code === 'ENOENT' ? 'missing' : 'error' });
      try {
        const j = JSON.parse(out);
        const dns = typeof j?.Self?.DNSName === 'string' ? j.Self.DNSName.replace(/\.$/, '').toLowerCase() : undefined;
        resolve({ installed: true, state: String(j?.BackendState || 'unknown'), dnsName: dns, online: !!j?.Self?.Online });
      } catch { resolve({ installed: true, state: 'error' }); }
    });
  });
}

export class Remote {
  private cfgPath: string;
  private port: number;
  private detect: () => Promise<TsInfo>;
  private ts: TsInfo = { installed: false, state: 'unknown' };
  private tsAt = 0;
  private code: { value: string; exp: number } | null = null;
  private fails: number[] = [];
  private lockedUntil = 0;
  private seen = new WeakMap<http.IncomingMessage, Device>();
  private cfg: RemoteCfg;

  constructor(cfgPath: string, port: number, detect: () => Promise<TsInfo> = detectTailscale) {
    this.cfgPath = cfgPath; this.port = port; this.detect = detect;
    this.cfg = this.load();
  }

  // ---- ayar dosyası (web.json içindeki `remote` anahtarı; diğer anahtarlara dokunulmaz) ----
  private raw(): Record<string, any> { try { return JSON.parse(fs.readFileSync(this.cfgPath, 'utf8')) || {}; } catch { return {}; } }
  private load(): RemoteCfg {
    const r = this.raw().remote || {};
    const devices: Device[] = Array.isArray(r.devices) ? r.devices.filter((d: any) => d && typeof d.id === 'string' && typeof d.hash === 'string').map((d: any) => ({ id: d.id, name: String(d.name || 'Telefon').slice(0, 40), hash: d.hash, created: Number(d.created) || 0, write: d.write === true, lastSeen: d.lastSeen })) : [];
    return { enabled: r.enabled === true, host: typeof r.host === 'string' ? r.host.toLowerCase() : undefined, login: typeof r.login === 'string' ? r.login : undefined, devices };
  }
  private save(): void {
    fs.mkdirSync(path.dirname(this.cfgPath), { recursive: true });
    fs.writeFileSync(this.cfgPath, JSON.stringify({ ...this.raw(), remote: this.cfg }, null, 2), 'utf8');
  }

  async refreshTs(force = false): Promise<TsInfo> {
    if (force || Date.now() - this.tsAt > 10000) { this.ts = await this.detect(); this.tsAt = Date.now(); }
    return this.ts;
  }
  /** kabul edilen uzak Host adları (kapalıysa boş). Tailscale adı bilinmiyorsa elle verilen `host`. */
  hosts = (): string[] => {
    if (!this.cfg.enabled) return [];
    const h = this.cfg.host || this.ts.dnsName;
    return h ? [h.toLowerCase()] : [];
  };
  origins = (): string[] => this.hosts().map((h) => `https://${h}`);
  get enabled(): boolean { return this.cfg.enabled; }
  deviceOf(req: http.IncomingMessage): Device | undefined { return this.seen.get(req); }

  async setEnabled(enabled: boolean, host?: string): Promise<void> {
    this.cfg.enabled = enabled;
    if (typeof host === 'string' && /^[a-z0-9.-]+$/i.test(host.trim())) this.cfg.host = host.trim().toLowerCase();
    this.save();
    if (enabled) await this.refreshTs(true);
  }

  newCode(): { code: string; exp: number } {
    let v = ''; for (let i = 0; i < 8; i++) v += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    this.code = { value: v, exp: Date.now() + CODE_TTL_MS }; this.fails = []; this.lockedUntil = 0;
    return { code: `${v.slice(0, 4)}-${v.slice(4)}`, exp: this.code.exp };
  }

  /** eşleştirme: doğruysa cihaz çerezi değeri döner; 'locked' | 'bad' | 'expired' */
  pair(codeIn: unknown, nameIn: unknown, login?: string): { ok: true; cookie: string; device: Device } | { ok: false; reason: 'locked' | 'bad' | 'expired' } {
    const now = Date.now();
    if (now < this.lockedUntil) return { ok: false, reason: 'locked' };
    if (!this.code || now > this.code.exp) { this.code = null; return { ok: false, reason: 'expired' }; }
    if (!eq(normCode(codeIn), this.code.value)) {
      this.fails = this.fails.filter((t) => now - t < LOCK_MS); this.fails.push(now);
      if (this.fails.length >= MAX_FAILS) { this.lockedUntil = now + LOCK_MS; this.code = null; this.fails = []; return { ok: false, reason: 'locked' }; }
      return { ok: false, reason: 'bad' };
    }
    this.code = null; this.fails = [];
    const secret = crypto.randomBytes(32).toString('hex'), id = crypto.randomBytes(6).toString('hex');
    const device: Device = { id, name: String(nameIn || 'Telefon').replace(/[^\p{L}\p{N} ._()-]/gu, '').trim().slice(0, 40) || 'Telefon', hash: sha(secret), created: now, write: false, lastSeen: now };
    this.cfg.devices.push(device);
    if (login && !this.cfg.login) this.cfg.login = login; // Tailscale hesabı ilk eşleşmede kilitlenir
    this.save();
    return { ok: true, cookie: `${id}.${secret}`, device };
  }

  authenticate(req: http.IncomingMessage): Device | undefined {
    const raw = String(req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(COOKIE + '='));
    if (!raw) return undefined;
    const [id, secret] = decodeURIComponent(raw.slice(COOKIE.length + 1)).split('.');
    if (!id || !secret) return undefined;
    const d = this.cfg.devices.find((x) => x.id === id);
    if (!d || !eq(d.hash, sha(secret))) return undefined;
    d.lastSeen = Date.now(); this.seen.set(req, d);
    return d;
  }

  setWrite(id: string, write: boolean): boolean { const d = this.cfg.devices.find((x) => x.id === id); if (!d) return false; d.write = write; this.save(); return true; }
  removeDevice(id: string): boolean { const n = this.cfg.devices.length; this.cfg.devices = this.cfg.devices.filter((x) => x.id !== id); if (this.cfg.devices.length === n) return false; this.save(); return true; }

  async status(): Promise<Record<string, unknown>> {
    const ts = await this.refreshTs();
    const host = this.cfg.host || ts.dnsName;
    return {
      enabled: this.cfg.enabled, host: host || null, login: this.cfg.login || null,
      tailscale: ts, serveCommand: `tailscale serve --bg ${this.port}`,
      url: host ? `https://${host}/pair` : null,
      pairExpires: this.code && Date.now() < this.code.exp ? this.code.exp : null,
      devices: this.cfg.devices.map((d) => ({ id: d.id, name: d.name, created: d.created, lastSeen: d.lastSeen || null, write: d.write }))
    };
  }

  /**
   * Kapı: serve.ts'te Host/Origin denetiminden sonra her istekte çalışır. true = yanıt verildi.
   * Yerel istekler (127.0.0.1) çerez istemez. Uzak istekler eşleştirilmiş cihaz çerezi taşımalıdır.
   */
  gate = async (ctx: ExtraCtx & { remote: boolean }, pairPage: () => string, pairScript: () => string): Promise<boolean> => {
    if (!ctx.remote) return false;
    const { req, res, url, json } = ctx; const p = url.pathname, method = req.method || 'GET';
    const login = String(req.headers['tailscale-user-login'] || '');
    if (this.cfg.login && login !== this.cfg.login) { json(403, { code: 'wrong_account' }); return true; }

    const csp = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
    if (method === 'GET' && (p === '/pair' || p === '/pair.js' || p === '/app.css')) {
      if (p === '/app.css') return false; // statik yol (gizli veri içermez)
      res.writeHead(200, { 'Content-Type': p === '/pair' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': csp });
      res.end(p === '/pair' ? pairPage() : pairScript());
      return true;
    }
    if (method === 'POST' && p === '/api/pair') {
      const site = req.headers['sec-fetch-site'];
      if (site && site !== 'same-origin') { json(403, { code: 'bad_origin' }); return true; }
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) { json(415, { code: 'bad_content_type' }); return true; }
      let body: any = {};
      try { const chunks: Buffer[] = []; let n = 0; for await (const c of req) { n += (c as Buffer).length; if (n > 4096) throw new Error('big'); chunks.push(c as Buffer); } body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { json(400, { code: 'bad_json' }); return true; }
      const r = this.pair(body.code, body.name, login || undefined);
      if (!r.ok) { json(r.reason === 'locked' ? 429 : 403, { code: 'pair_' + r.reason }); return true; }
      res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(r.cookie)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}`);
      json(200, { ok: true });
      return true;
    }
    const dev = this.authenticate(req);
    if (!dev) {
      if (p.startsWith('/api/') || p === '/stream' || p === '/events' || p === '/tasks' || p.startsWith('/tasks/')) json(401, { code: 'not_paired' });
      else { res.writeHead(302, { Location: '/pair', 'Cache-Control': 'no-store' }); res.end(); }
      return true;
    }
    if (LOCAL_ONLY.some((re) => re.test(p))) { json(403, { code: 'local_only' }); return true; }
    return false;
  };

  /** yerel sayfanın yönetim uçları (kapı yerel istekleri geçirir; burada jeton web.ts'te denetlenir) */
  async manage(pathname: string, method: string, body: any, json: (c: number, b: unknown) => void): Promise<boolean> {
    if (method === 'GET' && pathname === '/api/remote') { json(200, await this.status()); return true; }
    if (method !== 'POST') return false;
    if (pathname === '/api/remote') { await this.setEnabled(body.enabled === true, body.host); json(200, await this.status()); return true; }
    if (pathname === '/api/pair/new') {
      await this.refreshTs();
      if (!this.cfg.enabled) { json(409, { code: 'remote_off' }); return true; }
      if (!this.cfg.host && !this.ts.dnsName) { json(409, { code: 'no_host' }); return true; }
      json(200, { ...this.newCode(), url: `https://${this.cfg.host || this.ts.dnsName}/pair` });
      return true;
    }
    if (pathname === '/api/devices/write') { json(this.setWrite(String(body.id), body.write === true) ? 200 : 404, { ok: true }); return true; }
    if (pathname === '/api/devices/remove') { json(this.removeDevice(String(body.id)) ? 200 : 404, { ok: true }); return true; }
    return false;
  }
}
