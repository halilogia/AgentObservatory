// Kitaplık: Claude Code'un satır içi SVG/HTML widget'ları (JSONL tool_use.input.widget_code) taranır, sunulur ve kaynak oturum taşır
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseWidgetLines, renderWidgetSvg } from '../src/core/library_widgets.ts';
import { startWeb } from '../src/commands/web.ts';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { createEvent } from '../src/core/types.ts';

const svg = '<svg width="100%" viewBox="0 0 680 100" role="img"><g class="c-teal"><rect x="1" y="1" width="50" height="20"/></g><script>alert(1)</script></svg>';
const line = (id: string, code: string, title: string, ts: string) => JSON.stringify({ type: 'assistant', sessionId: 'sess-1', timestamp: ts, message: { content: [{ type: 'tool_use', id, name: 'mcp__visualize__show_widget', input: { title, widget_code: code } }] } });
const jsonl = [
  JSON.stringify({ type: 'user', sessionId: 'sess-1', message: { content: 'merhaba widget_code' } }),
  line('tu_1', svg, 'akis', '2026-11-01T10:00:00Z'),
  line('tu_2', '<div>merhaba</div>', 'panel', '2026-11-01T10:05:00Z'),
  'bozuk satır "widget_code"'
].join('\n');

// 1. ayrıştırıcı
const parsed = parseWidgetLines(jsonl, 'fallback');
assert.strictEqual(parsed.length, 2);
assert.strictEqual(parsed[0].kind, 'svg');
assert.strictEqual(parsed[0].sessionId, 'sess-1');
assert.strictEqual(parsed[0].id, 'sess-1:tu_1');
assert.strictEqual(parsed[1].kind, 'html');

// 2. SVG dekorasyonu: xmlns, sabit boyut, stil, betik ayıklama
const out = renderWidgetSvg(svg);
assert.ok(out.includes('xmlns="http://www.w3.org/2000/svg"'));
assert.ok(out.includes('width="680"') && out.includes('height="100"'));
assert.ok(out.includes('.c-teal rect'));
assert.ok(!out.includes('<script'));

// 3. uç noktalar
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-libw-'));
const proj = path.join(home, '.claude', 'projects', 'p1');
fs.mkdirSync(proj, { recursive: true });
fs.writeFileSync(path.join(proj, 'sess-1.jsonl'), jsonl, 'utf8');
new SqliteStore(path.join(home, 't.sqlite')).recordEvent(createEvent({ taskId: 'task_seed', agent: 'codex', type: 'task.started', data: { prompt: 'x' } }));
const PORT = 19100 + Math.floor(Math.random() * 50);
const { server } = startWeb({ port: PORT, dbPath: path.join(home, 't.sqlite'), roots: [], configPath: path.join(home, 'web.json'), token: 'b'.repeat(48), pollMs: 50, ingest: false, home });
await new Promise((r) => server.once('listening', r));
try {
  const base = `http://127.0.0.1:${PORT}`;
  const items = await (await fetch(base + '/api/library')).json() as any[];
  const w = items.filter((x) => x.widgetId);
  assert.strictEqual(w.length, 2);
  const a = w.find((x) => x.name === 'akis.svg');
  assert.ok(a, 'svg kartı');
  assert.strictEqual(a.sessionId, 'sess-1');
  assert.strictEqual(a.agent, 'claude');
  assert.strictEqual(a.seq, 0);
  assert.strictEqual(w.find((x) => x.ext === 'html').seq, 1);

  const r = await fetch(base + '/api/library/widget?id=' + encodeURIComponent(a.widgetId));
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers.get('content-type'), 'image/svg+xml');
  assert.ok((await r.text()).includes('<svg'));
  const h = w.find((x) => x.ext === 'html');
  const rh = await fetch(base + '/api/library/widget?id=' + encodeURIComponent(h.widgetId));
  assert.ok((rh.headers.get('content-type') || '').startsWith('text/html'));
  assert.ok((rh.headers.get('content-security-policy') || '').startsWith('sandbox'));
  assert.strictEqual((await fetch(base + '/api/library/widget?id=yok')).status, 404);
  assert.strictEqual((await fetch(base + '/api/library/widget?id=' + encodeURIComponent('../../etc'))).status, 404);

  // arayüz: lightbox, kaynak sohbet düğmesi ve iframe izni
  const index = await fetch(base + '/');
  assert.ok((index.headers.get('content-security-policy') || '').includes("frame-src 'self'"));
  const app = fs.readFileSync(path.resolve('web/app.js'), 'utf8');
  for (const needle of ['openLightbox', 'openSourceChat', 'ArrowLeft', 'Escape', "srcBtn.hidden = !it.sessionId"]) assert.ok(app.includes(needle), needle);
  console.log('✔ web kitaplık: widget taraması, SVG/HTML sunumu, kaynak oturum alanları, lightbox kodu');
} finally {
  server.close();
  server.closeAllConnections?.();
}
