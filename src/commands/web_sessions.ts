// Web arayüzünün "Terminal oturumları" listesi: veritabanındaki görev satırlarını oturum başına toplar ve
// bir oturumun olaylarını TUI'deki aynı kurallarla (alt ajan olayları ve sahte iptaller çıkarılır) süzer.

const LIVE_WINDOW_MS = 60 * 60 * 1000; // bir saatten eski "çalışıyor" kayıtları bitmemiş eski oturum sayılır (TUI ile aynı)

export interface SessionRow { id: string; agent: string; model: string; title: string; start: number; end: number; turns: number; running: boolean }

/** Görev satırları (yeniden eskiye) → oturum başına tek kayıt, en son etkinliği olan başta. */
export function groupSessions(rows: any[], now: number): SessionRow[] {
  const map = new Map<string, SessionRow>();
  for (const r of rows) {
    const id = String(r.session_id);
    const live = (r.status === 'running' || r.status === 'pending') && now - Number(r.start_time) < LIVE_WINDOW_MS;
    const end = Number(r.end_time || r.start_time);
    const s = map.get(id);
    if (!s) {
      map.set(id, { id, agent: r.agent, model: r.model || '', title: String(r.prompt || '').trim(), start: Number(r.start_time), end, turns: 1, running: live });
    } else {
      // satırlar yeniden eskiye gelir: sonra gelen daha eski bir tur; başlık ilk (en eski) istemden alınır
      s.turns++; s.start = Math.min(s.start, Number(r.start_time)); s.end = Math.max(s.end, end); s.running = s.running || live;
      if (r.prompt) s.title = String(r.prompt).trim();
    }
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
