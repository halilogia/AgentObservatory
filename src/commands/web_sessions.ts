// Web arayüzünün "Terminal oturumları" listesi: veritabanındaki görev satırlarını oturum başına toplar ve
// bir oturumun olaylarını TUI'deki aynı kurallarla (alt ajan olayları ve sahte iptaller çıkarılır) süzer.

const LIVE_WINDOW_MS = 60 * 60 * 1000; // bir saatten eski "çalışıyor" kayıtları bitmemiş eski oturum sayılır (TUI ile aynı)

export interface SessionRow { id: string; agent: string; model: string; title: string; start: number; end: number; turns: number; running: boolean; subs: number; subsRunning: number }

/** Görev satırları (yeniden eskiye) → oturum başına tek kayıt, en son etkinliği olan başta. */
export function groupSessions(rows: any[], now: number, subRows: any[] = []): SessionRow[] {
  const map = new Map<string, SessionRow>();
  for (const r of rows) {
    const id = String(r.session_id);
    const live = (r.status === 'running' || r.status === 'pending') && now - Number(r.start_time) < LIVE_WINDOW_MS;
    const end = Number(r.end_time || r.start_time);
    const s = map.get(id);
    if (!s) {
      map.set(id, { id, agent: r.agent, model: r.model || '', title: String(r.prompt || '').trim(), start: Number(r.start_time), end, turns: 1, running: live, subs: 0, subsRunning: 0 });
    } else {
      // satırlar yeniden eskiye gelir: sonra gelen daha eski bir tur; başlık ilk (en eski) istemden alınır
      s.turns++; s.start = Math.min(s.start, Number(r.start_time)); s.end = Math.max(s.end, end); s.running = s.running || live;
      if (r.prompt) s.title = String(r.prompt).trim();
    }
  }
  // alt ajan görevleri: yalnızca sayılır (oturum listesindeki rozet); kendi başlarına satır olmazlar
  for (const r of subRows) {
    const s = map.get(String(r.session_id));
    if (!s) continue;
    s.subs++;
    if ((r.status === 'running' || r.status === 'pending') && now - Number(r.start_time) < LIVE_WINDOW_MS) s.subsRunning++;
  }
  return [...map.values()].sort((a, b) => b.end - a.end);
}

/** Bir oturumun olayları: ham satırlar (data JSON metni) → nesne; son tur dışındaki 1 saniyeden kısa sahte iptaller atılır. */
export function sessionEvents(tasks: any[], rawEvents: any[]): Array<{ taskId: string; type: string; data: any; timestamp: number }> {
  const started = new Map<string, number>(tasks.map((t) => [String(t.task_id), Number(t.start_time)]));
  const last = String(tasks[tasks.length - 1]?.task_id);
  const out: Array<{ taskId: string; type: string; data: any; timestamp: number }> = [];
  for (const e of rawEvents) {
    if (!started.has(String(e.task_id))) continue;
    if (e.type === 'task.cancelled' && !(e.task_id === last && Number(e.timestamp) - (started.get(String(e.task_id)) ?? 0) >= 1000)) continue;
    let data: any = {};
    try { data = JSON.parse(e.data || '{}'); } catch { data = {}; }
    out.push({ taskId: String(e.task_id), type: e.type, data, timestamp: Number(e.timestamp) });
  }
  return out;
}

export interface SubagentOut { task_id: string; parent_task_id: string; agent: string; model: string; status: string; prompt: string; start_time: number; end_time: number | null; events: Array<{ type: string; data: any; timestamp: number }> }

/** Alt ajan görevleri + olayları: her alt ajana kendi olayları iliştirilir (ana akıştan ayrı döner). */
export function subagentsOf(subTasks: any[], rawEvents: any[]): SubagentOut[] {
  const by = new Map<string, SubagentOut>();
  for (const t of subTasks) {
    by.set(String(t.task_id), { task_id: String(t.task_id), parent_task_id: String(t.parent_task_id), agent: t.agent, model: t.model || '', status: t.status, prompt: String(t.prompt || ''), start_time: Number(t.start_time), end_time: t.end_time != null ? Number(t.end_time) : null, events: [] });
  }
  for (const e of rawEvents) {
    const s = by.get(String(e.task_id));
    if (!s) continue;
    let data: any = {};
    try { data = JSON.parse(e.data || '{}'); } catch { data = {}; }
    s.events.push({ type: e.type, data, timestamp: Number(e.timestamp) });
  }
  return [...by.values()];
}
