import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  getClaudeSessionMapPath,
  resolveClaudeSessionId,
  updateClaudeSessionId
} from '../src/core/claude_session_manager.ts';

console.log('🧪 Testing ClaudeSessionManager...');

const testCwd = 'C:\\Users\\Kullanici\\Desktop\\GitHub\\Public\\GravityGuard';
const testSessionId = 'e51dd8ae-022c-43e5-ae41-6ec94b71e973';

// 1. Update session map
updateClaudeSessionId(testCwd, testSessionId, 'GravityGuard Test Session');

// 2. Resolve auto
const resolved = resolveClaudeSessionId(testCwd);
assert.strictEqual(resolved, testSessionId, 'Auto resolution should return the mapped claude_session_id');

// 3. Explicit 'new' should bypass
const fresh = resolveClaudeSessionId(testCwd, 'new');
assert.strictEqual(fresh, null, 'Explicit "new" should return null for a brand new session');

// 4. Explicit custom ID should be respected
const customId = '11111111-2222-3333-4444-555555555555';
const explicit = resolveClaudeSessionId(testCwd, customId);
assert.strictEqual(explicit, customId, 'Explicit custom session ID should be returned as is');

console.log('✔ All ClaudeSessionManager tests passed successfully!');
