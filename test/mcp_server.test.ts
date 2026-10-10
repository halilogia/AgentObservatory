import assert from 'node:assert';
import { formatTaskReport } from '../src/mcp/mcp_server.ts';

const summary = {
  agent: 'claude',
  model: 'sonnet',
  status: 'completed',
  durationMs: 4200,
  taskId: 'task-mcp-test',
  sessionId: 'sess-mcp-test',
  usage: { inputTokens: 500, cachedTokens: 0, outputTokens: 250, reasoningTokens: 50, totalTokens: 800 },
  toolsUsed: [
    { name: 'Edit', input: { file_path: 'src/file1.ts', old_string: 'a' } },
    { name: 'Write', input: { path: 'src/file2.ts', content: 'b' } }
  ],
  assistantText: 'Test yanıt metni'
};

const report = formatTaskReport(summary);
assert.ok(report.includes('CLAUDE'), 'Ajan adı raporda yer almalı');
assert.ok(report.includes('task-mcp-test'), 'Görev ID raporda yer almalı');
assert.ok(report.includes('src/file1.ts'), 'Değiştirilen dosya raporda yer almalı');
assert.ok(report.includes('Test yanıt metni'), 'Yanıt metni raporda yer almalı');

console.log('✔ mcp_server.test.ts başarıyla geçti!');
