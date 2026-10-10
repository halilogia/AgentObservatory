import crypto from 'node:crypto';

export type EventType =
  | 'task.started'
  | 'turn.started'
  | 'tool.invoked'
  | 'tool.completed'
  | 'message.delta'
  | 'usage.updated'
  | 'turn.completed'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled';

export type AgentType = 'claude' | 'codex' | 'agy' | 'hermes' | 'ollama' | 'opencode';

export type TaskTier = 1 | 2 | 3; // 1: Native Stream, 2: Hook/OTel, 3: File Fallback

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskUsage {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export interface ToolCall {
  id?: string;
  name: string;
  input: Record<string, any>;
  timestamp: number;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  sessionId: string | null;
  agent: AgentType;
  tier: TaskTier;
  type: EventType;
  data: Record<string, any>;
  timestamp: number;
}

export interface TaskSummary {
  taskId: string;
  sessionId: string | null;
  agent: AgentType;
  status: TaskStatus;
  prompt: string;
  model: string;
  startTime: number;
  endTime: number | null;
  durationMs: number;
  toolsUsed: ToolCall[];
  assistantText: string;
  usage: TaskUsage;
  error: string | null;
}

export interface CreateEventParams {
  taskId: string;
  sessionId?: string | null;
  agent: AgentType;
  tier?: TaskTier;
  type: EventType;
  data?: Record<string, any>;
  timestamp?: number;
}

export function createEvent(params: CreateEventParams): TaskEvent {
  return {
    id: 'evt_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16),
    taskId: String(params.taskId),
    sessionId: params.sessionId ? String(params.sessionId) : null,
    agent: params.agent.toLowerCase() as AgentType,
    tier: (params.tier ?? 1) as TaskTier,
    type: params.type,
    data: params.data || {},
    timestamp: params.timestamp ?? Date.now()
  };
}
