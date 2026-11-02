import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TasteStore } from '../src/core/taste_store.ts';

test('TasteStore parses markdown and confidence scores correctly', () => {
  const tmpDir = path.join(os.tmpdir(), `taste_test_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const rootTaste = path.join(tmpDir, 'taste.md');
  fs.writeFileSync(rootTaste, `# Taste
- Prefer const over let. Confidence: 0.90
- Always use typed GDScript. Confidence: 0.85

# UI
- Do not use accordions for archives. Confidence: 0.80
`, 'utf-8');

  const historyFile = path.join(tmpDir, 'taste_history.jsonl');
  fs.writeFileSync(historyFile, JSON.stringify({
    timestamp: Date.now(),
    sessionId: 'session_abc_123',
    agent: 'antigravity',
    has_preference: true,
    category: 'UI',
    preference: 'Do not use accordions for archives.',
    confidence: 0.80,
    reason: 'Explicit correction'
  }) + '\n', 'utf-8');

  const store = new TasteStore(tmpDir);
  const rules = store.getRules();

  assert.strictEqual(rules.length, 3);
  assert.strictEqual(rules[0].category, 'Taste');
  assert.strictEqual(rules[0].confidence, 0.90);
  assert.strictEqual(rules[1].confidence, 0.85);
  assert.strictEqual(rules[2].category, 'UI');
  assert.strictEqual(rules[2].confidence, 0.80);

  // Test getSessionTastes
  const sessionTastes = store.getSessionTastes('session_abc_123');
  assert.strictEqual(sessionTastes.length, 1);
  assert.strictEqual(sessionTastes[0].category, 'UI');

  // Prefix matching
  const prefixTastes = store.getSessionTastes('session_abc');
  assert.strictEqual(prefixTastes.length, 1);

  // Test deletion
  const deleted = store.deleteRule('UI', 'Do not use accordions for archives');
  assert.strictEqual(deleted, true);
  assert.strictEqual(store.getRules().length, 2);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
