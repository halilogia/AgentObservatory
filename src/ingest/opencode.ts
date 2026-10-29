// OpenCode kayıtları: ~/.local/share/opencode/opencode.db (SQLite: session, message, part)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import { parseJson, shortId } from './core.ts';
import type { ExtEvent, ManagedCheck } from './core.ts';

export function defaultOpenCodeDb(): string {
  return process.env.OPENCODE_DB || path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
}

interface SessState { turn: number; open: boolean; skip: boolean; seenUser: Set<string> }

export class OpenCodeDbSource {
  private readonly db: DatabaseSync;
  private lastTime: number;
  private lastRowid = 0;
  private lastVersion = -1;
  private readonly stmtVersion: StatementSync;
  private readonly stmtParts: StatementSync;
  private readonly sessions = new Map<string, SessState>();

  private readonly isManaged: ManagedCheck;

  /** startFrom: bu zamandan (ms) sonra güncellenen parçalar okunur */
  constructor(isManaged: ManagedCheck, startFrom: number, dbPath = defaultOpenCodeDb()) {
    this.isManaged = isManaged;
    if (!fs.existsSync(dbPath)) throw new Error(`OpenCode veritabanı yok: ${dbPath}`);
    this.db = new DatabaseSync(dbPath, { readOnly: true });
    this.db.exec('PRAGMA busy_timeout = 3000;');
    this.lastTime = startFrom;
    this.stmtVersion = this.db.prepare('PRAGMA data_version');
    this.stmtParts = this.db.prepare(
      `SELECT p.rowid AS rid, p.id, p.message_id, p.session_id, p.time_updated, p.data, m.data AS mdata, s.directory
         FROM part p JOIN message m ON m.id = p.message_id JOIN session s ON s.id = p.session_id
        WHERE p.time_updated > ? OR (p.time_updated = ? AND p.rowid > ?)
        ORDER BY p.time_updated, p.rowid LIMIT 500`
    );
  }

  private st(id: string): SessState {
    let s = this.sessions.get(id);
    if (!s) { s = { turn: 0, open: false, skip: false, seenUser: new Set() }; this.sessions.set(id, s); }
    return s;
  }

  poll(): ExtEvent[] {
    // part.time_updated indekssiz (OpenCode'un şeması): sorgu her saniye tam tablo tarar (~40 ms).
    // PRAGMA data_version yalnızca başka bir bağlantı yazınca değişir; değişmediyse tarama atlanır.
    const version = Number((this.stmtVersion.get() as any).data_version);
    if (version === this.lastVersion) return [];
    const rows = this.stmtParts.all(this.lastTime, this.lastTime, this.lastRowid) as any[];
    // 500'lük sayfa doluysa geride okunmamış satır var: sürümü kaydetme, sonraki poll devam etsin
    this.lastVersion = rows.length < 500 ? version : -1;
    const out: ExtEvent[] = [];
    for (const r of rows) {
      this.lastTime = Number(r.time_updated);
      this.lastRowid = Number(r.rid);
      const pd = parseJson(r.data);
      const md = parseJson(r.mdata);
      if (!pd || !md) continue;
      const st = this.st(r.session_id);
      const tid = () => `ext_opencode_${shortId(r.session_id)}_${st.turn}`;
      const mk = (type: ExtEvent['type'], data: Record<string, unknown>, seed: string): ExtEvent =>
        ({ taskId: tid(), sessionId: r.session_id, agent: 'opencode', type, data, ts: Number(r.time_updated), seed: `oc:${r.id}:${seed}` });

      if (md.role === 'user' && pd.type === 'text' && pd.text && !st.seenUser.has(r.message_id)) {
        st.seenUser.add(r.message_id);
        if (st.open && !st.skip) out.push(mk('task.cancelled', { reason: 'yeni istem geldi' }, 'cancel'));
        st.turn++;
        st.skip = this.isManaged('opencode', String(pd.text), Number(r.time_updated));
        st.open = !st.skip;
        if (!st.skip) out.push(mk('task.started', { prompt: String(pd.text), cwd: r.directory, model: md.model?.modelID ? `${md.model.providerID}/${md.model.modelID}` : '' }, 'start'));
        continue;
      }
      if (md.role !== 'assistant' || !st.open || st.skip) continue;
      if (md.error) {
        out.push(mk('task.failed', { error: JSON.stringify(md.error) }, 'error'));
        st.open = false;
        continue;
      }
      if (pd.type === 'text' && pd.text && pd.time?.end) {
        out.push(mk('message.delta', { text: String(pd.text) }, 'text'));
      } else if (pd.type === 'tool' && (pd.state?.status === 'completed' || pd.state?.status === 'error')) {
        out.push(mk('tool.invoked', { id: pd.callID, name: pd.tool, input: pd.state.input ?? {} }, 'call'));
        out.push(mk('tool.completed', { toolUseId: pd.callID, output: String(pd.state.output ?? pd.state.error ?? '') }, 'out'));
      } else if (pd.type === 'step-finish') {
        if (pd.tokens) out.push(mk('usage.updated', { usage: { input_tokens: pd.tokens.input ?? 0, output_tokens: pd.tokens.output ?? 0 } }, 'usage'));
        if (pd.reason === 'stop') { out.push(mk('task.completed', { exitCode: 0 }, 'end')); st.open = false; }
      }
    }
    return out;
  }

  // Closing the observer does not prove the producer exited. Missing stop events
  // (including producer crashes) are reconciled by SqliteStore.reapStaleTasks.
  close(): void { this.db.close(); }
}
