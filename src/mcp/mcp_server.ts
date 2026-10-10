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
import { launchTuiWindow } from '../runtime/tui_launcher.ts';

function formatTokens(n: any): string {
  const v = Number(n) || 0;
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

const FILE_KEYS = ['file_path', 'path', 'TargetFile', 'filePath'];
const WRITE_TOOL_RE = /(edit|write|patch|replace|create)/i;

function normalizeFilePath(p: string): string {
  const raw = p.trim();
  if (!raw) return '';
  if (path.isAbsolute(raw)) {
    const rel = path.relative(process.cwd(), raw);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel.replace(/\\/g, '/');
    return path.basename(raw);
  }
  return raw.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function formatTaskReport(summary: any, detailed: boolean = false): string {
  const report: string[] = [];
  const agent = String(summary.agent || 'unknown').toUpperCase();
  report.push(`### Agent Observatory Görev Raporu`);
  report.push(`- **Ajan**: \`${agent}\`${summary.model ? ` (${summary.model})` : ''}`);
  const statusText = summary.status === 'completed' ? 'Başarılı' : summary.status;
  const durationText = `${((Number(summary.durationMs) || 0) / 1000).toFixed(1)}s`;
  report.push(`- **Durum**: ${statusText} · **Süre**: ${durationText}`);
  let ids = `- **Görev ID**: \`${summary.taskId}\``;
  if (summary.sessionId) {
    ids += ` · **Oturum**: \`${summary.sessionId}\``;
  }
  report.push(ids);

  if (summary.usage && summary.usage.totalTokens > 0) {
    const u = summary.usage;
    report.push(`- **Token**: Girdi: ${formatTokens(u.inputTokens)} · Önbellek: ${formatTokens(u.cachedTokens)} · Çıktı: ${formatTokens(u.outputTokens)} · Akıl Yürütme: ${formatTokens(u.reasoningTokens)}`);
  }

  const tools: any[] = Array.isArray(summary.toolsUsed) ? summary.toolsUsed : [];
  if (tools.length > 0) {
    if (detailed) {
      report.push(`\n#### Yürütülen Araçlar / Komutlar:`);
      for (const t of tools) {
        report.push(`- **${t.name}**: \`${JSON.stringify(t.input || {}).slice(0, 100)}\``);
      }
    } else {
      const counts = new Map<string, number>();
      const files = new Set<string>();
      for (const t of tools) {
        const name = String(t.name || 'unknown');
        counts.set(name, (counts.get(name) || 0) + 1);
        if (WRITE_TOOL_RE.test(name) && t.input && typeof t.input === 'object') {
          for (const key of FILE_KEYS) {
            const val = t.input[key];
            if (typeof val === 'string') {
              const norm = normalizeFilePath(val);
              if (norm) files.add(norm);
            }
          }
        }
      }
      const countsSummary = [...counts.entries()].map(([n, c]) => `${n}: ${c}`).join(', ');
      report.push(`- **Araç Çağrıları**: ${tools.length} adet (${countsSummary})`);
      if (files.size > 0) {
        report.push(`- **Değiştirilen Dosyalar**: ${[...files].map(f => `\`${f}\``).join(', ')}`);
      }
    }
  }

  let text: string = summary.assistantText || '';
  if (!detailed && text.length > 3500) {
    const omitted = text.length - 2500;
    text = `${text.slice(0, 1500)}\n\n... [${omitted} karakter atlandı; tamamı için detailed=true kullanın] ...\n\n${text.slice(-1000)}`;
  }
  report.push(`\n#### Yanıt:`);
  report.push(text || '*(Çıktı üretilmedi)*');

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
      timeout_seconds: z.number().optional().default(300).describe('Execution timeout in seconds'),
      detailed: z.boolean().optional().default(false).describe('Return verbose tool logs and full output (default false)')
    },
    async ({ agent, prompt, cwd, session_id, dangerously_skip_permissions, sandbox, timeout_seconds, detailed }) => {
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
          content: [{ type: 'text', text: formatTaskReport(summary, detailed) }]
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
      timeout_seconds: z.number().optional().default(300).describe('Execution timeout in seconds'),
      parent_task_id: z.string().optional().describe('Optional parent task ID (hierarchy)')
    },
    async ({ agent, prompt, cwd, session_id, dangerously_skip_permissions, sandbox, timeout_seconds, parent_task_id }) => {
      try {
        const validatedCwd = validateCwd(cwd);
        const { taskId, promise } = globalRunner.startTask({
          agent,
          prompt,
          cwd: validatedCwd,
          sessionId: session_id,
          parentTaskId: parent_task_id,
          dangerouslySkipPermissions: dangerously_skip_permissions,
          sandbox,
          timeoutSeconds: timeout_seconds || 300
        });

        promise.catch((err) => {
          console.error(`[AgentObservatory] Background task ${taskId} error:`, err.message);
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
      task_id: z.string().describe('The task ID to query'),
      detailed: z.boolean().optional().default(false).describe('Return verbose tool logs and full output (default false)')
    },
    async ({ task_id, detailed }) => {
      const summary = globalRunner.getTask(task_id) || globalSqlite.getTask(task_id);
      if (!summary) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Görev \`${task_id}\` bulunamadı.` }]
        };
      }

      return {
        content: [{ type: 'text', text: formatTaskReport(summary, detailed) }]
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
      timeout_seconds: z.number().optional().default(300).describe('Execution timeout in seconds'),
      detailed: z.boolean().optional().default(false).describe('Return verbose tool logs and full output (default false)')
    },
    async ({ prompt, cwd, session_id, dangerously_skip_permissions, timeout_seconds, detailed }) => {
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
        return { content: [{ type: 'text', text: formatTaskReport(summary, detailed) }] };
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
      timeout_seconds: z.number().optional().default(300).describe('Execution timeout in seconds'),
      detailed: z.boolean().optional().default(false).describe('Return verbose tool logs and full output (default false)')
    },
    async ({ prompt, cwd, session_id, sandbox, timeout_seconds, detailed }) => {
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
        return { content: [{ type: 'text', text: formatTaskReport(summary, detailed) }] };
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
      timeout_seconds: z.number().optional().default(300).describe('Execution timeout in seconds'),
      detailed: z.boolean().optional().default(false).describe('Return verbose tool logs and full output (default false)')
    },
    async ({ prompt, cwd, session_id, dangerously_skip_permissions, timeout_seconds, detailed }) => {
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
        return { content: [{ type: 'text', text: formatTaskReport(summary, detailed) }] };
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
      launchTuiWindow();
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
      launchTuiWindow();
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
