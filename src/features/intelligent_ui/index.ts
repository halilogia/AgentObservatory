import { z } from 'zod';
import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { SqliteStore } from '../../core/sqlite_store.ts';
import { createEvent } from '../../core/types.ts';

const id = z.string().min(1).max(100).regex(/^[\w.-]+$/);
const text = z.string().max(4000);
const label = z.string().min(1).max(200);
const item = z.strictObject({ label, value: z.number().finite().nullable(), unit: z.string().max(40).optional() });
const field = z.strictObject({ id, label, type: z.enum(['text', 'number']), value: z.union([z.string().max(1000), z.number().finite()]).optional(), required: z.boolean().optional() });
const base = { id, title: label.optional() };
export const uiSpecSchema = z.strictObject({
  version: z.literal(1), title: label, summary: text,
  blocks: z.array(z.discriminatedUnion('type', [
    z.strictObject({ ...base, type: z.literal('text'), text }),
    z.strictObject({ ...base, type: z.literal('card'), text, tone: z.enum(['neutral', 'success', 'warning']).optional() }),
    z.strictObject({ ...base, type: z.literal('table'), columns: z.array(label).min(1).max(12), rows: z.array(z.array(z.union([text, z.number().finite(), z.null()])).max(12)).max(100) }),
    z.strictObject({ ...base, type: z.literal('bar_chart'), items: z.array(item).min(1).max(40) }),
    z.strictObject({ ...base, type: z.literal('form'), fields: z.array(field).min(1).max(12), submitLabel: label.optional(), calculation: z.strictObject({ operation: z.enum(['sum', 'product', 'percentage']), inputs: z.array(id).min(1).max(12), label, unit: z.string().max(40).optional() }).optional() }),
    z.strictObject({ ...base, type: z.literal('diagram'), nodes: z.array(z.strictObject({ id, label })).min(1).max(30), edges: z.array(z.strictObject({ from: id, to: id, label: label.optional() })).max(60) })
  ])).min(1).max(30)
}).superRefine((spec, ctx) => {
  const unique = (keys: string[]) => new Set(keys).size === keys.length;
  if (!unique(spec.blocks.map(b => b.id))) ctx.addIssue({ code: 'custom', message: 'Duplicate block ID' });
  for (const b of spec.blocks) {
    if (b.type === 'table' && b.rows.some(r => r.length !== b.columns.length)) ctx.addIssue({ code: 'custom', message: 'Table row width mismatch' });
    if (b.type === 'form') {
      if (!unique(b.fields.map(f => f.id))) ctx.addIssue({ code: 'custom', message: 'Duplicate field ID' });
      if (b.calculation && (b.calculation.inputs.some(k => !b.fields.some(f => f.id === k && f.type === 'number')) || (b.calculation.operation === 'percentage' && b.calculation.inputs.length !== 2))) ctx.addIssue({ code: 'custom', message: 'Invalid calculation inputs' });
    }
    if (b.type === 'diagram' && (!unique(b.nodes.map(n => n.id)) || b.edges.some(e => !b.nodes.some(n => n.id === e.from) || !b.nodes.some(n => n.id === e.to)))) ctx.addIssue({ code: 'custom', message: 'Invalid diagram references' });
  }
});
export const publishSchema = z.strictObject({
  id: id.optional(), agent: z.enum(['claude', 'codex', 'agy', 'opencode', 'freebuff', 'commandcode', 'hermes', 'ollama']),
  taskId: z.string().min(1).max(200).optional(), sessionId: z.string().min(1).max(200).optional(), spec: uiSpecSchema
});
export const updateSchema = z.strictObject({ id, expectedRevision: z.number().int().positive(), spec: uiSpecSchema });
export const actionSchema = z.strictObject({ id, expectedRevision: z.number().int().positive(), blockId: id, requestId: z.string().uuid(), values: z.record(id, z.union([z.string().max(1000), z.number().finite()])) });
export type UISpec = z.infer<typeof uiSpecSchema>;
export interface UIDocument { id: string; revision: number; agent: z.infer<typeof publishSchema>['agent']; taskId: string; sessionId: string | null; spec: UISpec }
export class UIError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
function bounded<T>(schema: z.ZodType<T>, input: unknown): T {
  if (Buffer.byteLength(JSON.stringify(input) || '') > 48 * 1024) throw new UIError('UI payload exceeds 48 KiB');
  const result = schema.safeParse(input);
  if (!result.success) throw new UIError(result.error.issues.map(i => i.message).join('; '));
  return result.data;
}
/** One complete snapshot per event: readers never interpret incomplete JSON or partial patches. */
export function readUI(db: DatabaseSync, key: string): UIDocument | null {
  const row = db.prepare("SELECT data FROM events WHERE type IN ('ui.published','ui.updated') AND json_extract(data,'$.id') = ? ORDER BY rowid DESC LIMIT 1").get(key) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}
export function listUI(db: DatabaseSync, scope: { taskId?: string; sessionId?: string } = {}): UIDocument[] {
  const rows = db.prepare(`SELECT data FROM events WHERE rowid IN (
    SELECT MAX(rowid) FROM events WHERE type IN ('ui.published','ui.updated')
    AND (? IS NULL OR task_id = ?) AND (? IS NULL OR session_id = ?)
    GROUP BY json_extract(data,'$.id')) ORDER BY rowid DESC LIMIT 500`).all(scope.taskId || null, scope.taskId || null, scope.sessionId || null, scope.sessionId || null) as { data: string }[];
  return rows.map(r => JSON.parse(r.data) as UIDocument);
}
export function readUIActions(db: DatabaseSync, key: string, after = 0) {
  return (db.prepare("SELECT rowid AS seq, data FROM events WHERE type = 'ui.action' AND json_extract(data,'$.id') = ? AND rowid > ? ORDER BY rowid LIMIT 100").all(key, after) as { seq: number; data: string }[]).map(r => ({ seq: Number(r.seq), ...JSON.parse(r.data) }));
}
function insert(db: DatabaseSync, doc: UIDocument, type: 'ui.published' | 'ui.updated' | 'ui.action', data: object) {
  const e = createEvent({ agent: doc.agent, taskId: doc.taskId, sessionId: doc.sessionId, type, data });
  db.prepare('INSERT INTO events (id,task_id,session_id,agent,tier,type,data,timestamp) VALUES (?,?,?,?,?,?,?,?)').run(e.id, e.taskId, e.sessionId, e.agent, e.tier, e.type, JSON.stringify(data), e.timestamp);
}
export function publishUI(store: SqliteStore, input: unknown): UIDocument {
  const p = bounded(publishSchema, input);
  return store.withTransaction(db => {
    const key = p.id || 'ui-' + crypto.randomUUID();
    if (readUI(db, key)) throw new UIError('UI ID already exists; use ui_update', 409);
    const task = p.taskId ? db.prepare('SELECT agent, session_id FROM tasks WHERE task_id = ?').get(p.taskId) as { agent: string; session_id: string | null } | undefined : undefined;
    if (p.taskId && !task) throw new UIError('Task not found', 404);
    if (task && (task.agent !== p.agent || (p.sessionId && task.session_id !== p.sessionId))) throw new UIError('Task scope mismatch', 409);
    const doc: UIDocument = { id: key, revision: 1, agent: p.agent, taskId: p.taskId || 'ui-' + key, sessionId: task?.session_id || p.sessionId || null, spec: p.spec };
    insert(db, doc, 'ui.published', doc);
    return doc;
  });
}
export function updateUI(store: SqliteStore, input: unknown): UIDocument {
  const p = bounded(updateSchema, input);
  return store.withTransaction(db => {
    const doc = readUI(db, p.id);
    if (!doc) throw new UIError('UI not found', 404);
    if (doc.revision !== p.expectedRevision) throw new UIError('Revision conflict; read the latest UI first', 409);
    const next = { ...doc, revision: doc.revision + 1, spec: p.spec };
    insert(db, next, 'ui.updated', next);
    return next;
  });
}
export function submitUI(store: SqliteStore, input: unknown) {
  const p = bounded(actionSchema, input);
  return store.withTransaction(db => {
    const doc = readUI(db, p.id);
    if (!doc) throw new UIError('UI not found', 404);
    const old = db.prepare("SELECT data FROM events WHERE type='ui.action' AND json_extract(data,'$.id')=? AND json_extract(data,'$.requestId')=?").get(p.id, p.requestId) as { data: string } | undefined;
    if (old) {
      const action = JSON.parse(old.data);
      if (action.revision !== p.expectedRevision || action.blockId !== p.blockId || JSON.stringify(action.values) !== JSON.stringify(p.values)) throw new UIError('Request ID already used', 409);
      return action;
    }
    if (doc.revision !== p.expectedRevision) throw new UIError('Revision conflict; reload before submitting', 409);
    const block = doc.spec.blocks.find(b => b.id === p.blockId);
    if (!block || block.type !== 'form') throw new UIError('Unknown form');
    if (Object.keys(p.values).some(k => !block.fields.some(f => f.id === k))) throw new UIError('Unknown form field');
    for (const f of block.fields) {
      const v = p.values[f.id];
      if (f.required && (v === undefined || v === '')) throw new UIError('Required field: ' + f.label);
      if (v !== undefined && (f.type === 'number' ? typeof v !== 'number' : typeof v !== 'string')) throw new UIError('Invalid field type: ' + f.label);
    }
    const action = { id: doc.id, revision: doc.revision, blockId: p.blockId, requestId: p.requestId, values: p.values };
    insert(db, doc, 'ui.action', action);
    return action;
  });
}

/** Terminal fallback is plain text and data, never model-supplied escape sequences. */
export function uiText(doc: UIDocument): string {
  const lines = [doc.spec.title, doc.spec.summary];
  for (const b of doc.spec.blocks) {
    if (b.title) lines.push(b.title);
    if (b.type === 'text' || b.type === 'card') lines.push(b.text);
    if (b.type === 'table') lines.push(b.columns.join(' | '), ...b.rows.map(r => r.map(v => v ?? '?').join(' | ')));
    if (b.type === 'bar_chart') lines.push(...b.items.map(i => `${i.label}: ${i.value ?? '?'} ${i.unit || ''}`));
    if (b.type === 'diagram') lines.push(...b.edges.map(e => `${b.nodes.find(n => n.id === e.from)?.label} -> ${b.nodes.find(n => n.id === e.to)?.label}`));
    if (b.type === 'form') lines.push(b.fields.map(f => f.label).join(' / '));
  }
  return lines.join('\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
}
