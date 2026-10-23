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
import { globalFleetOrchestrator } from '../runtime/fleet_orchestrator.ts';
import { globalWorktreeManager } from '../runtime/worktree_manager.ts';

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
    'Executes a task using a local CLI agent (claude, codex, agy, opencode, freebuff) with real-time stream ingestion and session support.',
    {
      agent: z.enum(['claude', 'codex', 'agy', 'opencode', 'freebuff']).describe('The target CLI agent'),
      prompt: z.string().describe('Instruction or task prompt'),
      cwd: z.string().optional().describe('Optional working directory (validated)'),
      session_id: z.string().optional().describe('Optional session / thread ID to resume (multi-turn context)'),
      dangerously_skip_permissions: z.boolean().optional().default(false).describe('Explicitly skip permission prompts (default: false, safe)'),
      sandbox: z.enum(['workspace-write', 'read-only', 'danger-full-access']).optional().default('workspace-write').describe('Codex sandbox mode'),
      timeout_seconds: z.number().optional().default(1800).describe('Execution timeout in seconds (default 1800s / 30m; 0 for unlimited)'),
      detailed: z.boolean().optional().default(false).describe('Return verbose tool logs and full output (default false)'),
      effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional().describe('Reasoning effort level (low, medium, high, xhigh, max). Used by Claude.'),
      model: z.string().optional().describe('Model override (e.g. sonnet, opus, haiku). Used by Claude.')
    },
    async ({ agent, prompt, cwd, session_id, dangerously_skip_permissions, sandbox, timeout_seconds, detailed, effort, model }) => {
      try {
        const validatedCwd = validateCwd(cwd);
        const summary = await globalRunner.runTask({
          agent,
          prompt,
          cwd: validatedCwd,
          sessionId: session_id,
          dangerouslySkipPermissions: dangerously_skip_permissions,
          sandbox,
          timeoutSeconds: typeof timeout_seconds === 'number' ? timeout_seconds : 1800,
          effort,
          model
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
      agent: z.enum(['claude', 'codex', 'agy', 'opencode', 'freebuff']).describe('The target CLI agent'),
      prompt: z.string().describe('Instruction or task prompt'),
      cwd: z.string().optional().describe('Optional working directory'),
      session_id: z.string().optional().describe('Optional session ID to resume'),
      dangerously_skip_permissions: z.boolean().optional().default(false).describe('Explicitly skip permission prompts (default: false)'),
      sandbox: z.enum(['workspace-write', 'read-only', 'danger-full-access']).optional().default('workspace-write').describe('Codex sandbox mode'),
      timeout_seconds: z.number().optional().default(1800).describe('Execution timeout in seconds (default 1800s / 30m; 0 for unlimited)'),
      parent_task_id: z.string().optional().describe('Optional parent task ID (hierarchy)'),
      effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional().describe('Reasoning effort level (low, medium, high, xhigh, max). Used by Claude.'),
      model: z.string().optional().describe('Model override (e.g. sonnet, opus, haiku). Used by Claude.')
    },
    async ({ agent, prompt, cwd, session_id, dangerously_skip_permissions, sandbox, timeout_seconds, parent_task_id, effort, model }) => {
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
          timeoutSeconds: typeof timeout_seconds === 'number' ? timeout_seconds : 1800,
          effort,
          model
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
      timeout_seconds: z.number().optional().default(1800).describe('Execution timeout in seconds (default 1800s / 30m; 0 for unlimited)'),
      detailed: z.boolean().optional().default(false).describe('Return verbose tool logs and full output (default false)'),
      effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional().default('medium').describe('Reasoning effort level (low, medium, high, xhigh, max). Default: medium.'),
      model: z.string().optional().describe('Model override (e.g. sonnet, opus, haiku). Default: sonnet.')
    },
    async ({ prompt, cwd, session_id, dangerously_skip_permissions, timeout_seconds, detailed, effort, model }) => {
      try {
        const validatedCwd = validateCwd(cwd);
        const summary = await globalRunner.runTask({
          agent: 'claude',
          prompt,
          cwd: validatedCwd,
          sessionId: session_id,
          dangerouslySkipPermissions: dangerously_skip_permissions,
          timeoutSeconds: typeof timeout_seconds === 'number' ? timeout_seconds : 1800,
          effort,
          model
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
      timeout_seconds: z.number().optional().default(1800).describe('Execution timeout in seconds (default 1800s / 30m; 0 for unlimited)'),
      detailed: z.boolean().optional().default(false).describe('Return verbose tool logs and full output (default false)'),
      effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional().describe('Reasoning effort level (mapped to model_reasoning_effort in Codex).'),
      model: z.string().optional().describe('Model override for Codex (e.g. o3, o3-mini, gpt-4o, gpt-6-astra).'),
      dangerously_skip_permissions: z.boolean().optional().default(false).describe('Explicitly bypass tool prompts (default: false)')
    },
    async ({ prompt, cwd, session_id, sandbox, timeout_seconds, detailed, effort, model, dangerously_skip_permissions }) => {
      try {
        const validatedCwd = validateCwd(cwd);
        const summary = await globalRunner.runTask({
          agent: 'codex',
          prompt,
          cwd: validatedCwd,
          sessionId: session_id,
          sandbox,
          dangerouslySkipPermissions: dangerously_skip_permissions,
          timeoutSeconds: typeof timeout_seconds === 'number' ? timeout_seconds : 1800,
          effort,
          model
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
      timeout_seconds: z.number().optional().default(1800).describe('Execution timeout in seconds (default 1800s / 30m; 0 for unlimited)'),
      detailed: z.boolean().optional().default(false).describe('Return verbose tool logs and full output (default false)'),
      model: z.string().optional().describe('Model override for Antigravity agy.')
    },
    async ({ prompt, cwd, session_id, dangerously_skip_permissions, timeout_seconds, detailed, model }) => {
      try {
        const validatedCwd = validateCwd(cwd);
        const summary = await globalRunner.runTask({
          agent: 'agy',
          prompt,
          cwd: validatedCwd,
          sessionId: session_id,
          dangerouslySkipPermissions: dangerously_skip_permissions,
          timeoutSeconds: typeof timeout_seconds === 'number' ? timeout_seconds : 1800,
          model
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
    'Lists active or recent agent tasks in the Observatory (compact format to prevent context bloat).',
    {
      limit: z.number().optional().default(3).describe('Maximum number of tasks to return (default: 3)'),
      active_only: z.boolean().optional().default(false).describe('Show only currently running tasks')
    },
    async ({ limit, active_only }) => {
      let tasks = globalSqlite.getRecentTasks(limit || 3);
      if (active_only) {
        tasks = tasks.filter(t => t.status === 'running');
      }
      if (tasks.length === 0) {
        return {
          content: [{ type: 'text', text: 'Aktif veya kayıtlı görev bulunamadı.' }]
        };
      }

      const lines = ['| Görev ID | Ajan | Durum | Süre | İlk İstek |', '|---|---|---|---|---|'];
      for (const t of tasks.slice(0, limit || 3)) {
        const promptPreview = (t.prompt || '').slice(0, 30);
        lines.push(`| \`${t.taskId}\` | ${t.agent} | ${t.status} | ${(t.durationMs / 1000).toFixed(1)}s | ${promptPreview} |`);
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

  // Tool 8: run_fleet
  server.tool(
    'run_fleet',
    'Executes a multi-agent fleet/swarm with Git worktree isolation, DAG task dependencies, and single-writer reconciliation merge.',
    {
      repo_path: z.string().describe('Repository root path where worktrees and agents will operate'),
      tasks: z.array(z.object({
        id: z.string().describe('Unique task identifier (e.g. "task-api", "task-ui")'),
        agent: z.enum(['claude', 'codex', 'agy']).describe('The target CLI agent'),
        prompt: z.string().describe('Task prompt or instruction'),
        depends_on: z.array(z.string()).optional().describe('List of task IDs this task depends on (DAG dependencies)'),
        effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional().describe('Reasoning effort level'),
        model: z.string().optional().describe('Model override (e.g. sonnet, opus)'),
        timeout_seconds: z.number().optional().default(300).describe('Task timeout in seconds')
      })).describe('List of tasks to execute'),
      isolate_worktrees: z.boolean().optional().default(true).describe('Whether to run each task in an isolated Git worktree (default: true)'),
      auto_integrate: z.boolean().optional().default(true).describe('Whether to merge successful task branches into an integration candidate branch (default: true)'),
      verification_command: z.string().optional().describe('Optional verification command to run on integration branch (e.g. "npm run check")'),
      cleanup_on_success: z.boolean().optional().default(true).describe('Whether to clean up worktrees if all tasks succeed (default: true)'),
      max_concurrency: z.number().optional().default(4).describe('Maximum concurrent worker processes (default: 4)')
    },
    async ({ repo_path, tasks, isolate_worktrees, auto_integrate, verification_command, cleanup_on_success, max_concurrency }) => {
      try {
        const result = await globalFleetOrchestrator.runFleet({
          repoPath: repo_path,
          tasks: tasks.map(t => ({
            id: t.id,
            agent: t.agent,
            prompt: t.prompt,
            dependsOn: t.depends_on,
            effort: t.effort,
            model: t.model,
            timeoutSeconds: t.timeout_seconds
          })),
          isolateWorktrees: isolate_worktrees,
          autoIntegrate: auto_integrate,
          integrationVerificationCommand: verification_command,
          cleanupWorktreesOnSuccess: cleanup_on_success,
          maxConcurrency: max_concurrency
        });

        const lines = [
          `### 🚀 Fleet Orchestration Raporu (\`${result.fleetId}\`)`,
          `- **Durum**: ${result.status === 'completed' ? '✅ Başarılı' : result.status === 'partial' ? '⚠️ Kısmi Başarılı' : '❌ Başarısız'}`,
          `- **Süre**: ${(result.durationMs / 1000).toFixed(1)}s · **Temel SHA**: \`${result.baseSha.slice(0, 8)}\``
        ];

        if (result.integrationBranch) {
          lines.push(`- **Entegrasyon Dalı**: \`${result.integrationBranch}\` ${result.integrationVerified ? '(✔ Doğrulandı)' : '(Doğrulama Yapılmadı / Başarısız)'}`);
        }

        if (result.conflictFiles && result.conflictFiles.length > 0) {
          lines.push(`\n> [!WARNING]\n> **Birleştirme Çakışmaları**: ${result.conflictFiles.map(f => `\`${f}\``).join(', ')}`);
        }

        lines.push('\n#### Görev Dağılımı ve Sonuçları:');
        lines.push('| Görev ID | Ajan | Durum | Dal / Worktree | Çıktı / Hata |');
        lines.push('|---|---|---|---|---|');

        for (const [id, exec] of result.tasks.entries()) {
          const statusIcon = exec.status === 'completed' ? '✔' : exec.status === 'failed' ? '❌' : exec.status === 'skipped' ? '⏭' : '⏳';
          const branchInfo = exec.branch ? `\`${exec.branch}\`` : '-';
          const detail = exec.error ? `Hata: ${exec.error.slice(0, 50)}` : (exec.summary ? `Tamamlandı (${(exec.summary.durationMs / 1000).toFixed(1)}s)` : '-');
          lines.push(`| \`${id}\` | ${exec.definition.agent} | ${statusIcon} ${exec.status} | ${branchInfo} | ${detail} |`);
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `❌ Fleet çalıştırma hatası: ${err.message}` }]
        };
      }
    }
  );

  // Tool 9: list_worktrees
  server.tool(
    'list_worktrees',
    'Lists all active Git worktrees in a repository.',
    {
      repo_path: z.string().describe('Repository root path')
    },
    async ({ repo_path }) => {
      try {
        const validated = validateCwd(repo_path);
        const worktrees = globalWorktreeManager.listWorktrees(validated);
        if (worktrees.length === 0) {
          return { content: [{ type: 'text', text: 'Aktif worktree bulunamadı.' }] };
        }

        const lines = [
          `### 🌲 Aktif Git Worktree Listesi (${validated})`,
          '| Dizin | Dal | HEAD SHA | Kilitli |',
          '|---|---|---|---|'
        ];
        for (const wt of worktrees) {
          lines.push(`| \`${wt.worktreePath}\` | \`${wt.branch || '(detached)'}\` | \`${wt.headSha.slice(0, 8)}\` | ${wt.isLocked ? '🔒 Evet' : 'Hayır'} |`);
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Worktree listeleme hatası: ${err.message}` }]
        };
      }
    }
  );

  // Tool 10: cleanup_worktree
  server.tool(
    'cleanup_worktree',
    'Safely removes a Git worktree directory and prunes worktree tracking.',
    {
      repo_path: z.string().describe('Repository root path'),
      worktree_path: z.string().describe('Worktree path to remove'),
      force: z.boolean().optional().default(true).describe('Force remove uncommitted changes (default: true)')
    },
    async ({ repo_path, worktree_path, force }) => {
      try {
        const root = validateCwd(repo_path);
        globalWorktreeManager.removeWorktree(root, worktree_path, force);
        return {
          content: [{ type: 'text', text: `Worktree başarıyla temizlendi: \`${worktree_path}\`` }]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Worktree temizleme hatası: ${err.message}` }]
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[AgentObservatory] MCP Server initialized on stdio transport via official @modelcontextprotocol/sdk');
}
