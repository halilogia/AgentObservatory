// Standalone office feature: pure simulation exports also run in Node tests.
export const AGENTS = [
  { id: 'agy', name: 'Antigravity', color: '#659efa', x: 180, y: 215 },
  { id: 'claude', name: 'Claude Code', color: '#e89b60', x: 380, y: 215 },
  { id: 'codex', name: 'Codex', color: '#e26869', x: 580, y: 215 },
  { id: 'opencode', name: 'OpenCode', color: '#a6b4b5', x: 780, y: 215 }
];
export const STATES = { WORLD: 'WORLD', DIALOGUE: 'DIALOGUE', TEXT_INPUT: 'TEXT_INPUT' };
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const LABELS = { idle: 'Hazır', working: 'Çalışıyor', thinking: 'Düşünüyor', reading: 'Arşivde', typing: 'Kod yazıyor', mcp: 'MCP sunucusunda', cache: 'Önbellek / kahve', waiting: 'Onay bekliyor', completed: 'Tamamlandı', failed: 'Başarısız', cancelled: 'İptal edildi' };
export const obstacles = [
  ...AGENTS.map(a => ({ x: a.x - 62, y: 148, w: 124, h: 44 })),
  { x: 60, y: 60, w: 350, h: 48 }, { x: 685, y: 60, w: 175, h: 48 },
  { x: 70, y: 355, w: 100, h: 100 }, { x: 346, y: 350, w: 268, h: 90 },
  { x: 770, y: 365, w: 105, h: 70 }
];
export class InputManager {
  mode = STATES.WORLD;
  keys = new Set();
  setMode(mode) { this.mode = mode; this.keys.clear(); }
  down(key) { if (this.mode === STATES.WORLD) this.keys.add(key.toLowerCase()); }
  up(key) { this.keys.delete(key.toLowerCase()); }
  vector() {
    if (this.mode !== STATES.WORLD) return { x: 0, y: 0 };
    const k = this.keys;
    const x = Number(k.has('d') || k.has('arrowright')) - Number(k.has('a') || k.has('arrowleft'));
    const y = Number(k.has('s') || k.has('arrowdown')) - Number(k.has('w') || k.has('arrowup'));
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  }
}
export function createWorld() {
  return { player: { x: 480, y: 485 }, tasks: new Map(), time: 0,
    agents: AGENTS.map(a => ({ ...a, homeX: a.x, homeY: a.y })) };
}
export function classifyTool(name) {
  if (/mcp/i.test(name)) return 'mcp';
  if (/bash|shell|exec|edit|write|patch/i.test(name)) return 'typing';
  if (/read|search|find|grep|glob|list/i.test(name)) return 'reading';
  return 'thinking';
}
export function feed(world, event) {
  if (!AGENTS.some(a => a.id === event.agent) || !event.taskId) return;
  let task = world.tasks.get(event.taskId);
  if (!task) {
    task = { id: event.taskId, agent: event.agent, status: 'running', mode: 'working', prompt: '', text: '', tool: '', permission: null, seq: 0, started: event.timestamp || 0 };
    world.tasks.set(task.id, task);
    // Keep active tasks, evict the oldest completed history first.
    if (world.tasks.size > 500) for (const [id, old] of world.tasks) {
      if (TERMINAL.has(old.status)) { world.tasks.delete(id); break; }
    }
  }
  if (event.seq && event.seq <= task.seq) return;
  task.seq = event.seq || task.seq;
  if (TERMINAL.has(task.status)) return;
  const d = event.data || {};
  switch (event.type) {
    case 'task.started': task.prompt = String(d.prompt || ''); break;
    case 'message.delta':
      task.text = (task.text + String(d.text || '')).slice(-16000);
      if (!task.permission) task.mode = d.thinking ? 'thinking' : 'typing';
      break;
    case 'tool.invoked': task.tool = String(d.name || d.tool || ''); if (!task.permission) task.mode = classifyTool(task.tool); break;
    case 'tool.completed': if (!task.permission) task.mode = 'thinking'; break;
    case 'usage.updated': if (task.agent === 'claude' && (d.cachedTokens || d.usage?.cachedTokens) > 0 && !task.permission) task.mode = 'cache'; break;
    case 'permission.requested': task.permission = d; task.mode = 'waiting'; break;
    case 'permission.resolved': task.permission = null; task.mode = 'thinking'; break;
    case 'task.completed': case 'task.failed': case 'task.cancelled':
      task.status = event.type.slice(5); task.mode = task.status; task.permission = null;
      task.result = String(d.summary || d.result || d.error || d.message || task.text || 'Çıktı kaydedilmedi.');
      break;
  }
  return task;
}
export function tasksFor(world, agent) {
  return [...world.tasks.values()].filter(t => t.agent === agent).sort((a, b) => b.started - a.started);
}
export function currentTask(world, agent) {
  const tasks = tasksFor(world, agent);
  return tasks.find(t => t.permission) || tasks.find(t => !TERMINAL.has(t.status)) || tasks[0];
}
export function nearestAgent(world) {
  return world.agents.find(a => Math.hypot(world.player.x - a.homeX, world.player.y - a.homeY) <= 50);
}
export function canMove(x, y) {
  return x >= 34 && x <= 926 && y >= 120 && y <= 526 && !obstacles.some(o => x + 9 > o.x && x - 9 < o.x + o.w && y + 6 > o.y && y - 6 < o.y + o.h);
}
export function step(world, input, elapsed) {
  const dt = Math.min(elapsed, .05); world.time += dt;
  const v = input.vector(), p = world.player;
  if (canMove(p.x + v.x * dt * 145, p.y)) p.x += v.x * dt * 145;
  if (canMove(p.x, p.y + v.y * dt * 145)) p.y += v.y * dt * 145;
  for (const a of world.agents) {
    const mode = currentTask(world, a.id)?.mode;
    const target = mode === 'reading' ? { x: 110 + AGENTS.findIndex(b => b.id === a.id) * 75, y: 130 }
      : mode === 'mcp' ? { x: 190, y: 410 } : mode === 'cache' ? { x: 745, y: 410 } : { x: a.homeX, y: a.homeY };
    // Navigate via the clear aisle around the desk bank.
    let waypoint = target;
    if ((a.y < 145) !== (target.y < 145)) {
      if (Math.abs(a.x - 48) > 2) waypoint = { x: 48, y: a.y };
      else waypoint = { x: 48, y: target.y };
    }
    const dx = waypoint.x - a.x, dy = waypoint.y - a.y, dist = Math.hypot(dx, dy);
    const speed = Math.min(dist, dt * 100);
    if (dist) { a.x += dx / dist * speed; a.y += dy / dist * speed; }
  }
}
export function drawWorld(g, world) {
  const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const text = (s, x, y, c = '#e3ddbc', size = 11) => { g.fillStyle = c; g.font = `${size}px monospace`; g.textAlign = 'center'; g.fillText(s, x, y); };
  g.imageSmoothingEnabled = false;
  rect(0, 0, 960, 560, '#1c2d32'); rect(24, 32, 912, 504, '#a58a65');
  for (let y = 110; y < 530; y += 28) for (let x = 26; x < 930; x += 56) {
    rect(x, y, 54, 26, (x + y) % 3 ? '#ad956f' : '#b39b75'); rect(x + 8, y + 20, 27, 1, '#9c835f');
  }
  rect(24, 32, 912, 77, '#556c63'); rect(24, 104, 912, 8, '#314c45');
  rect(24, 32, 912, 8, '#839183'); text('O B S E R V A T O R Y   /   OPERASYON KATI', 490, 65, '#e2d7b2', 13);
  // Archive and windows.
  rect(60, 60, 350, 48, '#554d3c');
  for (let i = 0; i < 42; i++) rect(67 + i * 8, 66 + (i % 3), 5, 28, ['#b49c66', '#809a8c', '#c18368', '#758daa'][i % 4]);
  rect(60, 98, 350, 7, '#746346'); text('ARŞİV / READ · SEARCH', 230, 50, '#e3ddbc', 10);
  rect(685, 60, 175, 44, '#233c4b'); rect(691, 65, 77, 32, '#8bb3b6'); rect(776, 65, 77, 32, '#8bb3b6');
  for (const a of world.agents) {
    const task = currentTask(world, a.id), mode = task?.mode || 'idle';
    rect(a.homeX - 74, 140, 148, 112, '#776f58'); rect(a.homeX - 70, 144, 140, 104, '#88917b');
    rect(a.homeX - 58, 190, 9, 15, '#4c4437'); rect(a.homeX + 49, 190, 9, 15, '#4c4437');
    rect(a.homeX - 64, 148, 128, 44, '#5e4c37'); rect(a.homeX - 64, 148, 128, 36, '#d1b180');
    rect(a.homeX - 22, 142, 44, 29, '#27383b'); rect(a.homeX - 18, 146, 36, 19, mode === 'idle' ? '#465c59' : '#63af9c');
    if (mode === 'typing') for (let i = 0; i < 3; i++) rect(a.homeX - 15, 149 + i * 5, 8 + (Math.floor(world.time * 12 + i) % 20), 2, '#b3ed9a');
    rect(a.homeX - 18, 177, 36, 6, '#e3d7b1'); rect(a.homeX + 38, 166, 9, 11, '#efe1ba');
    rect(a.homeX - 28, 258, 56, 3, a.color); text(a.name, a.homeX, 280, '#263b36', 12);
    text(LABELS[mode], a.homeX, 298, '#33453d', 10);
  }
  // Shared furniture: server rack, meeting table, coffee and plants.
  rect(70, 355, 100, 100, '#283e43');
  for (let i = 0; i < 5; i++) { rect(78, 363 + i * 16, 83, 12, '#42565b'); rect(148, 367 + i * 16, 5, 4, Math.floor(world.time * 2 + i) % 2 ? '#92d9aa' : '#53786a'); }
  text('MCP / SERVER', 120, 476, '#33453d', 10);
  for (const x of [382, 457, 532]) { rect(x, 331, 40, 18, '#546d63'); rect(x, 445, 40, 18, '#546d63'); }
  rect(346, 350, 268, 90, '#67543d'); rect(350, 350, 260, 80, '#d3b781');
  rect(449, 372, 35, 23, '#ede2be'); rect(488, 383, 24, 18, '#a3b3a0'); text('TOPLANTI ALANI', 480, 417, '#6c634c', 10);
  rect(770, 365, 105, 70, '#65513c'); rect(765, 360, 115, 16, '#d7bb88');
  rect(781, 333, 27, 28, '#344d4d'); rect(788, 342, 13, 12, '#99c1ca'); rect(831, 345, 19, 16, '#eee1b8');
  text('CACHE / KAHVE', 825, 459, '#33453d', 10);
  for (const [x, y] of [[50, 270], [900, 310], [660, 475]]) { rect(x - 8, y, 18, 18, '#97694c'); rect(x - 14, y - 19, 28, 18, '#426d51'); rect(x - 5, y - 30, 12, 30, '#56885f'); }
  function person(x, y, color, bounce = 0) {
    y += bounce; rect(x - 10, y + 4, 22, 5, '#0003'); rect(x - 7, y - 5, 5, 10, '#283b41'); rect(x + 3, y - 5, 5, 10, '#283b41');
    rect(x - 10, y - 21, 20, 17, color); rect(x - 8, y - 35, 16, 15, '#edc594'); rect(x - 9, y - 38, 18, 7, '#443b38'); rect(x + 3, y - 29, 3, 3, '#25343b');
  }
  for (const a of world.agents) {
    const mode = currentTask(world, a.id)?.mode || 'idle';
    person(a.x, a.y, a.color, mode === 'completed' ? -Math.abs(Math.sin(world.time * 5)) * 5 : 0);
    if (mode === 'waiting') { rect(a.x + 13, a.y - 27, 5, 10, '#edc594'); rect(a.x - 15, a.y - 31, 4, 7, '#86c9ec'); }
    const badge = { thinking: '☀ · ·', waiting: '!', completed: '✓', failed: '✗', cancelled: '—', reading: '▤', cache: '☕', mcp: '↔' }[mode];
    if (badge) { rect(a.x - 20, a.y - 64, 40, 21, '#253c37'); text(badge, a.x, a.y - 49, mode === 'failed' ? '#fa8d83' : mode === 'completed' ? '#98e0a1' : '#f3d58a', 15); }
  }
  person(world.player.x, world.player.y, '#efda89'); text('SEN', world.player.x, world.player.y + 18, '#32443d', 10);
  const near = nearestAgent(world);
  if (near) { rect(near.homeX - 87, 114, 174, 23, '#263e36'); text('[E] Konuş / Görev Ver', near.homeX, 130, '#ffe1a0', 11); }
}

export function mountOffice(doc = document) {
  const $ = id => doc.getElementById(id), world = createWorld(), input = new InputManager();
  const canvas = $('world'), g = canvas.getContext('2d'), dialog = $('dialogue');
  const token = doc.querySelector('meta[name="obs-token"]').content;
  let config = null, selected = null, view = 'inspect', stream, stopped = false, frame, timer, last = 0, approving = false;
  const api = async (url, body) => {
    const response = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-observatory-token': token }, body: JSON.stringify(body) });
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || `HTTP ${response.status}`); }
    return response.json();
  };
  const chosen = () => world.tasks.get($('task').value);
  function renderDialogue() {
    if (!selected) return;
    const tasks = tasksFor(world, selected.id), previous = $('task').value;
    $('task').replaceChildren(...tasks.map(t => new Option(`${LABELS[t.mode]} · ${t.prompt.slice(0, 48) || t.id}`, t.id)));
    if (tasks.some(t => t.id === previous)) $('task').value = previous;
    else $('task').value = currentTask(world, selected.id)?.id || '';
    const task = chosen();
    $('report').textContent = !task ? 'Bu ajan için kaydedilmiş görev yok.' : view === 'summary'
      ? (TERMINAL.has(task.status) ? task.result || task.text || 'Çıktı kaydedilmedi.' : 'Bu görev henüz tamamlanmadı.')
      : `${LABELS[task.mode]}\nGörev: ${task.prompt || task.id}\nSon araç: ${task.tool || '—'}\n\n${task.text || 'Henüz çıktı yok.'}`;
    $('approval').hidden = !task?.permission;
    $('permission').textContent = task?.permission ? `İzin isteği: ${JSON.stringify(task.permission).slice(0, 3000)}` : '';
    $('allow').disabled = $('deny').disabled = approving || !config || !token || !task?.permission;
  }
  function open(agent) {
    selected = agent; view = 'inspect'; input.setMode(STATES.DIALOGUE);
    $('agent-name').textContent = agent.name; $('feedback').textContent = ''; $('prompt-form').hidden = true;
    $('task').replaceChildren(); renderDialogue();
    const engine = config?.engines.find(e => e.id === agent.id);
    $('new-task').disabled = !token || !engine?.installed;
    $('model').replaceChildren(...(engine?.models || []).map(m => new Option(m.label, m.id)));
    $('mode').value = 'read'; $('mode').options[1].disabled = !engine?.write || !config?.writeAllowed;
    $('cwd').value = config?.defaultCwd || '';
    if (!dialog.open) dialog.showModal();
  }
  function close() { dialog.close(); input.setMode(STATES.WORLD); selected = null; canvas.focus(); }
  $('close').onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('focusin', event => input.setMode(/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) ? STATES.TEXT_INPUT : STATES.DIALOGUE));
  $('task').onchange = renderDialogue;
  $('inspect').onclick = () => { view = 'inspect'; renderDialogue(); };
  $('summary').onclick = () => { view = 'summary'; renderDialogue(); };
  $('new-task').onclick = () => { $('prompt-form').hidden = false; $('prompt').focus(); };
  $('prompt-form').onsubmit = async event => {
    event.preventDefault(); if ($('send').disabled || !selected) return;
    const agent = selected.id;
    $('send').disabled = true; $('feedback').textContent = 'Görev başlatılıyor…';
    try {
      const result = await api('/api/run', { engine: agent, model: $('model').value, prompt: $('prompt').value, cwd: $('cwd').value, mode: $('mode').value });
      $('feedback').textContent = `Görev başlatıldı: ${result.taskId}`; $('prompt').value = ''; $('prompt-form').hidden = true; $('inspect').focus();
    } catch (error) { $('feedback').textContent = error.message; }
    finally { $('send').disabled = false; }
  };
  async function approve(approved) {
    const task = chosen(); if (!task?.permission || $('allow').disabled) return;
    approving = true;
    $('allow').disabled = $('deny').disabled = true;
    try {
      await api('/api/approve', { taskId: task.id, approved });
      task.permission = null; task.mode = 'thinking'; $('feedback').textContent = approved ? 'İzin verildi.' : 'İstek reddedildi.';
    } catch (error) { $('feedback').textContent = error.message; }
    approving = false; renderDialogue();
  }
  $('allow').onclick = () => approve(true); $('deny').onclick = () => approve(false);
  for (const agent of AGENTS) { const b = doc.createElement('button'); b.id = `agent-${agent.id}`; b.onclick = () => open(agent); $('agents').append(b); }
  const keydown = event => {
    if (input.mode !== STATES.WORLD || /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(event.target.tagName)) return;
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'e'].includes(key)) event.preventDefault();
    if (key === 'e' && !event.repeat) { const near = nearestAgent(world); if (near) open(near); }
    else input.down(key);
  };
  const keyup = event => input.up(event.key), blur = () => input.keys.clear();
  window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', blur);
  function animate(now) {
    if (stopped) return;
    step(world, input, last ? (now - last) / 1000 : 0); last = now; drawWorld(g, world);
    $('hint').textContent = nearestAgent(world) ? '[E] Konuş / Görev Ver' : 'Bir ajanın masasına yaklaş.';
    frame = requestAnimationFrame(animate);
  }
  function refresh() {
    for (const a of AGENTS) $('agent-' + a.id).textContent = `${a.name} · ${LABELS[currentTask(world, a.id)?.mode || 'idle']}`;
    if (dialog.open && doc.activeElement !== $('task')) renderDialogue();
  }
  async function connect() {
    try {
      const health = await api('/health');
      const rows = await api('/tasks?limit=100');
      const latest = new Map();
      for (const row of rows) if (AGENTS.some(a => a.id === row.agent) && (!TERMINAL.has(row.status) || !latest.has(row.agent))) {
        latest.set(row.agent, true);
        const detail = await api(`/tasks/${encodeURIComponent(row.task_id)}`);
        for (const event of detail.events) feed(world, event);
      }
      if (stopped) return;
      stream = new EventSource(`/stream?since=${health.lastSeq}`);
      stream.addEventListener('observatory', event => { try { feed(world, JSON.parse(event.data)); } catch { $('notice').textContent = 'Bir telemetri olayı okunamadı.'; } });
      stream.onopen = () => { $('connection').textContent = '● CANLI TELEMETRİ'; };
      stream.onerror = () => { $('connection').textContent = '○ Bağlantı kesildi · yeniden bağlanıyor'; };
    } catch (error) { $('connection').textContent = `Bağlantı hatası: ${error.message}`; if (!stopped) timer = setTimeout(connect, 5000); }
  }
  if (token) api('/api/config').then(value => { config = value; $('notice').textContent = 'Canlı veriler · Görevler seçtiğin motorun gerçek CLI oturumunda çalışır.'; if (selected) open(selected); }).catch(error => { $('notice').textContent = `Görev ayarları alınamadı: ${error.message}`; });
  else $('notice').textContent = 'Salt okunur izleme. Görev ve onay için observatory web sunucusunda /office aç.';
  connect(); refresh(); const refreshTimer = setInterval(refresh, 500); frame = requestAnimationFrame(animate); canvas.focus();
  const dispose = () => { stopped = true; stream?.close(); clearTimeout(timer); clearInterval(refreshTimer); cancelAnimationFrame(frame); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur); };
  window.addEventListener('pagehide', dispose, { once: true });
  return { world, input, open, close, dispose };
}
if (typeof document !== 'undefined') mountOffice();
