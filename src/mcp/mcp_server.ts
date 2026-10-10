import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { globalRunner } from '../runtime/agent_runner.ts';
import { globalSqlite } from '../core/sqlite_store.ts';
import { validateCwd } from '../core/paths.ts';

const LAUNCH_GUI_PS1 = process.env.OBSERVATORY_LAUNCH_GUI || path.join(os.homedir(), 'MasterBrain', 'tools', 'launch_gui.ps1');

function formatTaskReport(summary: any): string {
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

  return report.join('\n');
}

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'AgentObservatory',
    version: '1.0.0-alpha'
  });

  // Tool 1: run_agent
  server.tool(
    'run_agent',
    'Executes a task using a local CLI agent (claude, codex, agy) with real-time stream ingestion and session support.',
    {
      agent: z.enum(['claude', 'codex', 'agy']).describe('The target CLI agent'),
      prompt: z.string().describe('Instruction or task prompt'),
      cwd: z.string().optional().describe('Optional working directory (validated)'),
      session_id: z.string().optional().describe('Optional session / thread ID to resume (multi-turn context)'),
      dangerously_skip_permissions: z.boolean().optional().default(false).describe('Explicitly skip permission prompts (default: false, safe)'),
      sandbox: z.enum(['workspace-write', 'read-only', 'danger-full-access']).optional().default('workspace-write').describe('Codex sandbox mode'),
      timeout_seconds: z.number().optional().default(300).describe('Execution timeout in seconds')
    },
    async ({ agent, prompt, cwd, session_id, dangerously_skip_permissions, sandbox, timeout_seconds }) => {
      try {
        const validatedCwd = validateCwd(cwd);
        const summary = await globalRunner.runTask({
          agent,
          prompt,
          cwd: validatedCwd,
          sessionId: session_id,
          dangerouslySkipPermissions: dangerously_skip_permissions,
          sandbox,
          timeoutSeconds: timeout_seconds || 300
        });

        return {
          content: [{ type: 'text', text: formatTaskReport(summary) }]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Görev yürütme hatası: ${err.message}` }]
        };
      }
    }
  );

  // Tool 1.5: start_task (Asynchronous task start)
  server.tool(
    'start_task',
    'Starts an agent task in the background and returns the taskId immediately. Use get_task to poll status.',
    {
      agent: z.enum(['claude', 'codex', 'agy']).describe('The target CLI agent'),
      prompt: z.string().describe('Instruction or task prompt'),
      cwd: z.string().optional().describe('Optional working directory'),
      session_id: z.string().optional().describe('Optional session ID to resume'),
      dangerously_skip_permissions: z.boolean().optional().default(false).describe('Explicitly skip permission prompts (default: false)'),
      sandbox: z.enum(['workspace-write', 'read-only', 'danger-full-access']).optional().default('workspace-write').describe('Codex sandbox mode'),
      timeout_seconds: z.number().optional().default(300).describe('Execution timeout in seconds')
    },
    async ({ agent, prompt, cwd, session_id, dangerously_skip_permissions, sandbox, timeout_seconds }) => {
      try {
        const validatedCwd = validateCwd(cwd);
        const { taskId } = globalRunner.startTask({
          agent,
          prompt,
          cwd: validatedCwd,
          sessionId: session_id,
          dangerouslySkipPermissions: dangerously_skip_permissions,
          sandbox,
          timeoutSeconds: timeout_seconds || 300
        });

        return {
          content: [{
            type: 'text',
            text: `Görev başarıyla arka planda başlatıldı.\n- **Görev ID**: \`${taskId}\`\n- **Ajan**: \`${agent.toUpperCase()}\`\n- **Durum**: \`running\`\n\nDurumu sorgulamak için \`get_task\` aracını veya iptal etmek için \`cancel_task\` aracını kullanabilirsiniz.`
          }]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Görev başlatma hatası: ${err.message}` }]
        };
      }
    }
  );

  // Tool 1.6: get_task (Query task status)
  server.tool(
    'get_task',
    'Gets the current status, progress, tools used, and output of a running or completed task by task_id.',
    {
      task_id: z.string().describe('The task ID to query')
    },
    async ({ task_id }) => {
      const summary = globalRunner.getTask(task_id) || globalSqlite.getTask(task_id);
      if (!summary) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Görev \`${task_id}\` bulunamadı.` }]
        };
      }

      return {
        content: [{ type: 'text', text: formatTaskReport(summary) }]
      };
    }
  );

  // Tool 2: run_claude (Specialized Claude Code shortcut)
  server.tool(
    'run_claude',
    'Executes a task directly using Claude Code CLI with local OAuth subscription.',
    {
      prompt: z.string().describe('Instruction or task prompt for Claude Code'),
      cwd: z.string().optional().describe('Optional working directory'),
      session_id: z.string().optional().describe('Optional session ID to resume'),
      dangerously_skip_permissions: z.boolean().optional().default(false).describe('Explicitly bypass tool prompts (default: false)'),
      timeout_seconds: z.number().optional().default(300).describe('Execution timeout in seconds')
    },
    async ({ prompt, cwd, session_id, dangerously_skip_permissions, timeout_seconds }) => {
      try {
        const validatedCwd = validateCwd(cwd);
        const summary = await globalRunner.runTask({
          agent: 'claude',
          prompt,
          cwd: validatedCwd,
          sessionId: session_id,
          dangerouslySkipPermissions: dangerously_skip_permissions,
          timeoutSeconds: timeout_seconds || 300
        });
        return { content: [{ type: 'text', text: formatTaskReport(summary) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Claude görevi hatası: ${err.message}` }] };
      }
    }
  );

  // Tool 3: run_codex (Specialized Codex CLI shortcut)
  server.tool(
    'run_codex',
    'Executes a task directly using OpenAI Codex CLI with JSON-RPC event stream.',
    {
      prompt: z.string().describe('Instruction or task prompt for Codex'),
      cwd: z.string().optional().describe('Optional working directory'),
      session_id: z.string().optional().describe('Optional session/thread ID to resume'),
      sandbox: z.enum(['workspace-write', 'read-only', 'danger-full-access']).optional().default('workspace-write').describe('Codex sandbox mode'),
      timeout_seconds: z.number().optional().default(300).describe('Execution timeout in seconds')
    },
    async ({ prompt, cwd, session_id, sandbox, timeout_seconds }) => {
      try {
        const validatedCwd = validateCwd(cwd);
        const summary = await globalRunner.runTask({
          agent: 'codex',
          prompt,
          cwd: validatedCwd,
          sessionId: session_id,
          sandbox,
          timeoutSeconds: timeout_seconds || 300
        });
        return { content: [{ type: 'text', text: formatTaskReport(summary) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Codex görevi hatası: ${err.message}` }] };
      }
    }
  );

  // Tool 4: run_agy (Specialized Antigravity CLI shortcut)
  server.tool(
    'run_agy',
    'Executes a task directly using Google Antigravity CLI (agy).',
    {
      prompt: z.string().describe('Instruction or task prompt for Antigravity agy'),
      cwd: z.string().optional().describe('Optional working directory'),
      session_id: z.string().optional().describe('Optional session ID to resume'),
      dangerously_skip_permissions: z.boolean().optional().default(false).describe('Explicitly bypass permissions (default: false)'),
      timeout_seconds: z.number().optional().default(300).describe('Execution timeout in seconds')
    },
    async ({ prompt, cwd, session_id, dangerously_skip_permissions, timeout_seconds }) => {
      try {
        const validatedCwd = validateCwd(cwd);
        const summary = await globalRunner.runTask({
          agent: 'agy',
          prompt,
          cwd: validatedCwd,
          sessionId: session_id,
          dangerouslySkipPermissions: dangerously_skip_permissions,
          timeoutSeconds: timeout_seconds || 300
        });
        return { content: [{ type: 'text', text: formatTaskReport(summary) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: `Agy görevi hatası: ${err.message}` }] };
      }
    }
  );

  // Tool 5: cancel_task
  server.tool(
    'cancel_task',
    'Aborts a currently running agent task by task ID (terminates process tree via taskkill).',
    {
      task_id: z.string().describe('The task ID to cancel')
    },
    async ({ task_id }) => {
      const success = globalRunner.cancelTask(task_id);
      return {
        content: [{
          type: 'text',
          text: success
            ? `Görev \`${task_id}\` başarıyla iptal edildi (süreç ağacı sonlandırıldı).`
            : `Görev \`${task_id}\` bulunamadı veya zaten tamamlanmış.`
        }]
      };
    }
  );

  // Tool 6: list_tasks (also aliased for sessions)
  server.tool(
    'list_tasks',
    'Lists recent agent tasks and active executions in the Observatory.',
    {
      limit: z.number().optional().default(10).describe('Maximum number of tasks to return')
    },
    async ({ limit }) => {
      const tasks = globalSqlite.getRecentTasks(limit || 10);
      if (tasks.length === 0) {
        return {
          content: [{ type: 'text', text: 'Kayıtlı görev bulunamadı.' }]
        };
      }

      const lines = ['| Görev ID | Ajan | Durum | Oturum ID | Süre | İlk İstek |', '|---|---|---|---|---|---|'];
      for (const t of tasks) {
        const promptPreview = (t.prompt || '').slice(0, 30);
        lines.push(`| \`${t.taskId}\` | ${t.agent} | ${t.status} | \`${t.sessionId ? t.sessionId.slice(0, 8) : '-'}\` | ${(t.durationMs / 1000).toFixed(1)}s | ${promptPreview} |`);
      }
      return {
        content: [{ type: 'text', text: lines.join('\n') }]
      };
    }
  );

  server.tool(
    'list_agent_sessions',
    'Alias for list_tasks: Lists recent agent tasks and sessions.',
    {
      limit: z.number().optional().default(10).describe('Maximum number of tasks to return')
    },
    async ({ limit }) => {
      const tasks = globalSqlite.getRecentTasks(limit || 10);
      if (tasks.length === 0) {
        return { content: [{ type: 'text', text: 'Kayıtlı oturum bulunamadı.' }] };
      }
      const lines = ['| Görev ID | Ajan | Durum | Oturum ID | Süre | İlk İstek |', '|---|---|---|---|---|---|'];
      for (const t of tasks) {
        const promptPreview = (t.prompt || '').slice(0, 30);
        lines.push(`| \`${t.taskId}\` | ${t.agent} | ${t.status} | \`${t.sessionId ? t.sessionId.slice(0, 8) : '-'}\` | ${(t.durationMs / 1000).toFixed(1)}s | ${promptPreview} |`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  // Tool 7: launch_observatory_tui
  server.tool(
    'launch_observatory_tui',
    'Opens the live Agent Observatory telemetry dashboard in a visible console window on the physical desktop (WinSta0\\Default).',
    {},
    async () => {
      const tuiPath = path.resolve(__dirnameOrCwd(), 'cli.ts');
      if (fs.existsSync(LAUNCH_GUI_PS1)) {
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
      } else {
        spawn('cmd.exe', ['/c', 'start', 'node', '--experimental-strip-types', tuiPath, 'watch'], { stdio: 'ignore', windowsHide: false });
      }
      return {
        content: [{
          type: 'text',
          text: 'Agent Observatory canlı terminali (TUI) fiziksel masaüstünde (WinSta0\\Default) açıldı.'
        }]
      };
    }
  );

  server.tool(
    'launch_agent_watch',
    'Alias for launch_observatory_tui.',
    {},
    async () => {
      const tuiPath = path.resolve(__dirnameOrCwd(), 'cli.ts');
      if (fs.existsSync(LAUNCH_GUI_PS1)) {
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
      } else {
        spawn('cmd.exe', ['/c', 'start', 'node', '--experimental-strip-types', tuiPath, 'watch'], { stdio: 'ignore', windowsHide: false });
      }
      return {
        content: [{
          type: 'text',
          text: 'Agent Observatory canlı terminali (TUI) fiziksel masaüstünde (WinSta0\\Default) açıldı.'
        }]
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[AgentObservatory] MCP Server initialized on stdio transport via official @modelcontextprotocol/sdk');
}

function __dirnameOrCwd(): string {
  const current = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1'));
  return fs.existsSync(path.join(current, 'cli.ts')) ? current : path.join(process.cwd(), 'src');
}
