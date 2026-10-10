import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { globalRunner } from '../runtime/agent_runner.ts';
import { globalStore } from '../core/event_store.ts';

const LAUNCH_GUI_PS1 = 'C:\\Users\\Halil Emre\\MasterBrain\\tools\\launch_gui.ps1';

const TOOLS = [
  {
    name: 'run_agent',
    description: 'Executes a task using a local CLI agent (claude, codex, agy) with real-time stream ingestion and session support.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          enum: ['claude', 'codex', 'agy'],
          description: 'The target CLI agent'
        },
        prompt: {
          type: 'string',
          description: 'Instruction or task prompt'
        },
        cwd: {
          type: 'string',
          description: 'Optional working directory'
        },
        session_id: {
          type: 'string',
          description: 'Optional session / thread ID to resume (multi-turn context)'
        },
        timeout_seconds: {
          type: 'number',
          default: 300,
          description: 'Execution timeout in seconds'
        }
      },
      required: ['agent', 'prompt']
    }
  },
  {
    name: 'cancel_task',
    description: 'Aborts a currently running agent task by task ID.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The task ID to cancel'
        }
      },
      required: ['task_id']
    }
  },
  {
    name: 'list_tasks',
    description: 'Lists recent agent tasks and active executions in the Observatory.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          default: 10
        }
      }
    }
  },
  {
    name: 'launch_observatory_tui',
    description: 'Opens the live Agent Observatory telemetry dashboard in a visible console window on the physical desktop (WinSta0\\Default).',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

function sendJson(msg: any): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function sendResult(id: any, result: any): void {
  sendJson({ jsonrpc: '2.0', id, result });
}

function sendError(id: any, code: number, message: string): void {
  sendJson({ jsonrpc: '2.0', id, error: { code, message } });
}

export function startMcpServer(): void {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req: any;
    try {
      req = JSON.parse(trimmed);
    } catch {
      return sendError(null, -32700, 'Parse error');
    }

    const { id, method, params } = req;

    if (method === 'initialize') {
      return sendResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'AgentObservatory',
          version: '1.0.0-alpha'
        }
      });
    }

    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'tools/list') {
      return sendResult(id, { tools: TOOLS });
    }

    if (method === 'tools/call') {
      const toolName = params && params.name;
      const args = (params && params.arguments) || {};

      try {
        if (toolName === 'run_agent') {
          const summary = await globalRunner.runTask({
            agent: args.agent,
            prompt: args.prompt,
            cwd: args.cwd,
            sessionId: args.session_id,
            timeoutSeconds: args.timeout_seconds || 300
          });

          const report: string[] = [];
          report.push(`### Agent Observatory Görev Raporu`);
          report.push(`- **Ajan**: \`${summary.agent.toUpperCase()}\``);
          report.push(`- **Durum**: ${summary.status === 'completed' ? 'Başarılı' : summary.status}`);
          if (summary.sessionId) {
            report.push(`- **Oturum / Thread ID**: \`${summary.sessionId}\``);
          }
          report.push(`- **Görev ID**: \`${summary.taskId}\``);
          if (summary.model) {
            report.push(`- **Model**: \`${summary.model}\``);
          }
          report.push(`- **Süre**: ${(summary.durationMs / 1000).toFixed(1)}s`);

          if (summary.usage && summary.usage.totalTokens > 0) {
            const u = summary.usage;
            report.push(`- **Token**: Girdi: ${u.inputTokens} · Önbellek: ${u.cachedTokens} · Çıktı: ${u.outputTokens} · Akıl Yürütme: ${u.reasoningTokens}`);
          }

          if (summary.toolsUsed && summary.toolsUsed.length > 0) {
            report.push(`\n#### Yürütülen Araçlar / Komutlar:`);
            for (const t of summary.toolsUsed) {
              report.push(`- **${t.name}**: \`${JSON.stringify(t.input || {}).slice(0, 100)}\``);
            }
          }

          report.push(`\n#### Yanıt:`);
          report.push(summary.assistantText || '*(Çıktı üretilmedi)*');

          if (summary.error) {
            report.push(`\n> [!WARNING]\n> **Hata Detayı**: ${summary.error}`);
          }

          return sendResult(id, {
            content: [{ type: 'text', text: report.join('\n') }]
          });
        }

        if (toolName === 'cancel_task') {
          const success = globalRunner.cancelTask(args.task_id);
          return sendResult(id, {
            content: [{
              type: 'text',
              text: success ? `Görev \`${args.task_id}\` başarıyla iptal edildi.` : `Görev \`${args.task_id}\` bulunamadı veya zaten tamamlanmış.`
            }]
          });
        }

        if (toolName === 'list_tasks') {
          const tasks = globalStore.getRecentTasks(args.limit || 10);
          const lines = ['| Görev ID | Ajan | Durum | Oturum ID | Süre | İlk İstek |', '|---|---|---|---|---|---|'];
          for (const t of tasks) {
            const promptPreview = (t.prompt || '').slice(0, 30);
            lines.push(`| \`${t.taskId}\` | ${t.agent} | ${t.status} | \`${t.sessionId ? t.sessionId.slice(0, 8) : '-'}\` | ${(t.durationMs / 1000).toFixed(1)}s | ${promptPreview} |`);
          }
          return sendResult(id, {
            content: [{ type: 'text', text: lines.join('\n') }]
          });
        }

        if (toolName === 'launch_observatory_tui') {
          const tuiPath = 'C:\\Users\\Halil Emre\\Desktop\\GitHub\\Public\\AgentObservatory\\src\\cli.ts';
          const psCmd = [
            'pwsh',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            LAUNCH_GUI_PS1,
            '-ExePath',
            'C:\\Windows\\System32\\cmd.exe',
            '-Arguments',
            `/c node --experimental-strip-types "${tuiPath}" watch`
          ];
          spawn(psCmd[0], psCmd.slice(1), { stdio: 'ignore', windowsHide: false });
          return sendResult(id, {
            content: [{
              type: 'text',
              text: 'Agent Observatory canlı terminali (TUI) fiziksel masaüstünde (WinSta0\\Default) açıldı.'
            }]
          });
        }

        return sendError(id, -32601, `Bilinmeyen araç: ${toolName}`);
      } catch (err: any) {
        return sendError(id, -32000, err.message);
      }
    }

    sendError(id, -32601, `Bilinmeyen metod: ${method}`);
  });
}
