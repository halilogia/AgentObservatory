import { BaseAdapter } from './base_adapter.ts';
import type { BuiltCommand, CommandOptions } from './base_adapter.ts';
import type { EventStore } from '../core/event_store.ts';
import type { AgentCapability, AgentDescriptor } from '../core/mission_types.ts';
import { createEvent } from '../core/types.ts';
import { resolveBinary, validateCwd } from '../core/paths.ts';

export class OpenCodeAdapter extends BaseAdapter {
  constructor() {
    super('opencode');
  }

  override getCapabilities(): AgentCapability[] {
    return [
      'code.read',
      'code.write',
      'terminal.execute',
      'git.inspect',
      'git.modify',
      'batch.process',
      'diff.inspect',
      'review.readonly',
      'model.switch'
    ];
  }

  override async probe(forceRefresh = false): Promise<AgentDescriptor> {
    if (!forceRefresh && this.cachedDescriptor) {
      return this.cachedDescriptor;
    }
    const info = this.probeBinary('opencode');
    const desc: AgentDescriptor = {
      agent: 'opencode',
      displayName: 'OpenCode AI',
      version: info.version,
      executablePath: info.exePath,
      isAvailable: info.isAvailable,
      capabilities: this.getCapabilities(),
      supportedControls: {
        canPause: false,
        canResume: false,
        canInspectDiff: true,
        supportsStructuredApproval: false,
        supportsStreamingJson: true,
        supportsModelSwitching: true
      },
      supportedModels: ['opencode/big-pickle', 'opencode/deepseek-v4.1-flash-free', 'opencode/gemini-2.5-flash'],
      probedAt: Date.now()
    };
    this.cachedDescriptor = desc;
    return desc;
  }

  buildCommand(opts: CommandOptions): BuiltCommand {
    const { prompt, cwd, sessionId, sandbox = 'workspace-write' } = opts;
    const validatedCwd = validateCwd(cwd);

    // OpenCode headless execution mode
    // --dir açık verilir: yalnızca süreç cwd'sine güvenince dosya üst klasöre yazıldı (gözlendi)
    const args: string[] = ['run', prompt, '--format', 'json', '--dir', validatedCwd];

    // İzin politikası (gerçek denemeyle doğrulandı, 2026-10-23):
    //  - read-only: yerleşik `plan` ajanı hiçbir dosyayı değiştiremez.
    //  - diğerleri: dosya düzenleme açık, kabuk komutu ve web erişimi kapalı (OPENCODE_CONFIG_CONTENT).
    // `dangerouslySkipPermissions` OpenCode'da KARŞILIKSIZ: otomatik onay bayrağı bilinçli olarak eklenmedi.
    const readOnly = sandbox === 'read-only';
    if (readOnly) {
      args.push('--agent', 'plan');
    }

    if (sessionId) {
      args.push('--session', sessionId);
    }

    // opencode varsayılan sağlayıcısı ("codex") kimlik bilgisiz: açık model şart
    args.push('--model', opts.model || process.env.OPENCODE_DEFAULT_MODEL || 'opencode/big-pickle');

    return {
      exe: resolveBinary('opencode'),
      args,
      cwd: validatedCwd,
      env: Object.assign(
        {},
        process.env,
        readOnly ? {} : { OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: { edit: 'allow', bash: 'deny', webfetch: 'deny' } }) }
      )
    };
  }

  handleStdoutLine(line: string, taskId: string, store: EventStore): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Non-JSON standard terminal line
      store.recordEvent(createEvent({
        taskId,
        agent: 'opencode',
        tier: 1,
        type: 'message.delta',
        data: { text: trimmed + '\n' }
      }));
      return;
    }

    const task = store.getTask(taskId);
    // gerçek `--format json` satırları üst düzeyde sessionID taşır: oturum devamı (--session) için kaydedilir
    const sessionId = (typeof parsed.sessionID === 'string' && parsed.sessionID) || (task ? task.sessionId : null);

    if (parsed.type === 'step_start') {
      return; // gerçek `--format json` akışında yalnızca adım işareti
    }
    if (parsed.type === 'step_finish' && parsed.part && parsed.part.tokens) {
      store.recordEvent(createEvent({ taskId, sessionId, agent: 'opencode', tier: 1, type: 'usage.updated', data: { usage: parsed.part.tokens } }));
      return;
    }
    if (parsed.type === 'message' || parsed.type === 'text' || parsed.content) {
      const text = parsed.content || parsed.text || (parsed.part && parsed.part.text) || '';
      if (text) {
        store.recordEvent(createEvent({
          taskId,
          sessionId,
          agent: 'opencode',
          tier: 1,
          type: 'message.delta',
          data: { text }
        }));
      }
    } else if (parsed.type === 'tool_use' || parsed.type === 'tool_call' || parsed.tool) {
      // Gerçek biçim: {type:'tool_use', part:{tool:'write', state:{status, input, output}}}
      const part = parsed.part || {};
      const state = part.state || {};
      const toolName = parsed.name || parsed.tool || part.tool || 'unknown';
      store.recordEvent(createEvent({
        taskId,
        sessionId,
        agent: 'opencode',
        tier: 1,
        type: 'tool.invoked',
        data: {
          name: toolName,
          input: parsed.input || parsed.args || state.input || {}
        }
      }));
      if (state.status === 'completed' || state.status === 'error') {
        store.recordEvent(createEvent({
          taskId,
          sessionId,
          agent: 'opencode',
          tier: 1,
          type: 'tool.completed',
          data: { name: toolName, result: state.output || '', ...(state.status === 'error' ? { error: true } : {}) }
        }));
      }
    } else if (parsed.type === 'tool_result' || parsed.type === 'tool_response') {
      store.recordEvent(createEvent({
        taskId,
        sessionId,
        agent: 'opencode',
        tier: 1,
        type: 'tool.completed',
        data: {
          name: parsed.name || 'unknown',
          result: parsed.result || parsed.output || ''
        }
      }));
    } else if (parsed.type === 'usage' || parsed.tokens) {
      store.recordEvent(createEvent({
        taskId,
        sessionId,
        agent: 'opencode',
        tier: 1,
        type: 'usage.updated',
        data: {
          usage: parsed.usage || parsed.tokens
        }
      }));
    } else {
      store.recordEvent(createEvent({
        taskId,
        sessionId,
        agent: 'opencode',
        tier: 1,
        type: 'message.delta',
        data: { text: JSON.stringify(parsed) }
      }));
    }
  }
}
