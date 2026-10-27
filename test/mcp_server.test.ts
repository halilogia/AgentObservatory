import assert from 'node:assert';
import { formatTaskReport } from '../src/mcp/mcp_server.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

// Exercise the advertised schema and both handlers over a real stdio connection.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-mcp-commandcode-'));
const client = new Client({ name: 'commandcode-test', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath,
  args: ['--experimental-strip-types', path.resolve('src/cli.ts'), 'mcp'],
  env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    OBSERVATORY_DB: path.join(dir, 'test.sqlite'), OBSERVATORY_NO_INGEST: '1', OBSERVATORY_NO_AUTO_TUI: '1' }, stderr: 'pipe' });
transport.stderr?.on('data', () => {});
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  for (const name of ['run_agent', 'start_task']) {
    const schema = tools.find((tool) => tool.name === name)!.inputSchema;
    assert.ok((schema.properties!.agent as any).enum.includes('commandcode'), `${name} advertises commandcode`);
    const result = await client.callTool({ name, arguments: { agent: 'commandcode', prompt: 'x', cwd: path.join(dir, 'missing') } });
    assert.strictEqual(result.isError, true);
    assert.match(JSON.stringify(result.content), /cwd/, `${name} accepts the agent and reaches cwd validation`);
    assert.doesNotMatch(JSON.stringify(result.content), /Invalid arguments|Unsupported agent/);
  }
  console.log('✔ MCP stdio: Command Code accepted by run_agent and start_task');
} finally {
  await client.close();
  await transport.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
