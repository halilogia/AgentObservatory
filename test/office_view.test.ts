import assert from 'node:assert/strict';
import { renderOfficeView } from '../src/ui/office_view.ts';
import type { TaskSummary } from '../src/core/types.ts';

const now = 1_000_000_000;
const mk = (id: string, agent: TaskSummary['agent'], extra: Partial<TaskSummary> = {}): TaskSummary => ({
  taskId: id, sessionId: null, agent, status: 'completed', prompt: 'görev ' + id, model: agent,
  startTime: now - 5000, endTime: now - 4000, durationMs: 1000, toolsUsed: [], assistantText: 'özet ' + id,
  usage: { inputTokens: 1000, cachedTokens: 0, outputTokens: 500, reasoningTokens: 0, totalTokens: 1500 }, error: null, ...extra
});
const tasks = [
  mk('a1', 'agy', { status: 'running', endTime: null }),
  mk('a2', 'agy', { parentTaskId: 'a1' }),
  mk('c1', 'claude', { status: 'running', endTime: null, toolsUsed: [{ name: 'Edit', input: { file_path: 'src/x.ts' }, timestamp: now }] }),
  mk('x1', 'codex', { status: 'failed', error: 'denetim hatası' }),
  mk('o1', 'opencode')
];
const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
const width = (l: string) => [...strip(l)].reduce((a, ch) => a + (ch.codePointAt(0)! >= 0x1f300 || ch === '⚫' ? 2 : 1), 0);

const wide = strip(renderOfficeView({ cols: 140, rows: 40, now, tasks }));
for (const s of ['NEXUS AGENT OBSERVATORY', 'OFİS & İSTASYON YÖNETİMİ', 'MİMAR İSTASYONU', 'GELİŞTİRİCİ MASASI', 'DENETİM & GÜVENLİK', 'VERİ & AMELE TEZGAHI', 'Aktif', 'Kodluyor', '1 dağıtıldı', 'hatalı', '[O / Esc] Ağaca Dön  ·  [W] Web Paneli  ·  [Q] Çıkış']) {
  assert.ok(wide.includes(s), 'eksik: ' + s);
}
// 2x2 grid: iki kart başlığı aynı satırda
assert.ok(wide.split('\n').some((l) => l.includes('MİMAR İSTASYONU') && l.includes('GELİŞTİRİCİ MASASI')));
assert.ok(wide.split('\n').some((l) => l.includes('DENETİM & GÜVENLİK') && l.includes('VERİ & AMELE TEZGAHI')));

const narrow = strip(renderOfficeView({ cols: 80, rows: 60, now, tasks, statusBanner: 'DURUM' }));
assert.ok(!narrow.split('\n').some((l) => l.includes('MİMAR İSTASYONU') && l.includes('GELİŞTİRİCİ MASASI')));
assert.ok(narrow.includes('DURUM'));
for (const l of narrow.split('\n')) assert.ok(width(l) <= 79, 'taşma: ' + l);

const empty = strip(renderOfficeView({ cols: 120, rows: 40, now, tasks: [] }));
assert.ok(empty.includes('Boşta') && !empty.includes('Aktif'));
console.log('office_view OK');
