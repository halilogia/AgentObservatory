import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaudeAdapter } from '../src/adapters/claude_adapter.ts';
import { CodexAdapter } from '../src/adapters/codex_adapter.ts';
import { OpenCodeAdapter } from '../src/adapters/opencode_adapter.ts';
import { AgyAdapter } from '../src/adapters/agy_adapter.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

test('Model and Thinking Effort Session Continuity across all CLI adapters', async (t) => {
  await t.test('ClaudeAdapter: preserves session while switching model and thinking effort', () => {
    const adapter = new ClaudeAdapter();
    const sessionId = 'claude-sess-xyz-123';
    const cwd = ROOT;

    // Tur 1: Sonnet ile başlat
    const turn1 = adapter.buildCommand({
      prompt: 'Tur 1 sorusu',
      cwd,
      sessionId,
      model: 'claude-sonnet-5-5',
      effort: 'medium'
    });
    assert.ok(turn1.args.includes('--resume'), 'İlk turda resume bayrağı olmalı');
    assert.ok(turn1.args.includes(sessionId), 'Oturum kimliği korunmalı');
    assert.ok(turn1.args.includes('--model') && turn1.args.includes('claude-sonnet-5-5'));
    assert.ok(turn1.args.includes('--effort') && turn1.args.includes('medium'));

    // Tur 2: Opus modeline ve max çabaya geç (Aynı oturum sürdürülmeli!)
    const turn2 = adapter.buildCommand({
      prompt: 'Tur 2 sorusu (model değişti)',
      cwd,
      sessionId,
      model: 'claude-opus-5-5',
      effort: 'max'
    });
    assert.ok(turn2.args.includes('--resume'), 'Model değiştiğinde oturum KOPMAMALI, --resume kalmalı');
    assert.ok(turn2.args.includes(sessionId), 'Aynı oturum kimliği aktarılmalı');
    assert.ok(turn2.args.includes('--model') && turn2.args.includes('claude-opus-5-5'), 'Yeni model bayrağı geçmeli');
    assert.ok(turn2.args.includes('--effort') && turn2.args.includes('max'), 'Yeni çaba bayrağı geçmeli');
  });

  await t.test('CodexAdapter: preserves thread while switching model and effort', () => {
    const adapter = new CodexAdapter();
    const sessionId = 'thread-codex-abc-789';
    const cwd = ROOT;

    // Tur 1: gpt-6-astra + medium
    const turn1 = adapter.buildCommand({
      prompt: 'Codex tur 1',
      cwd,
      sessionId,
      model: 'gpt-6-astra',
      effort: 'medium'
    });
    assert.equal(turn1.args[0], 'exec');
    assert.equal(turn1.args[1], 'resume');
    assert.equal(turn1.args[2], sessionId);
    assert.ok(turn1.args.includes('--model') && turn1.args.includes('gpt-6-astra'));
    assert.ok(turn1.args.includes('-c') && turn1.args.includes('model_reasoning_effort="medium"'));

    // Tur 2: ultra effort'a geç (Oturum devam etmeli)
    const turn2 = adapter.buildCommand({
      prompt: 'Codex tur 2 (ultra effort)',
      cwd,
      sessionId,
      model: 'gpt-6-astra',
      effort: 'ultra'
    });
    assert.equal(turn2.args[1], 'resume', 'Codex exec resume ile oturumu korumalı');
    assert.equal(turn2.args[2], sessionId, 'Aynı sessionId aktarılmalı');
    assert.ok(turn2.args.includes('-c') && turn2.args.includes('model_reasoning_effort="ultra"'), 'Yeni ultra çaba ayarı iletilmeli');
  });

  await t.test('OpenCodeAdapter: preserves session while switching free models', () => {
    const adapter = new OpenCodeAdapter();
    const sessionId = 'opencode-session-456';
    const cwd = ROOT;

    // Tur 1: big-pickle
    const turn1 = adapter.buildCommand({
      prompt: 'OpenCode tur 1',
      cwd,
      sessionId,
      model: 'opencode/big-pickle'
    });
    assert.ok(turn1.args.includes('--session') && turn1.args.includes(sessionId));
    assert.ok(turn1.args.includes('--model') && turn1.args.includes('opencode/big-pickle'));

    // Tur 2: deepseek-v4-flash
    const turn2 = adapter.buildCommand({
      prompt: 'OpenCode tur 2',
      cwd,
      sessionId,
      model: 'opencode/deepseek-v4-flash'
    });
    assert.ok(turn2.args.includes('--session'), 'OpenCode --session ile hafızayı korumalı');
    assert.ok(turn2.args.includes(sessionId), 'Aynı oturum kimliği aktarılmalı');
    assert.ok(turn2.args.includes('--model') && turn2.args.includes('opencode/deepseek-v4-flash'), 'Yeni modele geçilmeli');
  });

  await t.test('AgyAdapter: preserves conversation while switching model', () => {
    const adapter = new AgyAdapter();
    const sessionId = 'agy-conv-777';
    const cwd = ROOT;

    const turn1 = adapter.buildCommand({
      prompt: 'Agy tur 1',
      cwd,
      sessionId,
      model: 'gemini-3.8-flash-low'
    });
    assert.ok(turn1.args.includes('--conversation') && turn1.args.includes(sessionId));
    assert.ok(turn1.args.includes('--model') && turn1.args.includes('gemini-3.8-flash-low'));

    // Tur 2: high modeline geç
    const turn2 = adapter.buildCommand({
      prompt: 'Agy tur 2',
      cwd,
      sessionId,
      model: 'gemini-3.8-flash-high'
    });
    assert.ok(turn2.args.includes('--conversation'), 'Agy --conversation ile oturumu korumalı');
    assert.ok(turn2.args.includes(sessionId));
    assert.ok(turn2.args.includes('--model') && turn2.args.includes('gemini-3.8-flash-high'));
  });
});

test('Web UI [+] Attach Menu & Elements Integrity', () => {
  const html = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');

  // Hantal projectBtn kaldırılmış olmalı
  assert.ok(!html.includes('id="projectBtn"'), 'Hantal #projectBtn HTML içinden tamamen kaldırılmış olmalı');

  // Yeni [+] düğmesi ve ekle menüsü bulunmalı
  assert.ok(html.includes('id="attachBtn"'), '#attachBtn butonu bulunmalı');
  assert.ok(html.includes('id="attachMenu"'), '#attachMenu menüsü bulunmalı');
  assert.ok(html.includes('id="attachFiles"'), '#attachFiles öğesi bulunmalı');
  assert.ok(html.includes('id="attachFolder"'), '#attachFolder öğesi bulunmalı');
  assert.ok(html.includes('id="filePicker"'), '#filePicker dosya seçici bulunmalı');

  // Önbellek kırıcı sürüm parametreleri bulunmalı
  assert.ok(html.includes('/app.js?v='), 'app.js önbellek kırma parametresine sahip olmalı');
  assert.ok(html.includes('/app.css?v='), 'app.css önbellek kırma parametresine sahip olmalı');
});
