// web/mission_composer.js, dag_view.js, fleet_view.js, diff_viewer.js testleri
import test from 'node:test';
import assert from 'node:assert';
import '../web/diff.js';
import '../web/mission_composer.js';
import '../web/dag_view.js';
import '../web/fleet_view.js';
import '../web/diff_viewer.js';
import { createMockDoc, findAll, hasClass } from './mock_dom.ts';

const g = globalThis as any;

test('Mission Composer: doğrulama ve yük', () => {
  const C = g.ObsMissionComposer;
  assert.deepStrictEqual(C.MODES.map((m: any) => m.id), ['direct', 'planned', 'verified']);
  assert.strictEqual(C.validateForm({ objective: 'a', repoPath: '/r', mode: 'direct' }).length, 0);
  const errs = C.validateForm({ objective: '', repoPath: '', mode: 'verified', testCommands: ' \n', timeoutMinutes: '0' });
  assert.strictEqual(errs.length, 4);

  const p = C.buildPayload({ objective: ' hedef ', repoPath: '/r', mode: 'verified', testCommands: 'npm test\n\n npm run lint ', includePaths: 'src', excludePaths: '', timeoutMinutes: '15', title: '' });
  assert.deepStrictEqual(p, { objective: 'hedef', mode: 'verified', repoPath: '/r', testCommands: ['npm test', 'npm run lint'], includePaths: ['src'], timeoutMinutes: 15 });
});

test('Mission Composer: form çizimi, mod seçimi ve gönderim', () => {
  const doc = createMockDoc();
  const root = doc.createElement('div');
  const got: any[] = [];
  const h = g.ObsMissionComposer.render(doc, root, { repoPath: '/proje', onSubmit: (p: any) => { got.push(p); } });

  const btns = findAll(h.el, (e) => hasClass(e, 'mc-mode'));
  assert.strictEqual(btns.length, 3);
  assert.ok(hasClass(btns[0], 'is-active'));
  btns[2].onclick!();
  assert.ok(hasClass(btns[2], 'is-active') && !hasClass(btns[0], 'is-active'));
  assert.strictEqual(h.getValues().mode, 'verified');

  h.el.onsubmit!();
  assert.strictEqual(got.length, 0, 'geçersiz form gönderilmez');
  assert.ok(findAll(h.el, (e) => hasClass(e, 'mc-errors'))[0].textContent.includes('Hedef'));

  findAll(h.el, (e) => hasClass(e, 'mc-objective'))[0].value = 'Auth düzelt';
  findAll(h.el, (e) => hasClass(e, 'mc-tests'))[0].value = 'npm test';
  h.el.onsubmit!();
  const sent = got[0];
  assert.strictEqual(sent.mode, 'verified');
  assert.strictEqual(sent.repoPath, '/proje');
  assert.deepStrictEqual(sent.testCommands, ['npm test']);
});

test('DAG View: durum renkleri, katmanlama, döngü güvenliği', () => {
  const V = g.ObsDagView;
  assert.strictEqual(V.statusColor('running'), 'yellow');
  assert.strictEqual(V.statusColor('completed'), 'green');
  assert.strictEqual(V.statusColor('failed'), 'red');
  assert.strictEqual(V.statusColor('blocked'), 'red');
  assert.strictEqual(V.statusColor('ready'), 'blue');
  assert.strictEqual(V.statusColor('verifying'), 'blue');
  assert.strictEqual(V.statusColor('pending'), 'gray');

  const tasks = [
    { id: 'a', title: 'Analiz', status: 'completed', dependencies: [] },
    { id: 'b', title: 'Kodla', status: 'running', dependencies: ['a'], assignedAgent: 'claude' },
    { id: 'c', title: 'Test', status: 'failed', dependencies: ['a'] },
    { id: 'd', title: 'Birleştir', status: 'ready', dependencies: ['b', 'c', 'yok'] }
  ];
  const lay = V.layout(tasks);
  const lv = Object.fromEntries(lay.nodes.map((n: any) => [n.id, n.level]));
  assert.deepStrictEqual(lv, { a: 0, b: 1, c: 1, d: 2 });
  assert.strictEqual(lay.edges.length, 4, 'bilinmeyen bağımlılık kenar üretmez');
  assert.notStrictEqual(lay.nodes[1].y, lay.nodes[2].y, 'aynı katmanda alt alta');
  assert.deepStrictEqual(V.counts(tasks), { yellow: 1, green: 1, red: 1, blue: 1, gray: 0 });

  const cyc = V.layout([{ id: 'x', dependencies: ['y'] }, { id: 'y', dependencies: ['x'] }]);
  assert.strictEqual(cyc.nodes.length, 2, 'döngü sonsuz özyinelemeye girmez');

  const doc = createMockDoc();
  const host = doc.createElement('div');
  V.render(doc, host, tasks);
  V.render(doc, host, tasks.map((t) => ({ ...t, status: 'completed' })));
  assert.strictEqual(host.children.length, 1, 'yeniden çizim içeriği tazeler');
  const nodes = findAll(host, (e) => hasClass(e, 'dag-node'));
  assert.strictEqual(nodes.length, 4);
  assert.ok(nodes.every((n) => hasClass(n, 'dag-green')));
});

test('Fleet View: 4 takım, durumlar ve araç çağrıları', () => {
  const F = g.ObsFleetView;
  const idle = F.summarize([]);
  assert.deepStrictEqual(idle.map((f: any) => f.id), ['claude', 'codex', 'antigravity', 'opencode']);
  assert.ok(idle.every((f: any) => f.state === 'idle'));

  const tools = (n: string[]) => n.map((name) => ({ name, input: {}, timestamp: 0 }));
  const fleet = F.summarize([
    { taskId: '1', agent: 'claude', status: 'running', prompt: 'Refactor  auth', model: 'm', startTime: 1, toolsUsed: tools(['Read', 'Edit', 'Bash', 'Grep']) },
    { taskId: '2', agent: 'codex', status: 'failed', error: 'usage limit reached', startTime: 2, toolsUsed: [] },
    { taskId: '3', agent: 'agy', status: 'failed', error: 'boom', startTime: 3, toolsUsed: [] },
    { taskId: '4', agent: 'opencode', status: 'completed', startTime: 4, toolsUsed: [] },
    { taskId: '5', agent: 'freebuff', status: 'running', startTime: 5, toolsUsed: [] }
  ]);
  const by = Object.fromEntries(fleet.map((f: any) => [f.id, f]));
  assert.strictEqual(by.claude.state, 'working');
  assert.strictEqual(by.claude.toolCalls, 4);
  assert.deepStrictEqual(by.claude.recentTools, ['Edit', 'Bash', 'Grep']);
  assert.strictEqual(by.claude.current.prompt, 'Refactor auth');
  assert.strictEqual(by.codex.state, 'rate_limited');
  assert.strictEqual(by.antigravity.state, 'error');
  assert.strictEqual(by.opencode.state, 'idle');
  assert.strictEqual(by.opencode.completed, 1);

  const doc = createMockDoc();
  const host = doc.createElement('div');
  F.render(doc, host, []);
  assert.strictEqual(findAll(host, (e) => hasClass(e, 'fleet-card')).length, 4);
});

const GIT_DIFF = `diff --git a/src/a.js b/src/a.js
index 111..222 100644
--- a/src/a.js
+++ b/src/a.js
@@ -1,2 +1,3 @@
 keep
-old
+new
+extra
diff --git a/src/new.js b/src/new.js
new file mode 100644
--- /dev/null
+++ b/src/new.js
@@ -0,0 +1,2 @@
+l1
+l2
diff --git a/old.txt b/old.txt
deleted file mode 100644
--- a/old.txt
+++ /dev/null
@@ -1 +0,0 @@
-gone
`;

test('Diff Viewer: çok dosyalı git diff ayrıştırma', () => {
  const V = g.ObsDiffViewer;
  const files = V.parseGitDiff(GIT_DIFF);
  assert.strictEqual(files.length, 3);
  assert.deepStrictEqual(files.map((f: any) => f.status), ['modified', 'added', 'deleted']);
  assert.deepStrictEqual(files.map((f: any) => f.file), ['src/a.js', 'src/new.js', 'old.txt']);
  assert.deepStrictEqual(V.totals(files), { files: 3, add: 4, del: 2 });
  assert.deepStrictEqual(V.parseGitDiff(''), []);
});

test('Diff Viewer: sekmeler, seçim ve onay düğmeleri', () => {
  const V = g.ObsDiffViewer;
  const doc = createMockDoc();
  const host = doc.createElement('div');
  const calls: string[] = [];
  const h = V.render(doc, host, GIT_DIFF, { approval: true, onApprove: () => calls.push('ok'), onReject: () => calls.push('no') });

  const tabs = findAll(h.el, (e) => hasClass(e, 'dv-tab'));
  assert.strictEqual(tabs.length, 3);
  assert.ok(hasClass(tabs[0], 'is-active'));
  assert.ok(hasClass(tabs[1], 'dv-added'));
  assert.ok(findAll(h.el, (e) => hasClass(e, 'dv-summary'))[0].textContent.startsWith('3 dosya'));

  const fileOf = () => findAll(h.el, (e) => hasClass(e, 'diff-file'))[0].textContent;
  assert.strictEqual(findAll(h.el, (e) => hasClass(e, 'diff-card')).length, 1);
  tabs[2].onclick!();
  assert.ok(hasClass(tabs[2], 'is-active') && !hasClass(tabs[0], 'is-active'));
  assert.strictEqual(findAll(h.el, (e) => hasClass(e, 'diff-card')).length, 1, 'panel yalnızca seçili dosyayı tutar');
  assert.strictEqual(fileOf(), 'old.txt');

  findAll(h.el, (e) => hasClass(e, 'dv-approve'))[0].onclick!();
  findAll(h.el, (e) => hasClass(e, 'dv-reject'))[0].onclick!();
  assert.deepStrictEqual(calls, ['ok', 'no']);

  const e = V.render(doc, doc.createElement('div'), '   ');
  assert.strictEqual(e.files.length, 0);
  assert.strictEqual(findAll(e.el, (x) => hasClass(x, 'dv-empty')).length, 1);
  assert.strictEqual(findAll(V.render(doc, doc.createElement('div'), GIT_DIFF).el, (x) => hasClass(x, 'dv-actions')).length, 0);
});
