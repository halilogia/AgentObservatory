import assert from 'node:assert';
import test from 'node:test';
import { ClaudeAdapter } from '../src/adapters/claude_adapter.ts';
import { CodexAdapter } from '../src/adapters/codex_adapter.ts';
import { AgyAdapter } from '../src/adapters/agy_adapter.ts';
import { OpenCodeAdapter } from '../src/adapters/opencode_adapter.ts';
import { CommandCodeAdapter } from '../src/adapters/commandcode_adapter.ts';
import { FreebuffAdapter } from '../src/adapters/freebuff_adapter.ts';
import type { BaseAdapter } from '../src/adapters/base_adapter.ts';
import type { AgentCapability } from '../src/core/mission_types.ts';

test('AgentAdapter Capabilities & Discovery Test Suite', async (t) => {
  const adapters: Record<string, BaseAdapter> = {
    claude: new ClaudeAdapter(),
    codex: new CodexAdapter(),
    agy: new AgyAdapter(),
    opencode: new OpenCodeAdapter(),
    commandcode: new CommandCodeAdapter(),
    freebuff: new FreebuffAdapter()
  };

  await t.test('All 6 adapters instantiate with correct names and non-empty capabilities', () => {
    for (const [name, adapter] of Object.entries(adapters)) {
      assert.strictEqual(adapter.name, name, `${name} adı doğru tanımlanmalı`);
      const caps = adapter.getCapabilities();
      assert.ok(Array.isArray(caps), `${name} yetenek listesi dizi olmalı`);
      assert.ok(caps.length > 0, `${name} en az bir yetenek bildirmeli`);
    }
  });

  await t.test('supports() accurately detects capabilities and prevents false capabilities', () => {
    // Claude & Codex support structured approval and session pause
    assert.strictEqual(adapters.claude.supports('approval.structured'), true);
    assert.strictEqual(adapters.claude.supports('session.pause'), true);
    assert.strictEqual(adapters.codex.supports('approval.structured'), true);
    assert.strictEqual(adapters.codex.supports('session.pause'), true);

    // OpenCode and AGY do NOT support structured interactive approval (prevents false capability illusion)
    assert.strictEqual(adapters.opencode.supports('approval.structured'), false);
    assert.strictEqual(adapters.opencode.supports('session.pause'), false);
    assert.strictEqual(adapters.agy.supports('approval.structured'), false);
    assert.strictEqual(adapters.agy.supports('session.pause'), false);

    // CommandCode supports model switching and terminal execution
    assert.strictEqual(adapters.commandcode.supports('model.switch'), true);
    assert.strictEqual(adapters.commandcode.supports('terminal.execute'), true);
    assert.strictEqual(adapters.commandcode.supports('approval.structured'), false);

    // Freebuff is read/batch focused and does not support code write
    assert.strictEqual(adapters.freebuff.supports('review.readonly'), true);
    assert.strictEqual(adapters.freebuff.supports('batch.process'), true);
    assert.strictEqual(adapters.freebuff.supports('code.write'), false);

    // AGY supports browser inspection
    assert.strictEqual(adapters.agy.supports('browser.inspect'), true);
  });

  await t.test('probe() returns full AgentDescriptor with verified controls and metadata', async () => {
    for (const [name, adapter] of Object.entries(adapters)) {
      const descriptor = await adapter.probe();
      assert.strictEqual(descriptor.agent, name);
      assert.ok(descriptor.displayName && descriptor.displayName.length > 0);
      assert.strictEqual(typeof descriptor.isAvailable, 'boolean');
      assert.ok(Array.isArray(descriptor.capabilities));
      assert.ok(descriptor.supportedControls !== undefined);
      assert.ok(typeof descriptor.probedAt === 'number');

      // Specific control checks
      if (name === 'claude' || name === 'codex') {
        assert.strictEqual(descriptor.supportedControls.supportsStructuredApproval, true);
        assert.strictEqual(descriptor.supportedControls.canPause, true);
        assert.strictEqual(descriptor.supportedControls.canResume, true);
        assert.strictEqual(descriptor.supportedControls.canInspectDiff, true);
      } else {
        assert.strictEqual(descriptor.supportedControls.supportsStructuredApproval, false);
      }
    }
  });

  await t.test('probe() caches descriptor and returns instantly on second call', async () => {
    const t0 = performance.now();
    const d1 = await adapters.claude.probe();
    const d2 = await adapters.claude.probe();
    const duration = performance.now() - t0;
    assert.strictEqual(d1, d2, 'İkinci probe çağrısı önbellekteki aynı nesneyi döndürmeli');
    assert.ok(duration < 20, `Önbellekten probe 20ms altında dönmeli (Ölçülen: ${duration.toFixed(2)}ms)`);
  });

  await t.test('Capability filtering can safely discover matching agents for contracts', () => {
    const findSupporting = (cap: AgentCapability) =>
      Object.entries(adapters)
        .filter(([_, a]) => a.supports(cap))
        .map(([name]) => name);

    const approvalAgents = findSupporting('approval.structured');
    assert.deepStrictEqual(approvalAgents.sort(), ['claude', 'codex'].sort());

    const browserAgents = findSupporting('browser.inspect');
    assert.deepStrictEqual(browserAgents, ['agy']);

    const batchAgents = findSupporting('batch.process');
    assert.deepStrictEqual(batchAgents.sort(), ['freebuff', 'opencode'].sort());

    const writeAgents = findSupporting('code.write');
    assert.deepStrictEqual(writeAgents.sort(), ['agy', 'claude', 'codex', 'commandcode', 'opencode'].sort());
  });
});
