import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CommandCodeAdapter } from '../src/adapters/commandcode_adapter.ts';
import { EventStore } from '../src/core/event_store.ts';
import { SqliteStore } from '../src/core/sqlite_store.ts';
import { createEvent } from '../src/core/types.ts';
import { resolveBinary } from '../src/core/paths.ts';
import { AgentRunner } from '../src/runtime/agent_runner.ts';

function fixture() {
  const db = new SqliteStore(':memory:');
  const store = new EventStore({ sqliteStore: db });
  const adapter = new CommandCodeAdapter();
  const taskId = 'commandcode-test';
  store.recordEvent(createEvent({ taskId, agent: 'commandcode', type: 'task.started' }));
  return { db, store, adapter, taskId,
    send: (frame: unknown) => adapter.handleStdoutLine(JSON.stringify(frame), taskId, store),
    event: (event: unknown) => adapter.handleStdoutLine(JSON.stringify({ type: 'event', event }), taskId, store) };
}

test('builds headless JSON command with cwd, resume, model and effort; preserves argv', () => {
  const old = process.env.COMMANDCODE_BIN;
  process.env.COMMANDCODE_BIN = process.execPath;
  try {
    const adapter = new CommandCodeAdapter();
    const prompt = 'Review "a & b"\n%PATH% $(whoami) | echo untouched';
    const cmd = adapter.buildCommand({ prompt, cwd: '.', sessionId: 'session-1', model: 'model-1', effort: 'high' });
    assert.equal(cmd.exe, process.execPath);
    assert.deepEqual(cmd.args, ['--print', prompt, '--output-format', 'json', '--skip-onboarding', '--no-auto-update', '--resume', 'session-1', '--model', 'model-1', '--effort', 'high']);
    assert.equal(cmd.cwd, process.cwd());
    assert.notEqual(cmd.env, process.env);
    assert.throws(() => adapter.buildCommand({ prompt: 'x', cwd: path.join(process.cwd(), 'missing-commandcode-directory') }), /cwd/);
    const read = adapter.buildCommand({ prompt: 'x', sandbox: 'read-only', dangerouslySkipPermissions: true });
    assert.ok(read.args.includes('plan'));
    assert.ok(!read.args.includes('--yolo'));
    assert.ok(adapter.buildCommand({ prompt: 'x', dangerouslySkipPermissions: true }).args.includes('--yolo'));
    assert.ok(!adapter.buildCommand({ prompt: 'x' }).args.includes('--yolo'));
  } finally { if (old === undefined) delete process.env.COMMANDCODE_BIN; else process.env.COMMANDCODE_BIN = old; }
});

test('native NDJSON deltas, session, tools and final result aggregate without duplicates', () => {
  const f = fixture();
  try {
    f.event({ type: 'run_start', sessionId: 'session-1' });
    f.event({ type: 'text_delta', delta: 'O' });
    f.event({ type: 'text_delta', delta: 'K' });
    f.event({ type: 'tool_queued', toolCallId: 'call-1', toolName: 'read_file', input: { path: 'a.ts' } });
    f.event({ type: 'tool_running', toolCallId: 'call-1', toolName: 'read_file' });
    f.event({ type: 'tool_completed', toolCallId: 'call-1', toolName: 'read_file', result: 'contents' });
    f.send({ type: 'result', subtype: 'success', sessionId: 'session-1', finalText: 'OK', stopReason: 'end_turn', usage: { inputTokens: 8, outputTokens: 2 } });
    assert.equal(f.store.getTask(f.taskId)!.status, 'running', 'success waits for process exit');
    f.adapter.handleExit(0, f.taskId, f.store, '');
    f.adapter.handleExit(0, f.taskId, f.store, '');
    const task = f.store.getTask(f.taskId)!;
    assert.equal(task.status, 'completed');
    assert.equal(task.sessionId, 'session-1');
    assert.equal(task.assistantText, 'OK');
    assert.equal(task.toolsUsed.length, 1);
    assert.equal(task.toolsUsed[0].name, 'read_file');
    assert.deepEqual(task.toolsUsed[0].input, { path: 'a.ts' });
    assert.equal(task.usage.totalTokens, 10);
    const events = f.store.getEvents(f.taskId);
    assert.equal(events.filter((e) => e.type === 'task.completed').length, 1);
    assert.ok(events.some((e) => e.type === 'turn.completed'));
    assert.equal(events.find((e) => e.type === 'tool.completed')!.data.result, 'contents');
    assert.equal(f.db.getTask(f.taskId)!.assistantText, 'OK');
  } finally { f.db.close(); }
});

test('final-only output, plain text, malformed JSON, and unknown frames are safe', () => {
  const f = fixture();
  try {
    for (const line of ['', '  ', 'null', '[]', '42', '{"type":"event","event":null}', '{"type":"future_event"}']) f.adapter.handleStdoutLine(line, f.taskId, f.store);
    assert.equal(f.store.getTask(f.taskId)!.assistantText, '');
    f.adapter.handleStdoutLine('  plain output', f.taskId, f.store);
    f.adapter.handleStdoutLine('{broken', f.taskId, f.store);
    f.send({ type: 'result', subtype: 'success', finalText: 'Final answer' });
    f.adapter.handleExit(0, f.taskId, f.store, '');
    assert.equal(f.store.getTask(f.taskId)!.assistantText, '  plain output\n{broken\nFinal answer');
  } finally { f.db.close(); }
});

test('tool failures retain identity and output, including falsy results', () => {
  const f = fixture();
  try {
    f.event({ type: 'tool_running', toolCallId: 'a', toolName: 'shell' });
    f.event({ type: 'tool_errored', toolCallId: 'a', toolName: 'shell', error: 'failed' });
    f.event({ type: 'tool_completed', toolCallId: 'b', toolName: 'check', result: false });
    const events = f.store.getEvents(f.taskId).filter((e) => e.type === 'tool.completed');
    assert.deepEqual(events[0].data, { id: 'a', name: 'shell', result: 'failed', error: true });
    assert.equal(events[1].data.result, false);
  } finally { f.db.close(); }
});

for (const [code, stderr, kind] of [
  [1, '429 rate limit; retry in 20 seconds', 'rate_limit'], [3, '', 'auth'],
  [4, '', 'permission'], [5, '', 'rate_limit'], [10, '', 'rate_limit'],
  [1, 'model demo not supported', 'model_unsupported'], [1, 'spawn ENOENT', 'spawn_failed'],
  [8, '', 'unknown'], [null, '', 'unknown'], [1, 'unexpected failure', 'unknown']
] as const) test(`exit ${code}: ${kind} (${stderr || 'code only'})`, () => {
  const f = fixture();
  try {
    f.send({ type: 'result', subtype: 'success', finalText: 'Partial answer' });
    f.adapter.handleExit(code, f.taskId, f.store, stderr);
    const failure = f.store.getEvents(f.taskId).find((e) => e.type === 'task.failed')!;
    assert.equal(f.store.getTask(f.taskId)!.status, 'failed');
    assert.equal(failure.data.exitCode, code);
    assert.equal(failure.data.errorKind, kind);
    if (stderr.includes('20 seconds')) assert.equal(failure.data.cooldownMs, 20000);
  } finally { f.db.close(); }
});

for (const subtype of ['error', 'max_turns']) test(`structured ${subtype} remains failed even on exit 0`, () => {
  const f = fixture();
  try {
    f.send({ type: 'result', subtype, ...(subtype === 'error' ? { error: { message: 'Invalid API key' } } : {}) });
    f.adapter.handleExit(0, f.taskId, f.store, '');
    const failure = f.store.getEvents(f.taskId).find((e) => e.type === 'task.failed')!;
    assert.equal(failure.data.exitCode, 0);
    assert.equal(failure.data.errorKind, subtype === 'error' ? 'auth' : 'unknown');
  } finally { f.db.close(); }
});

test('run errors and cancellation stay isolated across tasks on a shared adapter', () => {
  const f = fixture();
  try {
    f.event({ type: 'run_error', error: { message: 'Unauthorized 401' } });
    const other = 'other';
    f.store.recordEvent(createEvent({ taskId: other, agent: 'commandcode', type: 'task.started' }));
    f.adapter.handleExit(0, other, f.store, '');
    assert.equal(f.store.getTask(other)!.status, 'completed');
    f.store.recordEvent(createEvent({ taskId: f.taskId, agent: 'commandcode', type: 'task.cancelled' }));
    f.adapter.handleExit(1, f.taskId, f.store, '');
    f.event({ type: 'text_delta', delta: 'late output' });
    assert.equal(f.store.getTask(f.taskId)!.status, 'cancelled');
    assert.equal(f.store.getTask(f.taskId)!.assistantText, '');
    assert.equal(f.store.getEvents(f.taskId).filter((e) => e.type === 'task.failed').length, 0);
    assert.doesNotThrow(() => f.adapter.handleExit(null, 'missing', f.store, ''));
  } finally { f.db.close(); }
});

test('resolves PATH binaries and runs Windows npm shim entry without shell interpolation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-commandcode-'));
  const saved = { PATH: process.env.PATH, APPDATA: process.env.APPDATA, COMMANDCODE_BIN: process.env.COMMANDCODE_BIN, OBSERVATORY_NO_AUTO_TUI: process.env.OBSERVATORY_NO_AUTO_TUI };
  const db = new SqliteStore(':memory:');
  try {
    delete process.env.COMMANDCODE_BIN;
    process.env.PATH = dir;
    process.env.APPDATA = dir;
    process.env.OBSERVATORY_NO_AUTO_TUI = '1';
    assert.equal(resolveBinary('commandcode'), 'commandcode');
    const binary = path.join(dir, process.platform === 'win32' ? 'commandcode.cmd' : 'commandcode');
    fs.writeFileSync(binary, '');
    assert.equal(resolveBinary('commandcode'), binary);
    const shim = path.join(dir, 'commandcode.cmd');
    fs.writeFileSync(shim, '@echo off');
    process.env.COMMANDCODE_BIN = shim;
    const pkg = path.join(dir, 'node_modules', 'command-code');
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ bin: { 'command-code': 'cli.cjs' } }));
    fs.writeFileSync(path.join(pkg, 'cli.cjs'), `process.stdin.resume(); process.stdin.on('end', () => {
      console.log(JSON.stringify({type:'result', subtype:'success', sessionId:'fixture', finalText:JSON.stringify(process.argv.slice(2))}));
    });`);
    const prompt = '" & echo DONT_EXECUTE | %PATH%\nsecond line';
    const store = new EventStore({ sqliteStore: db });
    const runner = new AgentRunner(store);
    assert.ok(runner.getAdapter('COMMANDCODE') instanceof CommandCodeAdapter);
    const summary = await runner.runTask({ agent: 'commandcode', prompt, cwd: dir, timeoutSeconds: 10 });
    assert.equal(summary.status, 'completed');
    assert.equal(summary.sessionId, 'fixture');
    assert.deepEqual(JSON.parse(summary.assistantText), ['--print', prompt, '--output-format', 'json', '--skip-onboarding', '--no-auto-update']);
  } finally {
    db.close();
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
