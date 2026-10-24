// Oturum dökümü: olay akışını, oturumun geldiği CLI'ın görünümünde (skin) sohbet olarak çizer.
// Kullanım: observatory chat [taskId|latest] [--follow] [--skin claude|codex|agy|opencode] [--plain]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildSkin, describeTool, makePaint, skinIdForAgent } from './skins.ts';
import type { Skin, SkinId } from './skins.ts';

export interface RenderEvent {
  taskId: string;
  agent: string;
  type: string;
  data: any;
  timestamp: number;
}

const RESULT_LINES = 3;
const RESULT_WIDTH = 140;

function resultLines(out: unknown): { lines: string[]; more: number } {
  const text = typeof out === 'string' ? out : out === undefined || out === null ? '' : JSON.stringify(out);
  const all = text.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
  const lines = all.slice(0, RESULT_LINES).map((l) => (l.length > RESULT_WIDTH ? l.slice(0, RESULT_WIDTH - 1) + '…' : l));
  return { lines, more: Math.max(0, all.length - lines.length) };
}

const PROMPT_LINES = 10;
function clipPrompt(p: string): string {
  const all = p.replace(/\s+$/, '').split('\n');
  if (all.length <= PROMPT_LINES) return all.join('\n');
  return all.slice(0, PROMPT_LINES).join('\n') + `\n… +${all.length - PROMPT_LINES} satır`;
}

/** Olayları tek tek alır (canlı akış için de aynı sınıf); durumlu çizim yapar. */
export class TranscriptRenderer {
  private readonly out: (s: string) => void;
  private readonly useColor: boolean;
  private readonly forcedSkin?: SkinId;
  private skin: Skin | null = null;
  private taskId = '';
  private inAssistant = false;
  private atLineStart = true;
  private startedAt = 0;
  private headerShown = false;
  private tokensIn = 0;
  private tokensOut = 0;

  constructor(out: (s: string) => void, opts: { color: boolean; skin?: SkinId }) {
    this.out = out;
    this.useColor = opts.color;
    this.forcedSkin = opts.skin;
  }

  private closeAssistant(): void {
    if (this.inAssistant && !this.atLineStart) this.out('\n');
    this.inAssistant = false;
    this.atLineStart = true;
  }

  private line(s: string): void {
    this.closeAssistant();
    this.out(s + '\n');
  }

  private begin(ev: RenderEvent): void {
    this.closeAssistant();
    this.taskId = ev.taskId;
    this.skin = buildSkin(this.forcedSkin ?? skinIdForAgent(ev.agent), makePaint(this.useColor));
    this.startedAt = ev.timestamp;
    this.headerShown = false;
    this.tokensIn = 0;
    this.tokensOut = 0;
  }

  push(ev: RenderEvent): void {
    if (ev.taskId !== this.taskId || !this.skin) this.begin(ev);
    const skin = this.skin!;
    const d = ev.data || {};

    switch (ev.type) {
      case 'task.started': {
        // agy gibi bazı ajanlar ikinci bir task.started (model bilgisiyle) üretir: başlık yalnızca bir kez
        if (this.headerShown) break;
        this.headerShown = true;
        this.out(skin.header({ agent: ev.agent, taskId: ev.taskId, cwd: d.cwd, model: d.model }) + '\n\n');
        if (d.prompt) this.out(skin.user(clipPrompt(String(d.prompt))) + '\n\n');
        break;
      }
      case 'message.delta': {
        const text = String(d.text ?? '');
        if (!text) break;
        if (!this.inAssistant) {
          this.out(skin.assistantOpen);
          this.inAssistant = true;
          this.atLineStart = false;
        }
        const pieces = text.split('\n');
        pieces.forEach((piece, i) => {
          if (i > 0) {
            this.out('\n');
            this.atLineStart = true;
          }
          if (piece) {
            if (this.atLineStart && i > 0) this.out(skin.assistantIndent);
            this.out(piece);
            this.atLineStart = false;
          }
        });
        break;
      }
      case 'tool.invoked': {
        this.line(skin.tool(describeTool(d.name, d.input)));
        break;
      }
      case 'tool.completed': {
        const { lines, more } = resultLines(d.output ?? d.result);
        if (lines.length) this.line(skin.toolResult(lines, more));
        break;
      }
      case 'usage.updated': {
        const u = d.usage || {};
        // adaptörlere göre alan adı değişir: input_tokens (agy, ingest), inputTokens (codex, claude), input (opencode)
        this.tokensIn += Number(u.input_tokens ?? u.inputTokens ?? u.input ?? 0) || 0;
        this.tokensOut += Number(u.output_tokens ?? u.outputTokens ?? u.output ?? 0) || 0;
        break;
      }
      case 'task.completed':
      case 'task.failed':
      case 'task.cancelled': {
        this.closeAssistant();
        const status = ev.type === 'task.completed' ? 'completed' : ev.type === 'task.failed' ? 'failed' : 'cancelled';
        this.out('\n' + skin.footer({
          status, durationMs: ev.timestamp - this.startedAt, tokensIn: this.tokensIn || undefined, tokensOut: this.tokensOut || undefined,
          error: typeof d.error === 'string' ? d.error : d.reason, errorKind: d.errorKind
        }) + '\n\n');
        break;
      }
      default:
        break;
    }
  }

  end(): void {
    this.closeAssistant();
  }
}

// ---------- komut ----------
function openDb(): DatabaseSync {
  const dbPath = process.env.OBSERVATORY_DB || path.join(os.homedir(), '.observatory', 'observatory.sqlite');
  if (!fs.existsSync(dbPath)) throw new Error(`Veritabanı yok: ${dbPath} (önce bir görev çalıştır)`);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA query_only = 1;');
  return db;
}

function toEvent(row: any): RenderEvent & { seq: number } {
  let data: any = {};
  try { data = JSON.parse(row.data); } catch { data = {}; }
  return { seq: Number(row.seq), taskId: row.task_id, agent: row.agent, type: row.type, data, timestamp: Number(row.timestamp) };
}

export async function runChat(args: string[]): Promise<void> {
  const follow = args.includes('--follow');
  const plain = args.includes('--plain') || (!args.includes('--color') && (!process.stdout.isTTY || !!process.env.NO_COLOR));
  const sIdx = args.indexOf('--skin');
  const forced = sIdx >= 0 ? (args[sIdx + 1] as SkinId) : undefined;
  if (forced && !['claude', 'codex', 'agy', 'opencode', 'generic'].includes(forced)) {
    console.error('Geçersiz --skin. Seçenekler: claude, codex, agy, opencode, generic');
    process.exit(1);
  }
  const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--skin');
  const target = positional[0] || 'latest';

  const db = openDb();
  const r = new TranscriptRenderer((s) => process.stdout.write(s), { color: !plain, skin: forced });

  let taskId = target;
  if (target === 'latest') {
    const row = db.prepare('SELECT task_id FROM tasks ORDER BY start_time DESC LIMIT 1').get() as any;
    if (!row) { console.error('Kayıtlı görev yok.'); process.exit(1); }
    taskId = row.task_id;
  }
  const events = db.prepare('SELECT rowid AS seq, * FROM events WHERE task_id = ? ORDER BY rowid').all(taskId) as any[];
  if (!events.length) { console.error(`Görev bulunamadı: ${taskId}`); process.exit(1); }

  // başlık için model: olayda yoksa tasks tablosundaki model
  const taskRow = db.prepare('SELECT model FROM tasks WHERE task_id = ?').get(taskId) as any;
  let lastSeq = 0;
  for (const row of events) {
    const ev = toEvent(row);
    if (ev.type === 'task.started' && !ev.data.model && taskRow && taskRow.model) ev.data.model = taskRow.model;
    r.push(ev);
    lastSeq = ev.seq;
  }
  r.end();
  if (!follow) { db.close(); return; }

  // --follow: bu görevden sonra gelen tüm yeni olaylar (başka görevler dahil) canlı akar
  const since = db.prepare('SELECT rowid AS seq, * FROM events WHERE rowid > ? ORDER BY rowid LIMIT 500');
  const maxRow = db.prepare('SELECT COALESCE(MAX(rowid), 0) AS m FROM events').get() as any;
  lastSeq = Math.max(lastSeq, Number(maxRow.m));
  process.stdout.write(plain ? '(canlı izleniyor, Ctrl+C ile çık)\n' : '\x1b[2m(canlı izleniyor, Ctrl+C ile çık)\x1b[0m\n');
  setInterval(() => {
    for (const row of since.all(lastSeq) as any[]) { const ev = toEvent(row); r.push(ev); lastSeq = ev.seq; }
  }, 300);
}
