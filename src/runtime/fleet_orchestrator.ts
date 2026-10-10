import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AgentRunner, globalRunner } from './agent_runner.ts';
import { WorktreeManager, globalWorktreeManager } from './worktree_manager.ts';
import { ResourceBroker, globalResourceBroker } from './resource_broker.ts';
import type { TaskSummary } from '../core/types.ts';
import { validateCwd } from '../core/paths.ts';

export interface FleetTaskDefinition {
  id: string;
  agent: string;
  prompt: string;
  dependsOn?: string[];
  branchName?: string;
  effort?: string;
  model?: string;
  timeoutSeconds?: number;
  dangerouslySkipPermissions?: boolean;
}

export interface FleetRunOptions {
  repoPath: string;
  tasks: FleetTaskDefinition[];
  fleetId?: string;
  isolateWorktrees?: boolean;
  autoIntegrate?: boolean;
  integrationVerificationCommand?: string;
  cleanupWorktreesOnSuccess?: boolean;
  maxConcurrency?: number;
}

export interface FleetTaskExecution {
  definition: FleetTaskDefinition;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  worktreePath?: string;
  branch?: string;
  summary?: TaskSummary;
  error?: string;
}

export interface FleetRunResult {
  fleetId: string;
  status: 'completed' | 'partial' | 'failed';
  baseSha: string;
  integrationBranch?: string;
  integrationVerified?: boolean;
  tasks: Map<string, FleetTaskExecution>;
  conflictFiles?: string[];
  durationMs: number;
  error?: string;
}

export class FleetOrchestrator {
  private runner: AgentRunner;
  private worktreeManager: WorktreeManager;
  private resourceBroker: ResourceBroker;

  constructor(
    runner: AgentRunner = globalRunner,
    worktreeManager: WorktreeManager = globalWorktreeManager,
    resourceBroker: ResourceBroker = globalResourceBroker
  ) {
    this.runner = runner;
    this.worktreeManager = worktreeManager;
    this.resourceBroker = resourceBroker;
  }

  /**
   * Validates DAG tasks for uniqueness and acyclicity (Kahn's algorithm).
   */
  validateDag(tasks: FleetTaskDefinition[]): void {
    const ids = new Set<string>();
    for (const t of tasks) {
      if (!t.id) throw new Error('Görev tanımında boş id bulunamaz.');
      if (ids.has(t.id)) throw new Error(`Yinelenen görev ID: "${t.id}"`);
      ids.add(t.id);
    }

    // Verify all dependsOn references exist
    for (const t of tasks) {
      for (const dep of t.dependsOn || []) {
        if (!ids.has(dep)) {
          throw new Error(`Görev "${t.id}" bulunmayan bir bağımlılığa referans veriyor: "${dep}"`);
        }
      }
    }

    // Detect cycles via topological sort (Kahn)
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const t of tasks) {
      inDegree.set(t.id, (t.dependsOn || []).length);
      for (const dep of t.dependsOn || []) {
        const list = adj.get(dep) || [];
        list.push(t.id);
        adj.set(dep, list);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    let processedCount = 0;
    while (queue.length > 0) {
      const u = queue.shift()!;
      processedCount++;
      for (const v of adj.get(u) || []) {
        const cur = inDegree.get(v)! - 1;
        inDegree.set(v, cur);
        if (cur === 0) queue.push(v);
      }
    }

    if (processedCount !== tasks.length) {
      throw new Error('Görev ağacında döngüsel bağımlılık (cycle) tespit edildi!');
    }
  }

  /**
   * Runs an entire fleet of agents in parallel/DAG topology with worktree isolation.
   */
  async runFleet(options: FleetRunOptions): Promise<FleetRunResult> {
    const startTime = Date.now();
    const repoPath = validateCwd(options.repoPath);

    if (!this.worktreeManager.isGitRepo(repoPath)) {
      throw new Error(`Dizin bir Git repository'si değil: "${repoPath}"`);
    }

    this.validateDag(options.tasks);

    if (options.maxConcurrency) {
      this.resourceBroker.setMaxSlots(options.maxConcurrency);
    }

    const fleetId = options.fleetId || 'fleet_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const baseSha = this.worktreeManager.getHeadSha(repoPath);
    const isolateWorktrees = options.isolateWorktrees !== false;

    const executions = new Map<string, FleetTaskExecution>();
    for (const t of options.tasks) {
      executions.set(t.id, {
        definition: t,
        status: 'pending'
      });
    }

    // 1. Prepare Worktrees
    const activeWorktrees: Array<{ taskId: string; worktreePath: string; branch: string }> = [];
    if (isolateWorktrees) {
      for (const t of options.tasks) {
        const branch = t.branchName || `fleet/${fleetId}/${t.id}`;
        const wtResult = this.worktreeManager.createWorktree(repoPath, branch, undefined, baseSha);
        const exec = executions.get(t.id)!;
        exec.worktreePath = wtResult.worktreePath;
        exec.branch = branch;
        activeWorktrees.push({ taskId: t.id, worktreePath: wtResult.worktreePath, branch });
      }
    }

    // 2. DAG Execution Engine
    const completedTasks = new Set<string>();
    const failedTasks = new Set<string>();

    const runSingleTask = async (taskId: string): Promise<void> => {
      const exec = executions.get(taskId)!;
      const def = exec.definition;

      // Check if any dependencies failed
      const hasFailedDep = (def.dependsOn || []).some((dep) => failedTasks.has(dep));
      if (hasFailedDep) {
        exec.status = 'skipped';
        exec.error = 'Bağımlı görevlerden biri başarısız olduğu için atlandı.';
        failedTasks.add(taskId);
        return;
      }

      const releaseSlot = await this.resourceBroker.acquireSlot();
      exec.status = 'running';

      try {
        const targetCwd = exec.worktreePath || repoPath;
        const summary = await this.runner.runTask({
          agent: def.agent,
          prompt: def.prompt,
          cwd: targetCwd,
          timeoutSeconds: def.timeoutSeconds || 300,
          effort: def.effort,
          model: def.model,
          dangerouslySkipPermissions: def.dangerouslySkipPermissions ?? true
        });

        exec.summary = summary;
        if (summary.status === 'completed') {
          exec.status = 'completed';
          completedTasks.add(taskId);
        } else {
          exec.status = 'failed';
          exec.error = summary.error || 'Ajan görevi tamamlayamadı';
          failedTasks.add(taskId);
        }
      } catch (err: any) {
        exec.status = 'failed';
        exec.error = err.message;
        failedTasks.add(taskId);
      } finally {
        releaseSlot();
      }
    };

    // Execute DAG in topological levels
    while (completedTasks.size + failedTasks.size < options.tasks.length) {
      const runnable: string[] = [];
      for (const t of options.tasks) {
        const exec = executions.get(t.id)!;
        if (exec.status === 'pending') {
          const deps = t.dependsOn || [];
          const allDepsFinished = deps.every((d) => completedTasks.has(d) || failedTasks.has(d));
          if (allDepsFinished) {
            runnable.push(t.id);
          }
        }
      }

      if (runnable.length === 0) {
        // Deadlock guard
        break;
      }

      // Execute ready tasks concurrently
      await Promise.all(runnable.map((id) => runSingleTask(id)));
    }

    const allSuccessful = options.tasks.every((t) => executions.get(t.id)?.status === 'completed');
    let fleetStatus: 'completed' | 'partial' | 'failed' = allSuccessful
      ? 'completed'
      : completedTasks.size > 0
      ? 'partial'
      : 'failed';

    let integrationBranch: string | undefined;
    let integrationVerified = false;
    let conflictFiles: string[] | undefined;

    // 3. Reconciliation Arbiter (Single Integration Writer)
    if (options.autoIntegrate !== false && completedTasks.size > 0 && isolateWorktrees) {
      integrationBranch = `fleet/integration/${fleetId}`;

      await this.resourceBroker.acquireIntegrationLock(async () => {
        // Create candidate integration branch from baseSha
        this.worktreeManager.createBranch(repoPath, integrationBranch!, baseSha);

        // Create temporary integration worktree to test and merge
        const integrationWtResult = this.worktreeManager.createWorktree(
          repoPath,
          integrationBranch!,
          undefined,
          baseSha
        );

        let mergeFailed = false;
        for (const t of options.tasks) {
          const exec = executions.get(t.id)!;
          if (exec.status === 'completed' && exec.branch) {
            const mergeResult = this.worktreeManager.mergeBranch(
              integrationWtResult.worktreePath,
              exec.branch,
              `fleet: integrate task ${t.id} (${t.agent})`
            );

            if (!mergeResult.success) {
              mergeFailed = true;
              conflictFiles = mergeResult.conflictFiles || [];
              this.worktreeManager.abortMerge(integrationWtResult.worktreePath);
              break;
            }
          }
        }

        if (!mergeFailed) {
          // If verification command is specified, run it inside the integration worktree
          if (options.integrationVerificationCommand) {
            try {
              execFileSync(process.platform === 'win32' ? 'cmd.exe' : 'sh', [
                process.platform === 'win32' ? '/c' : '-c',
                options.integrationVerificationCommand
              ], {
                cwd: integrationWtResult.worktreePath,
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: 120000,
                windowsHide: true
              });
              integrationVerified = true;
            } catch (verErr: any) {
              integrationVerified = false;
              process.stderr.write(`[FleetOrchestrator] Entegrasyon doğrulama komutu başarısız: ${verErr.message}\n`);
            }
          } else {
            integrationVerified = true;
          }
        }

        // Clean up temporary integration worktree (branch remains)
        this.worktreeManager.removeWorktree(repoPath, integrationWtResult.worktreePath, true);
      });
    }

    // 4. Cleanup task worktrees if requested and successful
    if (options.cleanupWorktreesOnSuccess !== false && allSuccessful && isolateWorktrees) {
      for (const wt of activeWorktrees) {
        this.worktreeManager.removeWorktree(repoPath, wt.worktreePath, true);
      }
    }

    return {
      fleetId,
      status: fleetStatus,
      baseSha,
      integrationBranch,
      integrationVerified,
      tasks: executions,
      conflictFiles,
      durationMs: Date.now() - startTime
    };
  }
}

export const globalFleetOrchestrator = new FleetOrchestrator();
