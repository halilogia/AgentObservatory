// Ajanlar arası alt ajan bağı: bir ajanın araç çağrısıyla başlattığı başka ajan, parent_task_id ile alt ajan olur;
// kendi oturumu korunur; ağaçta üst görevin altında dal olarak ve `[N alt ajan]` rozetiyle çizilir.
import assert from 'node:assert/strict';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { createEvent } from '../src/core/types.ts';
import type { AgentType, TaskSummary } from '../src/core/types.ts';
import { detectSpawn, promptKey, promptsMatch } from '../src/core/spawn_link.ts';
import { renderTree } from '../src/ui/tree.ts';

// --- detectSpawn: MCP araçları ve CLI komutları ---
assert.deepEqual(detectSpawn('mcp__agent-observatory__run_codex', { prompt: 'testleri düzelt' }), { agent: 'codex', prompt: 'testleri düzelt' });
assert.deepEqual(detectSpawn('mcp__agent-observatory__run_agent', { agent: 'opencode', prompt: 'özetle' }), { agent: 'opencode', prompt: 'özetle' });
assert.deepEqual(detectSpawn('agent-observatory.start_task', { agent: 'claude', prompt: 'incele' }), { agent: 'claude', prompt: 'incele' });
assert.deepEqual(detectSpawn('run_agy', { prompt: 'ekranı çiz' }), { agent: 'agy', prompt: 'ekranı çiz' });
assert.deepEqual(detectSpawn('call_mcp_tool', { ServerName: 'agent-bridge', ToolName: 'start_task', Arguments: { agent: 'codex', prompt: 'testleri düzelt' } }), { agent: 'codex', prompt: 'testleri düzelt' });
assert.deepEqual(detectSpawn('call_mcp_tool', { ToolName: 'start_task', Arguments: JSON.stringify({ agent: 'codex', prompt: 'testleri düzelt' }) }), { agent: 'codex', prompt: 'testleri düzelt' });
assert.deepEqual(detectSpawn('call_mcp_tool', { ToolName: 'run_codex', Arguments: { prompt: 'refactor yap' } }), { agent: 'codex', prompt: 'refactor yap' });
assert.deepEqual(detectSpawn('Bash', { command: 'cd repo && codex exec --full-auto "README dosyasını güncelle"' }), { agent: 'codex', prompt: 'README dosyasını güncelle' });
assert.deepEqual(detectSpawn('Bash', { command: "claude -p 'kodu gözden geçir' --output-format json" }), { agent: 'claude', prompt: 'kodu gözden geçir' });
assert.deepEqual(detectSpawn('run_command', { CommandLine: 'C:\\tools\\agy.exe -p "harita üret"' }), { agent: 'agy', prompt: 'harita üret' });
assert.deepEqual(detectSpawn('shell', { command: ['bash', '-lc', 'opencode run "lint hatalarını çöz"'] }), { agent: 'opencode', prompt: 'lint hatalarını çöz' });
assert.equal(detectSpawn('Read', { file_path: 'a.ts' }), null);
assert.equal(detectSpawn('Bash', { command: 'git commit -m "codex exec düzeltmesi"' }), null, 'tırnak içindeki ikili adı komut değildir');
assert.equal(detectSpawn('Bash', { command: 'codex --help' }), null, 'istemsiz CLI çağrısı alt ajan değildir');
assert.equal(detectSpawn('mcp__agent-observatory__run_codex', { prompt: '  ' }), null);
assert.ok(promptsMatch(promptKey('README "dosyasını"   güncelle'), promptKey('readme dosyasını güncelle\n\n(ek bağlam)')));
assert.ok(!promptsMatch(promptKey('başka iş'), promptKey('readme dosyasını güncelle')));

// --- depo: iki yönlü eşleştirme ---
const T = 1_800_000_000_000;
const ev = (taskId: string, sessionId: string | null, agent: AgentType, type: any, data: Record<string, any>, timestamp: number) =>
  createEvent({ taskId, sessionId, agent, type, data, timestamp, tier: 3 });
{
  // (a) alt görev önce kaydedildi (MCP run_codex: Observatory görevi hemen yazar, Claude kaydı sonra okunur)
  const s = new SqliteStore(':memory:');
  s.recordEvent(ev('ext_claude_p1', 'sess-claude', 'claude', 'task.started', { prompt: 'ana görev' }, T));
  s.recordEvent(ev('task_codex_1', 'sess-codex', 'codex', 'task.started', { prompt: 'testleri düzelt' }, T + 2000));
  s.recordEvent(ev('task_other', 'sess-x', 'codex', 'task.started', { prompt: 'alakasız iş' }, T + 2100));
  s.recordEvent(ev('ext_claude_p1', 'sess-claude', 'claude', 'tool.invoked', { name: 'mcp__agent-observatory__run_codex', input: { prompt: 'testleri düzelt' } }, T + 2500));
  const child = s.getTask('task_codex_1')!;
  assert.equal(child.parentTaskId, 'ext_claude_p1', 'MCP ile başlatılan Codex, Claude görevinin alt ajanı olmalı');
  assert.equal(child.sessionId, 'sess-codex', 'alt ajanın kendi oturumu korunur');
  assert.equal(s.getTask('task_other')!.parentTaskId, undefined, 'istemi uymayan görev bağlanmaz');
  // sonraki olaylar da ebeveyni taşır; ebeveynin bitmesi alt ajanın geçmişini bozmaz
  s.recordEvent(ev('ext_claude_p1', 'sess-claude', 'claude', 'task.completed', {}, T + 3000));
  s.recordEvent(ev('task_codex_1', 'sess-codex', 'codex', 'task.completed', { result: 'tamam' }, T + 9000));
  const done = s.getTask('task_codex_1')!;
  assert.equal(done.status, 'completed');
  assert.equal(done.parentTaskId, 'ext_claude_p1');
  assert.ok(s.getEvents('task_codex_1').every((e) => e.parentTaskId === 'ext_claude_p1'), 'alt ajan olayları da bağlanır');
}
{
  // (b) niyet önce (kabuktan `codex exec`): Codex oturum dosyası sonradan okunur
  const s = new SqliteStore(':memory:');
  s.recordEvent(ev('ext_agy_p', 'conv-1', 'agy', 'task.started', { prompt: 'üst iş' }, T));
  s.recordEvent(ev('ext_agy_p', 'conv-1', 'agy', 'tool.invoked', { name: 'run_command', input: { CommandLine: 'codex exec "API katmanını yeniden yaz"' } }, T + 1000));
  s.recordEvent(ev('ext_codex_c', 'codex-s', 'codex', 'task.started', { prompt: 'API katmanını yeniden yaz' }, T + 4000));
  assert.equal(s.getTask('ext_codex_c')!.parentTaskId, 'ext_agy_p', 'kabuktan başlatılan Codex, Antigravity görevinin alt ajanı olmalı');
  assert.equal(s.getEvents('ext_codex_c')[0].parentTaskId, 'ext_agy_p');
  // niyet tüketildi: aynı istemli ikinci görev ikinci kez bağlanmaz
  s.recordEvent(ev('ext_codex_d', 'codex-t', 'codex', 'task.started', { prompt: 'API katmanını yeniden yaz' }, T + 5000));
  assert.equal(s.getTask('ext_codex_d')!.parentTaskId, undefined);
  // pencere dışı (10 dk sonra) ve yanlış ajan bağlanmaz
  s.recordEvent(ev('ext_agy_p', 'conv-1', 'agy', 'tool.invoked', { name: 'Bash', input: { command: 'claude -p "geç başlayan"' } }, T + 6000));
  s.recordEvent(ev('ext_claude_late', 'cl-s', 'claude', 'task.started', { prompt: 'geç başlayan' }, T + 6000 + 10 * 60_000));
  assert.equal(s.getTask('ext_claude_late')!.parentTaskId, undefined, 'zaman penceresi dışı');
  s.recordEvent(ev('ext_agy_p', 'conv-1', 'agy', 'tool.invoked', { name: 'Bash', input: { command: 'claude -p "yanlış ajan"' } }, T + 7000));
  s.recordEvent(ev('ext_codex_w', 'cw', 'codex', 'task.started', { prompt: 'yanlış ajan' }, T + 8000));
  assert.equal(s.getTask('ext_codex_w')!.parentTaskId, undefined, 'hedef ajan uymuyor');
}
{
  // (c) aynı oturumun sonraki turu ve döngü bağı kurulmaz
  const s = new SqliteStore(':memory:');
  s.recordEvent(ev('a1', 'S', 'claude', 'task.started', { prompt: 'kök' }, T));
  s.recordEvent(ev('a1', 'S', 'claude', 'tool.invoked', { name: 'Bash', input: { command: 'claude -p "devam et"' } }, T + 500));
  s.recordEvent(ev('a2', 'S', 'claude', 'task.started', { prompt: 'devam et' }, T + 1000));
  assert.equal(s.getTask('a2')!.parentTaskId, undefined, 'aynı oturumun turu alt ajan sayılmaz');
  s.recordEvent(ev('b1', 'B', 'codex', 'task.started', { prompt: 'kök b', }, T, ));
  s.recordEvent(ev('c1', 'C', 'claude', 'task.started', { prompt: 'çocuk c', parentTaskId: 'b1' }, T + 100));
  s.recordEvent(ev('c1', 'C', 'claude', 'tool.invoked', { name: 'run_codex', input: { prompt: 'kök b' } }, T + 200));
  assert.equal(s.getTask('b1')!.parentTaskId, undefined, 'ata, torununun alt ajanı yapılamaz');
}

// --- TUI ağacı: hiyerarşi, rozet, katlama ---
const now = T + 60_000;
const mk = (id: string, sid: string | null, start: number, extra: Partial<TaskSummary> = {}): TaskSummary => ({
  taskId: id, sessionId: sid, agent: 'claude', status: 'completed', prompt: 'p' + id, model: 'sonnet',
  startTime: start, endTime: start + 1000, durationMs: 1000, toolsUsed: [], assistantText: 'son ' + id,
  usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 }, error: null, ...extra
});
const strip = (x: string) => x.replace(/\x1b\[[0-9;]*m/g, '');
const tasks = [
  mk('root_parent', 'claude-s', now - 9000),
  mk('codex_child', 'codex-s', now - 8000, { parentTaskId: 'root_parent', agent: 'codex', model: 'gpt' }),
  mk('agy_child', 'agy-s', now - 7000, { parentTaskId: 'root_parent', agent: 'agy', model: 'gemini' }),
  mk('grand', 'oc-s', now - 6000, { parentTaskId: 'codex_child', agent: 'opencode', model: 'pickle' })
];
const base = { onlyRunning: false, cols: 160, rows: 60, now };
const open = renderTree(tasks, base);
const txt = strip(open.text);
assert.deepEqual(open.order, ['root_parent', 'agy_child', 'codex_child', 'grand'], 'alt ajanlar bağımsız kök değil, üstün altında');
assert.match(txt, /rent .*\[3 alt ajan\]/, 'kök satırda tüm alt dal sayısı');
assert.match(txt, /├─ .*\[ALT AJAN\]/);
assert.match(txt, /└─ .*\[ALT AJAN\].*\[1 alt ajan\]/, 'alt ajanın kendi alt ajanı da rozetlenir');
assert.match(txt, /   └─ .*\[ALT AJAN\]/, 'torun bir seviye daha girintili');
assert.deepEqual(new Set(open.foldable), new Set(['root_parent', 'codex_child']));
const shut = renderTree(tasks, { ...base, collapsed: new Set(['root_parent']) });
assert.deepEqual(shut.order, ['root_parent'], 'kapalı dalın alt ajanları gizlenir');
assert.match(strip(shut.text), /▸ \[3 alt ajan\]/);
// oturum satırı: turların alt ajanları toplanır
const sess = renderTree([mk('t1', 'S1', now - 5000), mk('t2', 'S1', now - 4000), mk('x', 'X', now - 3000, { parentTaskId: 't2', agent: 'codex' })], base);
assert.deepEqual(sess.order, ['session:S1']);
assert.match(strip(sess.text), /2 mesaj .*\[1 alt ajan\]/);
console.log('subagent_linking OK');
