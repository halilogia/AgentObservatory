// Claude Code alt ajanları: subagents/agent-<id>.jsonl + .meta.json -> ebeveyni olan alt görev; çift kayıt yok; web API.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { startIngest } from '../src/ingest/index.ts';
import { groupSessions, subagentsOf } from '../src/commands/web_sessions.ts';

const SID = '024d25c1-eb9f-4ea6-b393-7be53dbd1624';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-sub-'));
const proj = path.join(root, 'proje');
fs.mkdirSync(path.join(proj, SID, 'subagents'), { recursive: true });
const J = (o: object) => JSON.stringify(o) + '\n';

const main = [
  { type: 'user', sessionId: SID, cwd: 'C:\p', timestamp: '2026-10-23T19:00:00.000Z', message: { role: 'user', content: 'araştır' } },
  { type: 'assistant', sessionId: SID, timestamp: '2026-10-23T19:00:01.000Z', message: { id: 'm1', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'toolu_AG', name: 'Agent', input: { prompt: 'alt görev metni' } }] } }
];
const sub = [
  { isSidechain: true, agentId: 'a1b2', type: 'user', sessionId: SID, cwd: 'C:\p', timestamp: '2026-10-23T19:00:02.000Z', message: { role: 'user', content: 'alt görev metni' } },
  { isSidechain: true, agentId: 'a1b2', type: 'attachment', sessionId: SID, timestamp: '2026-10-23T19:00:02.100Z', attachment: {} },
  { isSidechain: true, agentId: 'a1b2', type: 'assistant', sessionId: SID, timestamp: '2026-10-23T19:00:03.000Z', message: { id: 'ms1', model: 'claude-x', stop_reason: 'tool_use', usage: { input_tokens: 5, output_tokens: 2 }, content: [{ type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'a.ts' } }] } },
  { isSidechain: true, agentId: 'a1b2', type: 'user', sessionId: SID, timestamp: '2026-10-23T19:00:04.000Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'icerik' }] } },
  { isSidechain: true, agentId: 'a1b2', type: 'assistant', sessionId: SID, timestamp: '2026-10-23T19:00:05.000Z', message: { id: 'ms2', model: 'claude-x', stop_reason: 'end_turn', usage: { input_tokens: 9, output_tokens: 4 }, content: [{ type: 'text', text: 'bulgu: tamam' }] } }
];
const mainFile = path.join(proj, SID + '.jsonl');
const subFile = path.join(proj, SID, 'subagents', 'agent-a1b2.jsonl');
// alt ajan dosyası ana dosyadan ÖNCE yazılmış olabilir (dizin sırası): ebeveyn bilinene kadar bekler
fs.writeFileSync(subFile, sub.map(J).join(''));
fs.writeFileSync(path.join(proj, SID, 'subagents', 'agent-a1b2.meta.json'), JSON.stringify({ agentType: 'general-purpose', toolUseId: 'toolu_AG' }));
fs.writeFileSync(mainFile, main.map(J).join(''));

const store = new SqliteStore(':memory:');
const h = startIngest({ sources: ['claude'], activeMinutes: 60 * 24 * 365, backfill: true, follow: false, store, claudeDir: root, isManaged: () => false });
for (let i = 0; i < 12; i++) h.tick();
h.stop();

const parentId = 'ext_claude_024d25c1eb_1';
const subId = 'ext_claude_sub_a1b2';
const tasks = store.getTasksForSession(SID);
assert.deepStrictEqual(tasks.map((t) => t.taskId).sort(), [parentId, subId].sort(), 'ana tur + alt görev');
const st = tasks.find((t) => t.taskId === subId)!;
assert.strictEqual(st.parentTaskId, parentId, 'ebeveyn = Agent aracını çağıran tur');
assert.strictEqual(st.status, 'completed');
assert.strictEqual(st.prompt, 'alt görev metni');
assert.strictEqual(st.model, 'claude-x');
assert.strictEqual(st.toolsUsed.length, 1);
assert.ok(st.assistantText.includes('bulgu: tamam'));
assert.ok(store.getEvents(subId).every((e) => e.parentTaskId === parentId), 'alt ajan olayları ebeveyn taşır');
assert.strictEqual(store.getTask(parentId)?.parentTaskId, undefined, 'ana görev alt görev sayılmaz');

// ikinci geçiş: aynı satırlar yeniden okunsa da çift kayıt yok
const n = store.getEventsForSession(SID).length;
const h2 = startIngest({ sources: ['claude'], activeMinutes: 60 * 24 * 365, backfill: true, follow: false, store, claudeDir: root, isManaged: () => false });
for (let i = 0; i < 12; i++) h2.tick();
h2.stop();
assert.strictEqual(store.getEventsForSession(SID).length, n, 'çift kayıt yok');

// web: oturum listesi sayacı ve /api/session subs biçimi
const rows = [{ task_id: parentId, session_id: SID, agent: 'claude', model: 'm', status: 'completed', prompt: 'araştır', start_time: 1, end_time: 9 }];
const g = groupSessions(rows, 100, [{ session_id: SID, status: 'running', start_time: 50 }, { session_id: SID, status: 'completed', start_time: 40 }]);
assert.strictEqual(g[0].subs, 2);
assert.strictEqual(g[0].subsRunning, 1);
assert.strictEqual(groupSessions(rows, 100)[0].subs, 0);
const so = subagentsOf([{ task_id: subId, parent_task_id: parentId, agent: 'claude', model: 'm', status: 'completed', prompt: 'p', start_time: 1, end_time: 2 }], [{ task_id: subId, type: 'tool.invoked', data: '{"name":"Read"}', timestamp: 1 }, { task_id: 'baska', type: 'x', data: '{}', timestamp: 1 }]);
assert.strictEqual(so.length, 1);
assert.strictEqual(so[0].events.length, 1);
assert.strictEqual(so[0].events[0].data.name, 'Read');

fs.rmSync(root, { recursive: true, force: true });
console.log('ingest_subagents OK');
