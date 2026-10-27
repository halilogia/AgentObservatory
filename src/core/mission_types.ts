/**
 * AgentObservatory - Next-Gen Mission Control & Adaptive Orchestrator
 * Domain Modelleri ve Tip Tanımları
 */

export type MissionMode = 'direct' | 'planned' | 'verified';

export type TaskStatus = 
  | 'pending'
  | 'ready'
  | 'running'
  | 'verifying'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'interrupted';

export type AgentCapability =
  | 'code.read'
  | 'code.write'
  | 'terminal.execute'
  | 'git.inspect'
  | 'git.modify'
  | 'browser.inspect'
  | 'review.readonly'
  | 'batch.process'
  | 'session.pause'
  | 'approval.structured'
  | 'diff.inspect'
  | 'subagent.spawn'
  | 'model.switch';

export interface AgentDescriptor {
  agent: string;
  displayName: string;
  version?: string;
  executablePath?: string;
  isAvailable: boolean;
  capabilities: AgentCapability[];
  supportedControls: {
    canPause: boolean;
    canResume: boolean;
    canInspectDiff: boolean;
    supportsStructuredApproval: boolean;
    supportsStreamingJson: boolean;
    supportsModelSwitching: boolean;
  };
  supportedModels?: string[];
  probedAt: number;
}

export interface MissionContract {
  id: string;
  missionId: string;
  title: string;
  objective: string;
  mode: MissionMode;
  workspace: {
    repoPath: string;
    baseCommit?: string;
    branch?: string;
  };
  scope: {
    includePaths: string[];
    excludePaths: string[];
  };
  acceptance: {
    testCommands: string[];
    requireCleanGit: boolean;
    requireRedTeamAudit: boolean;
  };
  constraints: {
    maxAttempts: number;
    timeoutMinutes: number;
    allowedCapabilities: AgentCapability[];
  };
  policy: {
    requireApprovalForTerminal: boolean;
    requireApprovalForWrites: boolean;
  };
  createdAt: number;
}

export interface TaskNode {
  id: string;
  missionId: string;
  title: string;
  description: string;
  status: TaskStatus;
  dependencies: string[]; // Önkoşul task ID'leri
  requiredCapabilities: AgentCapability[];
  assignedAgent?: string; // örn. 'claude', 'codex', 'opencode', 'agy', 'commandcode'
  assignedModel?: string; // örn. 'deepseek-v4.1-flash', 'gpt-6-astra'
  workspacePath?: string; // İzole Git Worktree yolu
  outputArtifacts: string[];
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface AgentRun {
  id: string;
  taskId: string;
  missionId: string;
  agent: string;
  model: string;
  pid?: number;
  leaseToken: string;
  leaseExpiresAt: number;
  status: 'active' | 'completed' | 'failed' | 'expired';
  startedAt: number;
  heartbeatAt: number;
  completedAt?: number;
  exitCode?: number;
  error?: string;
}

export interface Mission {
  id: string;
  title: string;
  status: 'draft' | 'running' | 'paused' | 'verifying' | 'completed' | 'failed';
  mode: MissionMode;
  repoPath: string;
  contract?: MissionContract;
  tasks: TaskNode[];
  createdAt: number;
  completedAt?: number;
}
