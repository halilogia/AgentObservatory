import type { AgentType, TaskSummary, TaskUsage } from '../core/types.ts';

/** Yerel telemetri: görev süreleri (p50/p95), başarı oranı ve token kullanımı. Saf fonksiyonlar; ağa çıkmaz. */

export interface AgentMetrics {
  agent: string;
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  /** completed / (completed + failed); biten görev yoksa null. */
  successRate: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  meanMs: number | null;
  usage: TaskUsage;
  /** Biten görev başına ortalama token; biten görev yoksa null. */
  avgTokensPerTask: number | null;
}

export interface MetricsReport {
  generatedAt: number;
  overall: AgentMetrics;
  byAgent: AgentMetrics[];
}

type MetricInput = Pick<TaskSummary, 'agent' | 'status' | 'durationMs' | 'usage'>;

const emptyUsage = (): TaskUsage => ({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 });

/** Nearest-rank yüzdelik. Sıralı dizi gerekmez; boşsa null. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((Math.min(100, Math.max(0, p)) / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

export function summarize(agent: string, tasks: MetricInput[]): AgentMetrics {
  const usage = emptyUsage();
  const durations: number[] = [];
  let completed = 0, failed = 0, cancelled = 0;
  for (const t of tasks) {
    if (t.status === 'completed') completed++;
    else if (t.status === 'failed') failed++;
    else if (t.status === 'cancelled') cancelled++;
    if ((t.status === 'completed' || t.status === 'failed') && t.durationMs > 0) durations.push(t.durationMs);
    const u = t.usage;
    if (u) {
      usage.inputTokens += u.inputTokens || 0;
      usage.cachedTokens += u.cachedTokens || 0;
      usage.outputTokens += u.outputTokens || 0;
      usage.reasoningTokens += u.reasoningTokens || 0;
      usage.totalTokens += u.totalTokens || 0;
    }
  }
  const finished = completed + failed;
  return {
    agent,
    total: tasks.length,
    completed,
    failed,
    cancelled,
    successRate: finished ? completed / finished : null,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    meanMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    usage,
    avgTokensPerTask: finished ? Math.round(usage.totalTokens / finished) : null
  };
}

export function computeMetrics(tasks: MetricInput[], now: number = Date.now()): MetricsReport {
  const groups = new Map<string, MetricInput[]>();
  for (const t of tasks) {
    const list = groups.get(t.agent) ?? [];
    list.push(t);
    groups.set(t.agent, list);
  }
  const byAgent = [...groups.entries()].map(([a, ts]) => summarize(a, ts)).sort((a, b) => b.total - a.total || a.agent.localeCompare(b.agent));
  return { generatedAt: now, overall: summarize('all', tasks), byAgent };
}

/** Store'dan son N görevi okuyup rapor üretir (getRecentTasks olan her depo). */
export function collectMetrics(store: { getRecentTasks(limit?: number): TaskSummary[] }, limit = 500): MetricsReport {
  return computeMetrics(store.getRecentTasks(limit));
}

export interface RoutingHint {
  agent: AgentType | string;
  score: number;
  reason: string;
}

/**
 * Akıllı yönlendirme ipucu: başarı oranı (ağırlık 0.7) ve hız (0.3, en hızlı p50'ye göre) birleşik skoru.
 * `minSamples`ten az biten görevi olan ajan nötr (0.5) başarı oranıyla değerlendirilir.
 */
export function rankAgents(report: MetricsReport, candidates?: string[], minSamples = 3): RoutingHint[] {
  const pool = report.byAgent.filter((m) => !candidates || candidates.includes(m.agent));
  const p50s = pool.map((m) => m.p50Ms).filter((v): v is number => v !== null && v > 0);
  const fastest = p50s.length ? Math.min(...p50s) : null;
  const hints = pool.map((m): RoutingHint => {
    const finished = m.completed + m.failed;
    const success = finished >= minSamples && m.successRate !== null ? m.successRate : 0.5;
    const speed = fastest !== null && m.p50Ms ? fastest / m.p50Ms : 0.5;
    const score = Math.round((success * 0.7 + speed * 0.3) * 1000) / 1000;
    const reason = finished >= minSamples
      ? `başarı %${Math.round(success * 100)}, p50 ${m.p50Ms ?? '-'}ms`
      : `yetersiz örnek (${finished}/${minSamples})`;
    return { agent: m.agent, score, reason };
  });
  // Verisi hiç olmayan adaylar nötr skorla listeye eklenir
  for (const c of candidates ?? []) {
    if (!hints.some((h) => h.agent === c)) hints.push({ agent: c, score: 0.5, reason: 'veri yok' });
  }
  return hints.sort((a, b) => b.score - a.score || String(a.agent).localeCompare(String(b.agent)));
}
