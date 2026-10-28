import crypto from 'node:crypto';
import type { AgentCapability, AgentDescriptor, MissionContract } from '../core/mission_types.ts';
import type { RunTaskOptions } from './agent_runner.ts';
import type { TaskSummary } from '../core/types.ts';
import type { SqliteStore } from '../core/sqlite_store.ts';
import { classifyFailure } from '../core/failure.ts';
import { validateMissionContract } from '../core/mission_contract.ts';

/** Direct mod: plan/DAG yok, tek ajan, tek deneme. Ajan sözleşmedeki yeteneklere ve kota durumuna göre seçilir. */

export interface DirectAdapterLike {
  name: string;
  probe(): Promise<AgentDescriptor>;
}

export interface DirectRunnerLike {
  getAdapter(agent: string): DirectAdapterLike | null;
  startTask(opts: RunTaskOptions): { taskId: string; promise: Promise<TaskSummary> };
}

export interface DirectRunOptions {
  runner: DirectRunnerLike;
  store?: SqliteStore;
  /** Tercih sırası; ilk uygun olan seçilir. */
  candidates?: string[];
  /** Kullanıcının elle seçtiği ajan (uygunsa öncelikli). */
  preferredAgent?: string;
  model?: string;
  now?: () => number;
}

export interface DirectResult {
  missionId: string;
  status: 'completed' | 'failed' | 'rejected';
  agent?: string;
  taskId?: string;
  summary?: TaskSummary;
  errors?: string[];
  errorKind?: string;
  durationMs: number;
}

export const DEFAULT_CANDIDATES = ['claude', 'codex', 'opencode', 'agy', 'commandcode'];

/** Kota dolan ajanların bekleme bitiş zamanını tutar (süreç içi). */
export class QuotaTracker {
  private until = new Map<string, number>();
  private now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  markExhausted(agent: string, cooldownMs: number): void {
    this.until.set(agent, this.now() + cooldownMs);
  }

  isAvailable(agent: string): boolean {
    const t = this.until.get(agent);
    if (t === undefined) return true;
    if (this.now() >= t) { this.until.delete(agent); return true; }
    return false;
  }

  remainingMs(agent: string): number {
    return Math.max(0, (this.until.get(agent) ?? 0) - this.now());
  }
}

export const globalQuota = new QuotaTracker();

/** Direct modda ajanın sahip olması gereken yetenekler: sözleşmenin izin verdiği yazma/terminal yetenekleri; hiçbiri yoksa salt-okuma. */
export function requiredCapabilities(contract: MissionContract): AgentCapability[] {
  const allowed = contract.constraints.allowedCapabilities;
  const need = (['code.write', 'terminal.execute'] as AgentCapability[]).filter((c) => allowed.includes(c));
  return need.length ? need : ['code.read'];
}

export interface AgentChoice {
  agent: string | null;
  skipped: Array<{ agent: string; reason: string }>;
}

/** Yetenek + kurulu mu + kota kontrolüyle tek ajan seçer; elenenlerin gerekçesini döner. */
export async function selectAgent(
  contract: MissionContract,
  runner: DirectRunnerLike,
  quota: QuotaTracker,
  candidates: string[] = DEFAULT_CANDIDATES,
  preferred?: string
): Promise<AgentChoice> {
  const need = requiredCapabilities(contract);
  const order = preferred ? [preferred, ...candidates.filter((c) => c !== preferred)] : candidates;
  const skipped: AgentChoice['skipped'] = [];
  for (const name of order) {
    const adapter = runner.getAdapter(name);
    if (!adapter) { skipped.push({ agent: name, reason: 'adaptör yok' }); continue; }
    if (!quota.isAvailable(name)) { skipped.push({ agent: name, reason: 'kota doldu' }); continue; }
    const desc = await adapter.probe();
    if (!desc.isAvailable) { skipped.push({ agent: name, reason: 'kurulu değil' }); continue; }
    const missing = need.filter((c) => !desc.capabilities.includes(c));
    if (missing.length) { skipped.push({ agent: name, reason: 'eksik yetenek: ' + missing.join(',') }); continue; }
    return { agent: name, skipped };
  }
  return { agent: null, skipped };
}

/** Sözleşmeyi ajana verilecek tek parça talimata çevirir. */
export function buildDirectPrompt(contract: MissionContract): string {
  const lines = [contract.objective.trim()];
  const { includePaths, excludePaths } = contract.scope;
  if (includePaths.length) lines.push('', 'Yalnızca şu yollarda çalış: ' + includePaths.join(', '));
  if (excludePaths.length) lines.push('Şu yollara dokunma: ' + excludePaths.join(', '));
  if (contract.acceptance.testCommands.length) {
    lines.push('', 'Bittiğinde şu komutlar başarılı olmalı: ' + contract.acceptance.testCommands.join(' ; '));
  }
  return lines.join('\n');
}

export async function runDirect(contract: MissionContract, opts: DirectRunOptions, quota: QuotaTracker = globalQuota): Promise<DirectResult> {
  const now = opts.now ?? Date.now;
  const t0 = now();
  const reject = (errors: string[]): DirectResult => ({ missionId: contract.missionId, status: 'rejected', errors, durationMs: now() - t0 });

  if (contract.mode !== 'direct') return reject([`direct_runner yalnızca direct mod çalıştırır (mode=${contract.mode})`]);
  const v = validateMissionContract(contract);
  if (!v.ok) return reject(v.errors);

  const choice = await selectAgent(contract, opts.runner, quota, opts.candidates, opts.preferredAgent);
  if (!choice.agent) {
    return reject(['uygun ajan yok: ' + choice.skipped.map((s) => `${s.agent} (${s.reason})`).join(', ')]);
  }
  const agent = choice.agent;

  const store = opts.store;
  const taskNodeId = 'mtask_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  if (store) {
    if (!store.getMission(contract.missionId)) {
      store.createMission({ id: contract.missionId, title: contract.title, mode: 'direct', repoPath: contract.workspace.repoPath, status: 'running' });
    } else {
      store.updateMissionStatus(contract.missionId, 'running');
    }
    store.createMissionContract(contract);
    store.createMissionTask({
      id: taskNodeId, missionId: contract.missionId, title: contract.title, description: contract.objective,
      status: 'pending', dependencies: [], requiredCapabilities: requiredCapabilities(contract),
      assignedAgent: agent, assignedModel: opts.model, outputArtifacts: [], retryCount: 0, maxRetries: 0, createdAt: now()
    });
    store.updateMissionTaskStatus(taskNodeId, 'running', { startedAt: now() });
  }

  const finish = (status: 'completed' | 'failed', error?: string): void => {
    if (!store) return;
    store.updateMissionTaskStatus(taskNodeId, status, { completedAt: now(), error });
    store.updateMissionStatus(contract.missionId, status, now());
  };

  const noApproval = !contract.policy.requireApprovalForWrites && !contract.policy.requireApprovalForTerminal;
  let started: ReturnType<DirectRunnerLike['startTask']>;
  try {
    started = opts.runner.startTask({
      agent,
      prompt: buildDirectPrompt(contract),
      cwd: contract.workspace.repoPath,
      timeoutSeconds: Math.round(contract.constraints.timeoutMinutes * 60),
      dangerouslySkipPermissions: noApproval,
      model: opts.model
    });
  } catch (err: any) {
    finish('failed', err.message);
    return { missionId: contract.missionId, status: 'failed', agent, errors: [err.message], errorKind: classifyFailure(err.message).kind, durationMs: now() - t0 };
  }

  try {
    const summary = await started.promise;
    if (summary.status === 'completed') {
      finish('completed');
      return { missionId: contract.missionId, status: 'completed', agent, taskId: started.taskId, summary, durationMs: now() - t0 };
    }
    const msg = summary.error || `görev ${summary.status} durumunda bitti`;
    const f = classifyFailure(msg);
    if (f.kind === 'rate_limit') quota.markExhausted(agent, f.cooldownMs ?? 30 * 60 * 1000);
    finish('failed', msg);
    return { missionId: contract.missionId, status: 'failed', agent, taskId: started.taskId, summary, errors: [msg], errorKind: f.kind, durationMs: now() - t0 };
  } catch (err: any) {
    const f = classifyFailure(String(err?.message ?? err));
    if (f.kind === 'rate_limit') quota.markExhausted(agent, f.cooldownMs ?? 30 * 60 * 1000);
    finish('failed', err.message);
    return { missionId: contract.missionId, status: 'failed', agent, taskId: started.taskId, errors: [String(err?.message ?? err)], errorKind: f.kind, durationMs: now() - t0 };
  }
}
