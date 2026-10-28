import crypto from 'node:crypto';
import type { AgentCapability, MissionContract, MissionMode } from './mission_types.ts';

const MODES: MissionMode[] = ['direct', 'planned', 'verified'];

const ALL_CAPABILITIES: AgentCapability[] = [
  'code.read', 'code.write', 'terminal.execute', 'git.inspect', 'git.modify', 'browser.inspect',
  'review.readonly', 'batch.process', 'session.pause', 'approval.structured', 'diff.inspect',
  'subagent.spawn', 'model.switch'
];

export interface MissionContractInput {
  title?: string;
  objective: string;
  mode?: MissionMode;
  repoPath: string;
  missionId?: string;
  baseCommit?: string;
  branch?: string;
  includePaths?: string[];
  excludePaths?: string[];
  testCommands?: string[];
  requireCleanGit?: boolean;
  requireRedTeamAudit?: boolean;
  maxAttempts?: number;
  timeoutMinutes?: number;
  allowedCapabilities?: AgentCapability[];
  requireApprovalForTerminal?: boolean;
  requireApprovalForWrites?: boolean;
}

export interface ContractValidation {
  ok: boolean;
  errors: string[];
}

/** Moda göre varsayılan yetenek seti: direct yazma+terminal, verified ek olarak salt-okunur inceleme. */
function defaultCapabilities(mode: MissionMode): AgentCapability[] {
  const base: AgentCapability[] = ['code.read', 'code.write', 'terminal.execute'];
  return mode === 'verified' ? [...base, 'git.inspect', 'review.readonly'] : base;
}

/** Ham girdiden varsayılanları doldurulmuş bir MissionContract üretir. Doğrulamaz; `validateMissionContract` ayrı çağrılır. */
export function buildMissionContract(input: MissionContractInput): MissionContract {
  const mode: MissionMode = input.mode ?? 'direct';
  const missionId = input.missionId ?? 'mission_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const objective = String(input.objective ?? '').trim();
  const title = (input.title ?? '').trim() || objective.split('\n')[0].slice(0, 80);
  const verified = mode === 'verified';
  return {
    id: 'contract_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    missionId,
    title,
    objective,
    mode,
    workspace: {
      repoPath: String(input.repoPath ?? ''),
      ...(input.baseCommit ? { baseCommit: input.baseCommit } : {}),
      ...(input.branch ? { branch: input.branch } : {})
    },
    scope: {
      includePaths: input.includePaths ?? [],
      excludePaths: input.excludePaths ?? ['.env', '.env.*', 'secrets/**']
    },
    acceptance: {
      testCommands: input.testCommands ?? [],
      requireCleanGit: input.requireCleanGit ?? verified,
      requireRedTeamAudit: input.requireRedTeamAudit ?? verified
    },
    constraints: {
      maxAttempts: input.maxAttempts ?? (mode === 'direct' ? 1 : 3),
      timeoutMinutes: input.timeoutMinutes ?? 30,
      allowedCapabilities: input.allowedCapabilities ?? defaultCapabilities(mode)
    },
    policy: {
      requireApprovalForTerminal: input.requireApprovalForTerminal ?? verified,
      requireApprovalForWrites: input.requireApprovalForWrites ?? verified
    },
    createdAt: Date.now()
  };
}

/** Sözleşmenin yapısal ve mantıksal tutarlılığını denetler; tüm hataları tek seferde döner. */
export function validateMissionContract(c: MissionContract): ContractValidation {
  const errors: string[] = [];
  if (!c || typeof c !== 'object') return { ok: false, errors: ['sözleşme nesne olmalı'] };

  if (!c.id) errors.push('id zorunlu');
  if (!c.missionId) errors.push('missionId zorunlu');
  if (!c.objective || !c.objective.trim()) errors.push('objective boş olamaz');
  if (!c.title || !c.title.trim()) errors.push('title boş olamaz');
  if (!MODES.includes(c.mode)) errors.push(`mode geçersiz: ${String(c.mode)}`);
  if (!c.workspace?.repoPath || !c.workspace.repoPath.trim()) errors.push('workspace.repoPath zorunlu');

  const inc = c.scope?.includePaths;
  const exc = c.scope?.excludePaths;
  if (!Array.isArray(inc) || !Array.isArray(exc)) {
    errors.push('scope.includePaths ve scope.excludePaths dizi olmalı');
  } else {
    for (const p of [...inc, ...exc]) {
      if (typeof p !== 'string' || !p.trim()) errors.push('scope yolları boş olmayan metin olmalı');
      else if (/(^|[\\/])\.\.([\\/]|$)/.test(p) || /^([a-zA-Z]:)?[\\/]/.test(p)) errors.push(`scope yolu depo içi göreli olmalı: ${p}`);
    }
    const both = inc.filter((p) => exc.includes(p));
    if (both.length) errors.push(`aynı yol hem include hem exclude: ${both.join(', ')}`);
  }

  const a = c.acceptance;
  if (!a || !Array.isArray(a.testCommands)) errors.push('acceptance.testCommands dizi olmalı');
  if (c.mode === 'verified' && a && a.testCommands?.length === 0) errors.push('verified modda en az bir testCommand gerekli');

  const k = c.constraints;
  if (!k) {
    errors.push('constraints zorunlu');
  } else {
    if (!Number.isInteger(k.maxAttempts) || k.maxAttempts < 1) errors.push('constraints.maxAttempts >= 1 tam sayı olmalı');
    if (c.mode === 'direct' && k.maxAttempts > 1) errors.push('direct modda maxAttempts 1 olmalı');
    if (typeof k.timeoutMinutes !== 'number' || !(k.timeoutMinutes > 0)) errors.push('constraints.timeoutMinutes > 0 olmalı');
    if (!Array.isArray(k.allowedCapabilities) || k.allowedCapabilities.length === 0) {
      errors.push('constraints.allowedCapabilities boş olamaz');
    } else {
      const unknown = k.allowedCapabilities.filter((x) => !ALL_CAPABILITIES.includes(x));
      if (unknown.length) errors.push(`bilinmeyen yetenek: ${unknown.join(', ')}`);
      if (!k.allowedCapabilities.includes('code.read') && !k.allowedCapabilities.includes('code.write')) {
        errors.push('en az code.read veya code.write izinli olmalı');
      }
      if (a?.testCommands?.length && !k.allowedCapabilities.includes('terminal.execute')) {
        errors.push('testCommands var ama terminal.execute izinli değil');
      }
    }
  }

  if (!c.policy || typeof c.policy.requireApprovalForTerminal !== 'boolean' || typeof c.policy.requireApprovalForWrites !== 'boolean') {
    errors.push('policy alanları boolean olmalı');
  }

  return { ok: errors.length === 0, errors };
}

/** Oluştur + doğrula; geçersizse tüm hataları içeren bir Error fırlatır. */
export function createValidatedContract(input: MissionContractInput): MissionContract {
  const c = buildMissionContract(input);
  const v = validateMissionContract(c);
  if (!v.ok) throw new Error('Geçersiz MissionContract: ' + v.errors.join('; '));
  return c;
}
