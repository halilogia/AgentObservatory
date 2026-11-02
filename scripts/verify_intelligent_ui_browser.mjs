// Real browser + real MCP recording; all data is isolated demonstration data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const out = path.resolve(process.env.OBSERVATORY_UI_OUTPUT || 'tmp/intelligent-ui-proof');
fs.mkdirSync(out, { recursive: true });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-ui-browser-'));
const dbPath = path.join(dir, 'demo.sqlite');
process.env.OBSERVATORY_DB = dbPath;
process.env.OBSERVATORY_NO_INGEST = '1';
process.env.OBSERVATORY_NO_AUTO_TUI = '1';
process.env.CLAUDE_BIN = process.execPath; // installation check only; the injected runner never spawns a CLI
const { startWeb } = await import('../src/commands/web.ts');
const { globalSqlite } = await import('../src/core/sqlite_store.ts');
const { createEvent } = await import('../src/core/types.ts');
const { readUI, updateUI } = await import('../src/features/intelligent_ui/index.ts');
const { chromium } = await import(process.env.OBSERVATORY_PLAYWRIGHT ? pathToFileURL(process.env.OBSERVATORY_PLAYWRIGHT).href : 'playwright');
const client = new Client({ name: 'intelligent-ui-browser-proof', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: ['--experimental-strip-types', path.resolve('src/cli.ts'), 'mcp'], env: { ...process.env, OBSERVATORY_DB: dbPath }, stderr: 'pipe' });
transport.stderr?.on('data', () => {});
const port = Number(process.env.OBSERVATORY_UI_TEST_PORT || 18789);
const continuations = [];
const mockRunner = { startTask(options) {
  continuations.push(options);
  const taskId = 'mock-continuation-' + continuations.length;
  globalSqlite.recordEvent(createEvent({ taskId, sessionId: options.sessionId, agent: options.agent, type: 'task.started', data: { prompt: options.prompt, model: options.model, cwd: options.cwd } }));
  return { taskId, promise: new Promise(resolve => setTimeout(() => {
    const current = globalSqlite.withTransaction(db => readUI(db, 'visual-demo'));
    updateUI(globalSqlite, { id: current.id, expectedRevision: current.revision, spec: { ...current.spec, summary: 'Simüle edilen ajan aynı oturumda devam etti. Bu doğrulama Claude veya Antigravity kotası kullanmadı.' } });
    globalSqlite.recordEvent(createEvent({ taskId, sessionId: options.sessionId, agent: options.agent, type: 'message.delta', data: { text: 'Form yanıtı alındı; simüle edilmiş devam tamamlandı.' } }));
    globalSqlite.recordEvent(createEvent({ taskId, sessionId: options.sessionId, agent: options.agent, type: 'task.completed' }));
    resolve();
  }, 500)) };
} };
const { server } = startWeb({ port, dbPath, runner: mockRunner, ingest: false, roots: [process.cwd()], configPath: path.join(dir, 'web.json'), opencodeListing: async () => 'opencode/big-pickle' });
await new Promise(r => server.once('listening', r));
let browser;
let context;
try {
  await client.connect(transport);
  globalSqlite.recordEvent(createEvent({ taskId: 'ui-browser-task', sessionId: 'ui-browser-session', agent: 'claude', type: 'task.started', data: { prompt: 'Örnek senaryo: görsel yanıtlar', cwd: process.cwd(), model: 'demo', executionPolicy: { sandbox: 'read-only', dangerouslySkipPermissions: false } } }));
  const spec = { version: 1, title: 'Ajan sonuçları, tek bir görünümde', summary: 'Örnek senaryo · Kartlar, grafikler ve hesaplayıcı aynı yanıt içinde. Bu ekran test verisi kullanır.', blocks: [
    { id: 'intro', type: 'card', title: 'Ortak bir görsel dil', text: 'Claude Code, Codex ve diğer MCP istemcileri aynı bileşenleri kullanır.', tone: 'success' },
    { id: 'status', type: 'card', title: 'Canlı güncellemeler', text: 'Yanıt, yeni revizyon geldiğinde bu sayfada kendiliğinden güncellenir.' },
    { id: 'chart', type: 'bar_chart', title: 'Örnek test dağılımı', items: [{ label: 'Başarılı', value: 48 }, { label: 'Başarısız', value: 2 }, { label: 'Ölçülmedi', value: null }] },
    { id: 'calculator', type: 'form', title: 'Etkileşimli hesaplayıcı', fields: [{ id: 'amount', type: 'number', label: 'Tutar (TL)', value: 200, required: true }, { id: 'rate', type: 'number', label: 'Oran (%)', value: 20, required: true }, { id: 'note', type: 'text', label: 'Not', value: '' }], calculation: { operation: 'percentage', inputs: ['amount', 'rate'], label: 'Hesaplanan tutar', unit: 'TL' }, submitLabel: 'Sonucu ajana ilet' },
    { id: 'table', type: 'table', title: 'Aynı sözleşme, farklı yüzeyler', columns: ['Yüzey', 'Gösterim', 'Etkileşim'], rows: [['CLI', 'Metin özeti + bağlantı', 'MCP araçları'], ['Observatory', 'Kart + grafik + form', 'Anlık hesaplama ve yanıt']] },
    { id: 'flow', type: 'diagram', title: 'Yanıtın yolculuğu', nodes: [{ id: 'agent', label: 'CLI ajanı' }, { id: 'spec', label: 'Doğrulanmış UI' }, { id: 'browser', label: 'Observatory' }], edges: [{ from: 'agent', to: 'spec', label: 'MCP' }, { from: 'spec', to: 'browser', label: 'SQLite + SSE' }] },
    { id: 'safe', type: 'text', text: 'Form yanıtları kaydedilir ve ui_read ile okunur. Hesaplama yereldir; modelden gelen kod çalıştırılmaz.' }
  ] };
  const published = await client.callTool({ name: 'ui_publish', arguments: { id: 'visual-demo', taskId: 'ui-browser-task', agent: 'claude', spec } });
  assert.ok(!published.isError, JSON.stringify(published));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, recordVideo: { dir: out, size: { width: 1440, height: 1080 } } });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/visual.html?id=visual-demo`);
  await page.getByRole('heading', { name: spec.title }).waitFor();
  await page.screenshot({ path: path.join(out, '01-visual-answer.png'), fullPage: true });
  await page.waitForTimeout(1800);
  await page.getByLabel('Tutar (TL)').fill('350');
  await page.getByText('Hesaplanan tutar: 70 TL', { exact: true }).waitFor();
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: 'Sonucu ajana ilet' }).click();
  await page.getByText('Yanıt kaydedildi. Ajan tarafından okunabilir.', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(out, '02-form-submitted.png'), fullPage: true });
  const read = await client.callTool({ name: 'ui_read', arguments: { id: 'visual-demo' } });
  assert.equal(read.structuredContent.actions[0].values.amount, 350);
  await page.getByLabel('Tutar (TL)').fill('375'); // unsent edits must survive a server revision
  await page.getByLabel('Not', { exact: true }).fill('taslak notu');
  await page.getByLabel('Not', { exact: true }).evaluate(input => input.setSelectionRange(2, 5));
  await page.waitForTimeout(1600);
  assert.deepEqual(await page.getByLabel('Not', { exact: true }).evaluate(input => [input === document.activeElement, input.selectionStart, input.selectionEnd]), [true, 2, 5], 'selection must be established before the revision');
  const next = structuredClone(spec);
  next.summary = 'Canlı güncelleme alındı · Formdaki 350 TL ve %20 girdisi ajana ulaştı. Hesaplanan tutar: 70 TL.';
  next.blocks.find(b => b.id === 'calculator').fields[0].value = 350;
  const updated = await client.callTool({ name: 'ui_update', arguments: { id: 'visual-demo', expectedRevision: 1, spec: next } });
  assert.ok(!updated.isError);
  await page.getByText(next.summary, { exact: true }).waitFor();
  await page.getByText('Sürüm 2', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Tutar (TL)').inputValue(), '375');
  assert.deepEqual(await page.getByLabel('Not', { exact: true }).evaluate(input => [input === document.activeElement, input.selectionStart, input.selectionEnd]), [true, 2, 5]);
  await page.screenshot({ path: path.join(out, '03-live-update.png'), fullPage: true });
  await page.waitForTimeout(2000);
  await page.reload(); await page.getByText('Sürüm 2', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Tutar (TL)').inputValue(), '375');
  // Check XSS safety with real DOM, not only schema assertions.
  await page.evaluate(() => {
    const element = ObsUI.render({ id: 'safe', agent: 'codex', revision: 1, spec: { title: '<img src=x onerror=alert(1)>', summary: '', blocks: [{ id: 'x', type: 'text', text: '<script>window.__uiXss=1</script>' }] } });
    document.body.append(element); if (element.querySelector('script,img')) throw new Error('Unsafe model markup'); element.remove();
  });
  // Main chat hydration from recorded task events, including a reload.
  globalSqlite.recordEvent(createEvent({ taskId: 'ui-browser-task', sessionId: 'ui-browser-session', agent: 'claude', type: 'task.completed', data: {} }));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByText('Örnek senaryo: görsel yanıtlar', { exact: true }).first().click();
  await page.locator('#thread .iui-document h2').filter({ hasText: spec.title }).waitFor();
  await page.waitForTimeout(300);
  await page.locator('#main').evaluate(e => { e.scrollTop = 0; });
  await page.screenshot({ path: path.join(out, '04-inline-chat.png'), fullPage: true });
  await page.waitForTimeout(2000);
  await page.reload();
  await page.getByText('Örnek senaryo: görsel yanıtlar', { exact: true }).first().click();
  await page.locator('#thread .iui-document h2').filter({ hasText: spec.title }).waitFor();
  const sessionOnly = await client.callTool({ name: 'ui_publish', arguments: { id: 'session-only', sessionId: 'ui-browser-session', agent: 'claude', spec: { version: 1, title: 'Oturuma bağlı ek yanıt', summary: 'Görev kimliği olmadan yayınlanan yanıt da aynı sohbetle ilişkilendirilir.', blocks: [{ id: 'card', type: 'card', text: 'Oturum bağlantısı doğrulandı.' }] } } });
  assert.ok(!sessionOnly.isError);
  await page.locator('#thread .iui-document h2').filter({ hasText: 'Oturuma bağlı ek yanıt' }).waitFor();
  await page.goto(`http://127.0.0.1:${port}/visual.html?id=visual-demo`);
  await page.getByLabel('Tutar (TL)').fill('600');
  await page.getByRole('checkbox', { name: 'Gönderince ajan aynı oturum ve izinlerle devam etsin' }).check();
  await page.getByRole('button', { name: 'Sonucu ajana ilet' }).click();
  await page.getByText('Sürüm 3', { exact: true }).waitFor();
  await page.getByText('Ajan devam görevini tamamladı.', { exact: true }).waitFor();
  assert.equal(continuations.length, 1); assert.equal(continuations[0].sessionId, 'ui-browser-session');
  assert.equal(continuations[0].dangerouslySkipPermissions, false); assert.equal(continuations[0].autoFailover, false);
  assert.equal(await page.getByLabel('Tutar (TL)').inputValue(), '600');
  await page.screenshot({ path: path.join(out, '06-continuation.png'), fullPage: true });
  await page.waitForTimeout(1600); await page.reload();
  await page.getByText('Ajan devam görevini tamamladı.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Tutar (TL)').inputValue(), '600');
  assert.deepEqual(errors, []);
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1, recordVideo: { dir: out, size: { width: 390, height: 844 } } });
  const phone = await mobile.newPage(); await phone.goto(`http://127.0.0.1:${port}/visual.html?id=visual-demo`);
  await phone.getByText('Sürüm 3', { exact: true }).waitFor();
  assert.equal(await phone.getByLabel('Tutar (TL)').inputValue(), '600', 'saved server response restores in a fresh context');
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await phone.screenshot({ path: path.join(out, '05-mobile.png'), fullPage: true });
  await phone.waitForTimeout(1600);
  await phone.getByLabel('Tutar (TL)').fill('500');
  await phone.getByText('Hesaplanan tutar: 100 TL', { exact: true }).waitFor();
  await phone.waitForTimeout(1300);
  await phone.getByRole('button', { name: 'Sonucu ajana ilet' }).click();
  await phone.getByText('Yanıt kaydedildi. Ajan tarafından okunabilir.', { exact: true }).waitFor();
  await phone.waitForTimeout(1800);
  const mobileVideo = await phone.video().path(); await mobile.close();
  fs.renameSync(mobileVideo, path.join(out, 'intelligent-ui-mobile.webm'));
  const videoPath = await page.video().path(); await context.close(); context = undefined;
  fs.renameSync(videoPath, path.join(out, 'intelligent-ui-demo.webm'));
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ passed: true, liveProviderCalls: 0, mockedContinuations: continuations.length, checked: ['MCP publish/read/update', 'real form submission', 'local calculation', 'SSE revision update', 'draft preservation across revisions and reload', 'saved response restored in fresh browser context', 'mocked same-session continuation', 'continuation status after reload', 'inline chat hydration', 'session-only association', 'XSS text rendering', 'mobile interaction and overflow'], browserErrors: errors }, null, 2));
  console.log(`PASS: browser recording and screenshots: ${out}`);
} finally {
  if (context) await context.close(); if (browser) await browser.close();
  await client.close(); await new Promise(r => server.close(r)); globalSqlite.close();
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
