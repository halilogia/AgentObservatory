// observatory ingest [--follow] [--sources claude,codex,opencode] [--active-minutes 30] [--backfill]
// Observatory dışında (terminalde elle) başlatılan Claude Code, Codex ve OpenCode oturumlarını, ajanların kendi
// kayıt dosyalarını OKUYARAK (salt okunur) olay deposuna ekler. Kimlik bilgisi dosyalarına dokunmaz.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { globalSqlite, SqliteStore } from '../core/sqlite_store.ts';
import { toTaskEvent } from './core.ts';
import type { ExtEvent, LineParser, ManagedCheck } from './core.ts';
import { ClaudeLineParser, ClaudeSubagentParser } from './claude.ts';
import { CodexLineParser } from './codex.ts';
import { OpenCodeDbSource } from './opencode.ts';

type Src = 'claude' | 'codex' | 'opencode';

function walkJsonl(dir: string, out: string[], depth = 0): void {
  if (depth > 5 || !fs.existsSync(dir)) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJsonl(p, out, depth + 1);
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
}

/** Observatory'nin kendi başlattığı görevle aynı istem + yakın zaman: çift kayıt olmasın. */
export function makeManagedCheck(dbPath?: string): ManagedCheck {
  const p = dbPath || process.env.OBSERVATORY_DB || path.join(os.homedir(), '.observatory', 'observatory.sqlite');
  let db: DatabaseSync | null = null;
  return (agent, prompt, ts) => {
    try {
      db = db || new DatabaseSync(p, { readOnly: true });
      const row = db.prepare(
        "SELECT 1 FROM tasks WHERE agent = ? AND prompt = ? AND ABS(start_time - ?) < 180000 AND task_id NOT LIKE 'ext\\_%' ESCAPE '\\' LIMIT 1"
      ).get(agent, prompt, ts);
      return !!row;
    } catch { return false; }
  };
}

/** subagents/agent-<id>.jsonl için ayrıştırıcı; ebeveyn bilinmiyorsa null. */
function openSubagent(file: string, toolTurns: Map<string, string>): LineParser | null {
  const base = path.basename(file, '.jsonl');
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(path.dirname(file), base + '.meta.json'), 'utf8'));
    const parent = toolTurns.get(String(meta.toolUseId || ''));
    return parent ? new ClaudeSubagentParser(base.replace(/^agent-/, ''), parent) : null;
  } catch { return null; }
}

interface FileState { offset: number; buf: string; parser: LineParser; src: Src }

export interface IngestOptions {
  sources: Src[];
  activeMinutes: number;
  backfill: boolean;
  follow: boolean;
  store?: SqliteStore;
  claudeDir?: string;
  codexDir?: string;
  isManaged?: ManagedCheck;
  log?: (s: string) => void;
}

export function startIngest(opts: IngestOptions): { tick: () => number; stop: () => void } {
  const store = opts.store || globalSqlite;
  const isManaged = opts.isManaged || makeManagedCheck();
  const log = opts.log || (() => undefined);
  const roots: Array<[Src, string]> = [];
  if (opts.sources.includes('claude')) roots.push(['claude', opts.claudeDir || path.join(os.homedir(), '.claude', 'projects')]);
  if (opts.sources.includes('codex')) roots.push(['codex', opts.codexDir || path.join(os.homedir(), '.codex', 'sessions')]);
  const files = new Map<string, FileState>();
  const toolTurns = new Map<string, string>(); // Task/Agent araç çağrısı kimliği -> ana görev kimliği
  const startedAt = Date.now();
  let oc: OpenCodeDbSource | null = null;
  if (opts.sources.includes('opencode')) {
    try { oc = new OpenCodeDbSource(isManaged, opts.backfill ? Date.now() - opts.activeMinutes * 60000 : Date.now()); } catch (e: any) { log(`OpenCode atlandı: ${e.message}`); }
  }
  let count = 0;
  const write = (evs: ExtEvent[]) => {
    for (const e of evs) { try { store.recordEvent(toTaskEvent(e)); count++; } catch (err: any) { log(`yazılamadı: ${err.message}`); } }
  };

  let pendingSubs = false;
  const discover = () => {
    pendingSubs = false;
    const cutoff = Date.now() - opts.activeMinutes * 60000;
    for (const [src, root] of roots) {
      const found: string[] = [];
      walkJsonl(root, found);
      for (const f of found) {
        if (files.has(f)) continue;
        let st: fs.Stats;
        try { st = fs.statSync(f); } catch { continue; }
        if (st.mtimeMs < cutoff) continue;
        let parser: LineParser;
        if (src === 'claude' && path.basename(path.dirname(f)) === 'subagents') {
          // alt ajan dosyası: ebeveyn görev, meta dosyasındaki toolUseId ile bulunur; ana kayıt henüz okunmadıysa sonra yeniden denenir
          const sub = openSubagent(f, toolTurns);
          if (!sub) { pendingSubs = true; continue; }
          parser = sub;
        } else parser = src === 'claude' ? new ClaudeLineParser(isManaged, toolTurns) : new CodexLineParser(isManaged);
        // ingest başladıktan sonra oluşan dosya baştan okunur; eski dosyada yalnızca yeni eklenenler
        files.set(f, { offset: opts.backfill || st.birthtimeMs >= startedAt ? 0 : st.size, buf: '', parser, src });
        log(`izleniyor (${src}): ${path.basename(f)}`);
      }
    }
  };

  const readNew = () => {
    for (const [f, s] of files) {
      let size: number;
      try { size = fs.statSync(f).size; } catch { continue; }
      if (size < s.offset) { s.offset = 0; s.buf = ''; }
      if (size === s.offset) continue;
      const fd = fs.openSync(f, 'r');
      try {
        const len = Math.min(size - s.offset, 8 * 1024 * 1024);
        const chunk = Buffer.alloc(len);
        fs.readSync(fd, chunk, 0, len, s.offset);
        // satırın dosyadaki mutlak bayt konumu = olay kimliği tohumu (yeniden okumada aynı kimlik, çift kayıt yok)
        let lineStart = s.offset - Buffer.byteLength(s.buf);
        s.offset += len;
        const text = s.buf + chunk.toString('utf8');
        const lines = text.split('\n');
        s.buf = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) write(s.parser.push(line, `${path.basename(f)}:${lineStart}`));
          lineStart += Buffer.byteLength(line) + 1;
        }
      } finally { fs.closeSync(fd); }
    }
  };

  let n = 0;
  const tick = () => {
    const before = count;
    if (n++ % 5 === 0 || pendingSubs) discover();
    readNew();
    if (oc) { try { write(oc.poll()); } catch (e: any) { log(`OpenCode okunamadı: ${e.message}`); } }
    return count - before;
  };
  const timer = opts.follow ? setInterval(tick, 1000) : null;
  return { tick, stop: () => { if (timer) clearInterval(timer); oc?.close(); } };
}

export async function runIngest(args: string[]): Promise<void> {
  const val = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const sources = (val('--sources') || 'claude,codex,opencode').split(',').filter((s) => ['claude', 'codex', 'opencode'].includes(s)) as Src[];
  const activeMinutes = Number(val('--active-minutes')) || 30;
  const follow = args.includes('--follow');
  const backfill = args.includes('--backfill');
  const h = startIngest({ sources, activeMinutes, backfill, follow, log: (s) => console.log(s) });
  const n = h.tick();
  if (!follow) { console.log(`${n} olay eklendi (backfill=${backfill}, son ${activeMinutes} dk içinde değişen oturumlar).`); h.stop(); return; }
  console.log(`Dış oturumlar izleniyor (${sources.join(', ')}); Ctrl+C ile çık. Yeni görevler 'observatory chat --follow' ile görünür.`);
}

const INGEST_LOCK = path.join(os.tmpdir(), 'agent_observatory_ingest.lock');

/**
 * MCP sunucusu açıkken elle başlatılan oturumları arka planda izler (OBSERVATORY_NO_INGEST=1 ile kapanır).
 * Birden çok sunucu işlemi çalışsa da yalnızca biri okur: kilit dosyası her saniye yenilenir, 6 sn eskirse devralınır.
 * stdout kullanılmaz (MCP protokolü stdout'tadır).
 */
export function startBackgroundIngest(): (() => void) | null {
  if (process.env.OBSERVATORY_NO_INGEST === '1' || process.env.NODE_ENV === 'test') return null;
  const handle = startIngest({ sources: ['claude', 'codex', 'opencode'], activeMinutes: 30, backfill: false, follow: false });
  const timer = setInterval(() => {
    try {
      const fresh = Date.now() - fs.statSync(INGEST_LOCK).mtimeMs < 6000;
      if (fresh && Number(fs.readFileSync(INGEST_LOCK, 'utf8')) !== process.pid) return; // başka işlem okuyor
    } catch { /* kilit yok: devral */ }
    try { fs.writeFileSync(INGEST_LOCK, String(process.pid)); } catch { return; }
    try { handle.tick(); } catch { /* izleme asla MCP'yi düşürmez */ }
  }, 1000);
  timer.unref();
  return () => {
    clearInterval(timer);
    handle.stop();
    try { if (Number(fs.readFileSync(INGEST_LOCK, 'utf8')) === process.pid) fs.unlinkSync(INGEST_LOCK); } catch { /* yok */ }
  };
}
