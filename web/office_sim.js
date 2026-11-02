// @ts-mandatory: Tarayıcıda sıfır-derleme (zero-build CSP script-src self) ile doğrudan çalışan Canvas2D modülüdür.
// Canlı AI Ofis Kampüsü (pixel-agents + claude-code-park + MuratifyAI Telif-Temiz Özgün Sentezi)
// Saf Canvas 2D, dış bağımlılık yok (CSP: script-src 'self'). Mantık (feed/step) çizimden ayrıdır; Node'da test edilir.
(function (root) {
  'use strict';
  var W = 320, H = 180, SCALE = 3;
  // Provider definitions are visual themes, never actor identities.
  var THEMES = {
    agy: { name: 'Antigravity', color: '#4c8dff', hair: '#1d3f8f', accent: '#60a5fa' },
    claude: { name: 'Claude', color: '#ff8a3d', hair: '#7a3a0b', accent: '#fb923c' },
    codex: { name: 'Codex', color: '#ef5350', hair: '#6b1b1a', accent: '#f87171' },
    opencode: { name: 'OpenCode', color: '#8b949e', hair: '#30363d', accent: '#94a3b8' },
    pixel: { name: 'Pixel Artist', color: '#a855f7', hair: '#4c1d95', accent: '#c084fc' }
  };
  var HOOK_NAMES = ['Init', 'Prompt', 'PreTool', 'Exec', 'PostTool', 'Spawn', 'Perm', 'Done', 'Stop'];
  var SPEED = 90, ROW = 88, COLUMNS = 4;
  var terminal = function (status) { return /^(completed|failed|cancelled)$/.test(status); };
  var seat = function (i) { return { x: 46 + (i % COLUMNS) * 76, y: 112 + Math.floor(i / COLUMNS) * ROW }; };
  var theme = function (a) { return THEMES[a.providerId] || { name: a.providerId, color: '#a371f7', hair: '#45305e', accent: '#c084fc' }; };

  function classifyTool(name) {
    var words = String(name || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/);
    if (words.some(function (w) { return /^(write|edit|patch|replace|create|delete|move|mkdir)$/.test(w); })) return 'typing';
    if (words.some(function (w) { return /^(bash|shell|exec|execute|run|command|terminal)$/.test(w); })) return 'running';
    if (words.some(function (w) { return /^(read|view|cat|search|grep|glob|find|list|fetch|web|browse|open|lookup|get|ls)$/.test(w); })) return 'reading';
    if (words.some(function (w) { return /^(reason|reasoning|think|thinking)$/.test(w); })) return 'thinking';
    return 'working';
  }

  class StationAllocator {
    constructor() { this.slots = new Map(); }
    allocate(id, parentId) {
      if (this.slots.has(id)) return this.slots.get(id);
      var used = new Set(this.slots.values()), parent = this.slots.get(parentId), candidates = [];
      for (var i = 0; i <= (used.size + 1) * COLUMNS; i++) if (!used.has(i)) candidates.push(i);
      if (parent !== undefined) {
        var p = seat(parent);
        candidates.sort(function (a, b) { var x = seat(a), y = seat(b); return Math.hypot(x.x - p.x, x.y - p.y) - Math.hypot(y.x - p.x, y.y - p.y) || a - b; });
      }
      this.slots.set(id, candidates[0]); return candidates[0];
    }
    release(id) { this.slots.delete(id); }
  }

  class ActorRegistry {
    constructor() {
      this.actors = Object.create(null);
      this.tasks = new Map(); this.sessions = new Map(); this.stations = new StationAllocator();
      this.order = []; this.nextId = 1;
    }
    resolve(ev) {
      var id = String(ev.taskId), task = this.tasks.get(id);
      var provider = String(ev.agent || (task && task.providerId) || 'unknown').toLowerCase();
      var session = String(ev.sessionId || (task && task.sessionId) || '');
      var parent = String(ev.parentTaskId || (task && task.parentTaskId) || '');
      var key = session ? JSON.stringify([provider, session, parent ? id : '']) : '';
      var a = task && this.actors[task.actorId], existing = key && this.actors[this.sessions.get(key)];
      if (!a && existing) a = existing;
      if (a && parent && !a.parentTaskId && a.taskIds.size > 1) { a.taskIds.delete(id); a = null; }
      if (a && existing && a !== existing) {
        a.taskIds.delete(id); existing.taskIds.add(id);
        if (!a.taskIds.size) this.remove(a.id);
        a = existing;
      }
      if (!a) {
        var actorId = 'actor-' + this.nextId++;
        a = { id: actorId, providerId: provider, sessionId: session, parentTaskId: parent,
          taskIds: new Set(), idx: this.stations.allocate(actorId, this.tasks.get(parent)?.actorId),
          x: 8, y: 70, tx: 8, ty: 70, mode: 'idle', badge: null, doneCount: 0, failCount: 0,
          idleAt: 0, walking: false, tool: '', speechUntil: 0, lastSeenAt: 0, hookIdx: 0 };
        this.actors[a.id] = a; this.order.push(a.id);
        a.y = seat(a.idx).y + 24;
      }
      if (a.parentTaskId !== parent || a.sessionId !== session) {
        for (var [oldKey, value] of this.sessions) if (value === a.id) this.sessions.delete(oldKey);
      }
      a.sessionId = session; a.parentTaskId = parent; a.taskIds.add(id);
      if (key) this.sessions.set(key, a.id);
      if (!task) {
        task = { id: id, actorId: a.id, providerId: provider, status: 'running', tools: new Map(), closedTools: new Set(),
          waiting: false, timestamp: 0, sessionId: session, parentTaskId: parent, mode: 'thinking' };
        this.tasks.set(id, task);
      }
      task.actorId = a.id; task.sessionId = session; task.parentTaskId = parent;
      return { actor: a, task: task };
    }
    remove(id) {
      var a = this.actors[id]; if (!a) return;
      a.taskIds.forEach((taskId) => this.tasks.delete(taskId));
      for (var [key, value] of this.sessions) if (value === id) this.sessions.delete(key);
      this.stations.release(id); delete this.actors[id]; this.order.splice(this.order.indexOf(id), 1);
    }
  }

  function createState() {
    var registry = new ActorRegistry();
    return { t: 0, registry: registry, actors: registry.actors, order: registry.order,
      seen: new Set(), cameraY: 0, selectedActorId: null, hookPulses: [0, 0, 0, 0, 0, 0, 0, 0, 0], totalHooks: 0 };
  }
  function pulseHook(s, idx) {
    if (s.hookPulses && idx >= 0 && idx < 9) {
      s.hookPulses[idx] = s.t + 2.2;
      s.totalHooks = (s.totalHooks || 0) + 1;
    }
  }
  function badge(a, kind, t, ttl) { a.badge = { kind: kind, until: ttl ? t + ttl : Infinity }; }
  function activeTasks(s, a) { return Array.from(a.taskIds, function (id) { return s.registry.tasks.get(id); }).filter(function (task) { return task && !terminal(task.status); }); }
  function refresh(s, a) {
    var tasks = activeTasks(s, a), waiting = tasks.some(function (task) { return task.waiting; });
    var tools = tasks.flatMap(function (task) { return Array.from(task.tools.values()); });
    var tool = tools[tools.length - 1];
    if (tasks.length) {
      a.mode = waiting ? 'waiting' : tool ? classifyTool(tool.name) : 'thinking';
      a.tool = tool ? tool.name : '';
      if (waiting) badge(a, 'ask', s.t, 0);
      else if (a.badge && a.badge.kind === 'ask') a.badge = null;
    }
    var p = seat(a.idx); a.tx = p.x; a.ty = p.y + (a.mode === 'idle' ? 24 : 0);
  }
  function remember(s, id) {
    if (!id) return true;
    if (s.seen.has(id)) return false;
    s.seen.add(id);
    if (s.seen.size > 10000) s.seen.delete(s.seen.values().next().value);
    return true;
  }
  function feed(s, ev) {
    if (!ev || !ev.type || !ev.taskId || !remember(s, ev.id)) return null;
    var resolved = s.registry.resolve(ev), a = resolved.actor, task = resolved.task, d = ev.data || {};
    a.lastSeenAt = s.t;
    if (ev.type === 'task.started') {
      pulseHook(s, ev.parentTaskId ? 5 : 0);
      pulseHook(s, 1);
      a.hookIdx = ev.parentTaskId ? 5 : 1;
    }
    if (terminal(task.status)) return a;
    task.timestamp = Math.max(task.timestamp, Number(ev.timestamp) || 0);
    var toolId = String(d.toolUseId || d.tool_use_id || d.id || '');
    if (/^task\.(completed|failed|cancelled)$/.test(ev.type)) {
      task.status = ev.type.slice(5); task.tools.clear(); task.waiting = false;
      if (task.status === 'completed') { a.doneCount++; pulseHook(s, 7); }
      if (task.status === 'failed') { a.failCount++; pulseHook(s, 8); }
      pulseHook(s, 8);
      a.hookIdx = 8;
      if (!activeTasks(s, a).length) {
        a.mode = task.status === 'failed' ? 'failed' : 'done';
        badge(a, task.status === 'failed' ? 'deny' : 'ok', s.t, 2.5); a.idleAt = s.t + 2.5;
      }
    } else if (ev.type === 'tool.invoked') {
      if (!toolId) toolId = 'anonymous:' + (ev.id || task.tools.size + ':' + s.t);
      if (!task.closedTools.has(toolId)) {
        var tName = String(d.name || d.tool || '');
        task.tools.set(toolId, { name: tName, at: Number(ev.timestamp) || 0 });
        a.speechUntil = s.t + 3; a.badge = null;
        pulseHook(s, 2); pulseHook(s, 3);
        a.hookIdx = 3;
      }
    } else if (ev.type === 'tool.completed') {
      if (!toolId && task.tools.size === 1) toolId = task.tools.keys().next().value;
      if (toolId) { task.tools.delete(toolId); task.closedTools.add(toolId); }
      pulseHook(s, 4);
      a.hookIdx = 4;
      if (d.isError || d.error) badge(a, 'deny', s.t, 1.5);
    } else if (ev.type === 'permission.requested' || ev.type === 'tool.blocked' || d.blocked || d.denied) {
      task.waiting = true;
      pulseHook(s, 6);
      a.hookIdx = 6;
    } else if (ev.type === 'permission.resolved') {
      task.waiting = false;
      pulseHook(s, 4);
      badge(a, d.allowed === false || d.approved === false || /deny|reject|block/i.test(String(d.decision || d.outcome || '')) ? 'deny' : 'ok', s.t, 1.5);
    }
    s.order.forEach(function (id) { refresh(s, s.actors[id]); });
    return a;
  }

  function reconcile(s, rows) {
    (rows || []).forEach(function (row) {
      if (!row.taskId || !row.agent) return;
      var old = s.registry.tasks.get(String(row.taskId));
      if (!old && terminal(row.status)) return;
      var result = s.registry.resolve(row), task = result.task, a = result.actor;
      if (terminal(row.status) && !terminal(task.status)) feed(s, { taskId: row.taskId, agent: row.agent, sessionId: row.sessionId, parentTaskId: row.parentTaskId, type: 'task.' + row.status, timestamp: row.endTime });
      refresh(s, a);
    });
  }
  function worldHeight(s) { return Math.max(H, ...s.order.map(function (id) { return seat(s.actors[id].idx).y + 60; })); }
  function step(s, dt) {
    dt = Math.max(0, Number(dt) || 0); s.t += dt;
    s.order.slice().forEach(function (id) {
      var a = s.actors[id];
      if (a.badge && s.t >= a.badge.until) a.badge = null;
      if (!activeTasks(s, a).length && s.t >= a.idleAt) { a.mode = 'idle'; refresh(s, a); }
      if (a.mode === 'idle' && s.t - a.lastSeenAt > 120 && s.selectedActorId !== id && !s.order.some(function (child) { return s.actors[child].parentTaskId && a.taskIds.has(s.actors[child].parentTaskId); })) { s.registry.remove(id); return; }
      var target = { x: a.tx, y: a.ty };
      if (Math.abs(a.x - a.tx) > 0.5) target.y = seat(a.idx).y + 24;
      if (Math.abs(a.y - target.y) > 0.5 && Math.abs(a.x - a.tx) > 0.5) target.x = a.x;
      var dx = target.x - a.x, dy = target.y - a.y, dist = Math.hypot(dx, dy), mv = Math.min(dist, SPEED * dt);
      a.walking = dist > 0.5;
      if (dist) { a.x += dx / dist * mv; a.y += dy / dist * mv; }
    });
    s.cameraY = Math.max(0, Math.min(s.cameraY, worldHeight(s) - H));
    return s;
  }

  function poseOf(a) { return a.walking ? 'walking' : a.mode; }

  // ---------------- ÇİZİM (3'lü Görsel Sentez: pixel-agents + claude-code-park + MuratifyAI) ----------------
  var GLYPH = {
    ask: ['..#..', '..#..', '..#..', '.....', '..#..'],
    ok: ['.....', '....#', '#..#.', '.##..', '..#..'],
    deny: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#']
  };
  var BADGE_BG = { ask: '#d29922', ok: '#2ea043', deny: '#da3633' };

  function rect(c, col, x, y, w, h) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }
  function drawBadge(c, kind, x, y) {
    var bx = Math.round(x) - 6, by = Math.round(y) - 31;
    rect(c, BADGE_BG[kind], bx, by, 12, 10); rect(c, BADGE_BG[kind], bx + 5, by + 10, 2, 2);
    var g = GLYPH[kind];
    for (var r = 0; r < 5; r++) for (var q = 0; q < 5; q++) if (g[r].charAt(q) === '#') rect(c, '#fff', bx + 3 + q, by + 2 + r, 1, 1);
  }

  function bubbleKind(a) {
    if (!a) return '';
    if (a.mode === 'waiting' || (a.badge && a.badge.kind === 'ask')) return 'ask';
    if (a.mode === 'reading') return 'read';
    if (a.mode === 'running') return 'term';
    if (a.mode === 'typing') return 'write';
    if (a.mode === 'thinking') return 'think';
    return '';
  }

  /** claude-code-park + pixel-agents tarzı koyu aksiyon ve araç balonu */
  function drawSpeechBubble(c, kind, x, y, t) {
    if (!kind) return;
    var bx = Math.round(x) - 8, by = Math.round(y) - 41;
    rect(c, 'rgba(0,0,0,.35)', bx + 1, by + 2, 16, 12);
    rect(c, '#0f172a', bx, by, 16, 12);
    rect(c, '#1e293b', bx + 1, by + 1, 14, 10);
    rect(c, '#0f172a', bx + 7, by + 12, 3, 2);

    if (kind === 'term') {
      rect(c, '#090d16', bx + 3, by + 2, 10, 7);
      rect(c, '#3fb950', bx + 4, by + 3, 2, 1);
      rect(c, '#58a6ff', bx + 5, by + 5, 6, 1);
      rect(c, '#8b949e', bx + 5, by + 7, 3, 1);
    } else if (kind === 'read') {
      rect(c, '#38bdf8', bx + 4, by + 2, 8, 8);
      rect(c, '#f8fafc', bx + 5, by + 3, 6, 6);
      rect(c, '#64748b', bx + 6, by + 4, 4, 1);
      rect(c, '#64748b', bx + 6, by + 6, 4, 1);
    } else if (kind === 'write') {
      rect(c, '#fb923c', bx + 4, by + 3, 2, 2);
      rect(c, '#fb923c', bx + 5, by + 4, 2, 2);
      rect(c, '#f97316', bx + 6, by + 5, 2, 2);
      rect(c, '#fde047', bx + 3, by + 8, 5, 1);
    } else if (kind === 'ask') {
      rect(c, '#f59e0b', bx + 7, by + 2, 2, 5);
      rect(c, '#f59e0b', bx + 7, by + 8, 2, 1);
    } else if (kind === 'think') {
      var lit = Math.floor(t * 3) % 3;
      for (var i = 0; i < 3; i++) rect(c, i <= lit ? '#f59e0b' : '#475569', bx + 4 + i * 3, by + 5, 2, 2);
    }
  }

  /** claude-code-park tarzı ajan üstü koyu durum hapı (Running / Editing / Reading / Thinking / Delegating / Idle) */
  function drawActionPill(c, a, x, y, t) {
    var mode = a.mode || 'idle';
    var toolTxt = a.tool ? String(a.tool).replace(/^mcp__[^_]+__/, '').slice(0, 12) : '';
    var label = 'Idle';
    var dotCol = '#64748b';
    var borderCol = '#334155';

    if (mode === 'running') {
      label = 'Run ' + (toolTxt || 'Bash');
      dotCol = '#3fb950'; borderCol = '#238636';
    } else if (mode === 'typing') {
      label = 'Edit ' + (toolTxt || 'Code');
      dotCol = '#fb923c'; borderCol = '#d97706';
    } else if (mode === 'reading') {
      label = 'Read ' + (toolTxt || 'File');
      dotCol = '#38bdf8'; borderCol = '#0284c7';
    } else if (mode === 'thinking') {
      var dots = '.'.repeat((Math.floor(t * 3) % 3) + 1);
      label = (a.parentTaskId ? 'Subagent' : 'Thinking') + dots;
      dotCol = a.parentTaskId ? '#c084fc' : '#facc15';
      borderCol = a.parentTaskId ? '#7e22ce' : '#ca8a04';
    } else if (mode === 'waiting') {
      label = 'Approval?';
      dotCol = '#f59e0b'; borderCol = '#b45309';
    } else if (mode === 'done') {
      label = 'Done ✓';
      dotCol = '#3fb950'; borderCol = '#238636';
    } else if (mode === 'failed') {
      label = 'Failed ✕';
      dotCol = '#ef5350'; borderCol = '#b91c1c';
    }

    var pw = Math.max(28, Math.min(68, Math.round(label.length * 2.9 + 11)));
    var ph = 9;
    var px = Math.round(x - pw / 2);
    var py = Math.round(y - 34);

    // Gölge + Koyu Çerçeve + İç Yüzey
    rect(c, 'rgba(0,0,0,.4)', px + 1, py + 1, pw, ph);
    rect(c, borderCol, px - 1, py - 1, pw + 2, ph + 2);
    rect(c, '#0f172a', px, py, pw, ph);
    // Alt üçgen ok
    rect(c, borderCol, Math.round(x) - 1, py + ph, 3, 2);
    // Sol durum LED noktası
    rect(c, dotCol, px + 2, py + 3, 3, 3);
    // Metin
    c.fillStyle = '#f8fafc';
    c.font = 'bold 4.3px "Segoe UI", system-ui, monospace';
    c.textAlign = 'left';
    c.fillText(label, px + 7, py + 6.3);
  }

  /** Özgün Siber-Mühendis Karakter Çizimi (Kulaklıklı & Kapüşonlu Chibi) */
  function drawAgent(c, a, def, t) {
    var x = Math.round(a.x), y = Math.round(a.y), pose = poseOf(a), f = Math.floor(t * 8) % 2;
    var bob = pose === 'idle' ? Math.round(Math.sin(t * 2 + a.idx)) : 0;
    rect(c, 'rgba(0,0,0,.32)', x - 6, y - 1, 12, 3); // yumuşak gölge
    var leg = pose === 'walking' ? f : 0;
    // Bacaklar & Ayakkabılar
    rect(c, '#1e293b', x - 3, y - 6, 3, 5 - leg);
    rect(c, '#1e293b', x + 1, y - 6, 3, 5 - (pose === 'walking' ? 1 - leg : 0));
    rect(c, '#0f172a', x - 3, y - 1 - leg, 3, 1);
    rect(c, '#0f172a', x + 1, y - 1 - (pose === 'walking' ? 1 - leg : 0), 3, 1);
    // Gövde (Kapüşonlu Svetşört + Göğüs Rozeti)
    rect(c, def.color, x - 5, y - 14 + bob, 10, 8);
    rect(c, def.accent || '#fff', x - 4, y - 13 + bob, 2, 2);
    rect(c, 'rgba(0,0,0,.18)', x - 5, y - 8 + bob, 10, 2);
    // Kafa & Yüz
    rect(c, '#f3cfa6', x - 4, y - 21 + bob, 8, 7);
    // Saç Stili
    rect(c, def.hair, x - 4, y - 22 + bob, 8, 3);
    rect(c, def.hair, x - 5, y - 21 + bob, 1, 4);
    rect(c, def.hair, x + 4, y - 21 + bob, 1, 4);
    // Siber Kulaklık (Headset)
    rect(c, '#38bdf8', x - 5, y - 19 + bob, 1, 3);
    rect(c, '#38bdf8', x + 4, y - 19 + bob, 1, 3);
    // Gözler
    rect(c, '#0f172a', x - 2, y - 17 + bob, 1, 2);
    rect(c, '#0f172a', x + 2, y - 17 + bob, 1, 2);

    if (pose === 'typing') {
      var k = Math.floor(t * 12) % 2;
      rect(c, '#f3cfa6', x - 6, y - 10 + k, 2, 2);
      rect(c, '#f3cfa6', x + 4, y - 10 + (1 - k), 2, 2);
    } else if (pose === 'reading') {
      rect(c, '#f8fafc', x - 5, y - 12, 10, 6);
      rect(c, '#3b82f6', x, y - 12, 1, 6);
      rect(c, '#64748b', x - 4, y - 10, 3, 1);
      rect(c, '#64748b', x + 2, y - 10, 3, 1);
    } else if (pose === 'idle') {
      rect(c, '#f8fafc', x + 4, y - 12, 4, 4);
      rect(c, '#78350f', x + 5, y - 12, 2, 1);
      var sy = Math.floor(t * 3) % 3;
      rect(c, 'rgba(255,255,255,.55)', x + 5 + (sy % 2), y - 16 - sy, 1, 2);
    } else if (pose === 'waiting') {
      rect(c, '#f3cfa6', x + 4, y - 19, 2, 6);
    }

    drawActionPill(c, a, x, y, t);
    var bubble = a.badge || (a.mode !== 'thinking' && a.mode !== 'waiting' && t > a.speechUntil) ? '' : bubbleKind(a);
    if (bubble) drawSpeechBubble(c, bubble, x + 12, y + 6, t);
    if (a.badge) drawBadge(c, a.badge.kind, x, y);
  }

  /** Zemin, Mobilya ve Üst Telemetri Barı Çizimi */
  function drawScene(c, s) {
    var t = s.t, i, r, col;

    // 1. ZEMİN MİMARİSİ: Sol Sıcak Meşe Parke (pixel-agents) + Sağ Safir Mavi Lounge Salonu + Alt Kafe Dama Karoları
    rect(c, '#161b22', 0, 0, W, H);
    // Sol Çalışma Alanı (Ahşap Parke: x: 0..248, y: 54..H)
    rect(c, '#6e472b', 0, 54, 248, H - 54);
    for (r = 56; r < H; r += 8) {
      rect(c, 'rgba(0,0,0,.12)', 0, r, 248, 1);
      for (col = (r % 16 === 0 ? 12 : 0); col < 248; col += 24) {
        rect(c, 'rgba(255,255,255,.04)', col, r + 1, 11, 6);
        rect(c, 'rgba(0,0,0,.1)', col, r, 1, 8);
      }
    }
    // MuratifyAI Tarzı Yatay Departman Koridor Şeridi (y: 80..92)
    rect(c, '#262f3d', 0, 80, 248, 11);
    rect(c, '#3b4659', 0, 80, 248, 1);
    rect(c, '#3b4659', 0, 90, 248, 1);
    for (i = 8; i < 244; i += 20) rect(c, '#4c8dff', i, 85, 6, 1);

    // Sağ Mavi Dinlenme Salonu (Lounge Zone: x: 250..W, y: 54..H - pixel-agents Image 1)
    rect(c, '#28527a', 250, 54, W - 250, H - 54);
    for (r = 58; r < H - 26; r += 6) {
      rect(c, 'rgba(255,255,255,.04)', 252, r, W - 254, 2);
    }
    // Sağ Alt Kafe Dama Zemin Karoları (Checkered Floor: y: H-26..H, x: 250..W)
    for (r = H - 26; r < H; r += 6) {
      for (col = 250; col < W; col += 6) {
        var isLight = ((Math.floor((r - (H - 26)) / 6) + Math.floor((col - 250) / 6)) % 2) === 0;
        rect(c, isLight ? '#cbd5e1' : '#334155', col, r, 6, 6);
      }
    }
    // Ara Bölme Duvarı (Kapı Boşluklu: x: 247..251)
    rect(c, '#0f172a', 247, 54, 4, 24);
    rect(c, '#0f172a', 247, 94, 4, H - 94);

    // Lounge Mobilyaları: Bordo Koltuklar + Orta Sehpa + Kahve Kupası (pixel-agents Image 1)
    rect(c, '#9b2c4e', 268, 72, 32, 9); // üst kanepe
    rect(c, '#7a1f3d', 268, 70, 32, 3);
    rect(c, '#9b2c4e', 260, 83, 8, 22); // sol koltuk
    rect(c, '#9b2c4e', 300, 83, 8, 22); // sağ koltuk
    rect(c, '#9b2c4e', 268, 107, 32, 8); // alt kanepe
    rect(c, '#b08354', 272, 85, 24, 18); // orta sehpa
    rect(c, '#8c6239', 273, 86, 22, 16);
    rect(c, '#f8fafc', 281, 91, 4, 4); // kahve kupası
    rect(c, '#3b2314', 282, 92, 2, 1);
    // Sağ alt köşe tezgah
    rect(c, '#a67c52', 292, H - 14, 24, 11);
    rect(c, '#785532', 292, H - 5, 24, 2);

    // 2. ÜST DUVAR & KÜTÜPHANE / BEYAZ TAHTA / OTOMAT / SUNUCU ODASI (y: 14..54)
    rect(c, '#1e2633', 0, 14, 248, 40);
    rect(c, '#1b314b', 250, 14, W - 250, 40);
    rect(c, '#0b0f17', 0, 52, W, 3);

    // Sol Saksı Bitkisi (Monstera)
    rect(c, '#b85d3b', 5, 41, 8, 9);
    rect(c, '#1e5631', 3, 27, 12, 15);
    rect(c, '#2ecc71', 4, 25, 4, 11);
    rect(c, '#2ecc71', 9, 28, 5, 9);

    // Çift Katlı Maun Kitaplık (x: 18..86)
    rect(c, '#5b3a22', 18, 18, 68, 33);
    rect(c, '#3d2616', 20, 20, 64, 13);
    rect(c, '#3d2616', 20, 35, 64, 14);
    for (i = 0; i < 10; i++) {
      rect(c, ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'][i % 6], 22 + i * 6, 22 + (i % 2), 4, 11 - (i % 2));
      rect(c, ['#3498db', '#e67e22', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6'][i % 6], 22 + i * 6, 37 + (i % 2), 4, 12 - (i % 2));
    }

    // Duvar Saati (x: 96, y: 24)
    rect(c, '#dc2626', 93, 22, 12, 12);
    rect(c, '#f8fafc', 94, 23, 10, 10);
    rect(c, '#0f172a', 98, 25, 1, 4);
    rect(c, '#dc2626', 98, 28, 3, 1);

    // claude-code-park Tarzı Mimari Beyaz Tahta & Grafikler (x: 112..184)
    rect(c, '#64748b', 112, 18, 72, 32);
    rect(c, '#f8fafc', 114, 20, 68, 28);
    rect(c, '#3b82f6', 118, 24, 18, 2);
    rect(c, '#94a3b8', 118, 28, 14, 1);
    rect(c, '#94a3b8', 118, 31, 16, 1);
    // Mini sütun grafik + post-it notlar
    rect(c, '#22c55e', 142, 36, 4, 8);
    rect(c, '#3b82f6', 148, 32, 4, 12);
    rect(c, '#f59e0b', 154, 29, 4, 15);
    rect(c, '#facc15', 164, 23, 6, 6);
    rect(c, '#fb7185', 172, 23, 6, 6);
    rect(c, '#38bdf8', 164, 31, 6, 6);
    c.fillStyle = '#0f172a'; c.font = 'bold 6px monospace'; c.textAlign = 'center';
    c.fillText(String(s.order.length), 175, 44);

    // Mavi İçecek Otomatı (claude-code-park Image 3: x: 192..214)
    rect(c, '#1d4ed8', 192, 17, 22, 34);
    rect(c, '#0f172a', 194, 20, 14, 20);
    for (r = 0; r < 3; r++) {
      for (col = 0; col < 3; col++) {
        rect(c, ['#ef4444', '#38bdf8', '#facc15', '#4ade80'][(r + col) % 4], 196 + col * 4, 22 + r * 6, 3, 4);
      }
    }
    rect(c, '#38bdf8', 210, 22, 2, 8);
    rect(c, '#090d16', 196, 43, 10, 5);

    // 16x16 Piksel Sunucu Kabini (Server Rack: x: 220..242)
    rect(c, '#111827', 220, 17, 22, 34);
    rect(c, '#1f2937', 222, 19, 18, 30);
    for (r = 0; r < 5; r++) {
      rect(c, '#090d16', 224, 21 + r * 5, 14, 3);
      var blink = (Math.floor(t * 4 + r) % 2) === 0;
      rect(c, blink ? '#3fb950' : '#0ea5e9', 225, 22 + r * 5, 2, 1);
      rect(c, !blink ? '#f59e0b' : '#3fb950', 229, 22 + r * 5, 2, 1);
    }

    // Sağ Lounge Duvar Tabloları & Köşe Bitkisi (pixel-agents Image 1)
    rect(c, '#d4af37', 262, 21, 14, 16);
    rect(c, '#1e293b', 264, 23, 10, 12);
    rect(c, '#f59e0b', 267, 26, 4, 5);
    rect(c, '#d4af37', 284, 22, 20, 14);
    rect(c, '#0f172a', 286, 24, 16, 10);
    rect(c, '#38bdf8', 288, 26, 12, 4);
    rect(c, '#22c55e', 288, 30, 12, 3);
    rect(c, '#b85d3b', 308, 41, 7, 9);
    rect(c, '#2ecc71', 306, 28, 11, 14);

    // 3. ÜST TELEMETRİ & 9'LU KANCA (HOOK) SKORBORD BARI (MuratifyAI + claude-code-park)
    rect(c, '#090d16', 0, 0, W, 14);
    rect(c, '#21262d', 0, 13, W, 1);

    // Sol: MuratifyAI Canlı Saat & Hız Rozeti
    var nowDate = new Date();
    var hh = ('0' + nowDate.getHours()).slice(-2);
    var mm = ('0' + nowDate.getMinutes()).slice(-2);
    c.fillStyle = '#f8fafc';
    c.font = 'bold 5.5px "Segoe UI", monospace';
    c.textAlign = 'left';
    c.fillText(hh + ':' + mm, 5, 9);
    rect(c, '#132f20', 28, 3, 20, 7);
    c.fillStyle = '#3fb950';
    c.font = 'bold 4px monospace';
    c.fillText('CANLI', 31, 8);

    // Orta: claude-code-park Proje Başlığı + 9 Kanca (Hook) LED Dizisi
    rect(c, '#272115', 86, 2, 58, 9);
    rect(c, '#a16207', 86, 2, 58, 1);
    c.fillStyle = '#fef08a';
    c.font = 'bold 4.5px "Segoe UI", monospace';
    c.textAlign = 'center';
    c.fillText('NEXUS CAMPUS', 115, 8);

    for (i = 0; i < 9; i++) {
      var hx = 150 + i * 7;
      var hy = 5;
      var activeHook = s.hookPulses && s.hookPulses[i] > t;
      rect(c, activeHook ? '#a855f7' : '#334155', hx, hy, 4, 4);
      if (activeHook) rect(c, '#f3e8ff', hx + 1, hy + 1, 2, 2);
    }

    // Sağ: MuratifyAI KPI Skorbordu (AKTİF | BİTEN | KANCA)
    var totalDone = 0, activeCount = 0;
    s.order.forEach(function (id) {
      var act = s.actors[id];
      totalDone += act.doneCount || 0;
      if (activeTasks(s, act).length > 0) activeCount++;
    });
    c.textAlign = 'right';
    c.font = 'bold 4.5px "Segoe UI", monospace';
    c.fillStyle = '#38bdf8';
    c.fillText('AKTİF:' + activeCount, 248, 8.5);
    c.fillStyle = '#4ade80';
    c.fillText('BİTEN:' + totalDone, 282, 8.5);
    c.fillStyle = '#c084fc';
    c.fillText('HOOK:' + (s.totalHooks || 0), 316, 8.5);

    // 4. ÇALIŞMA İSTASYONLARI VE AJANLAR
    c.save(); c.beginPath(); c.rect(0, 55, W, H - 55); c.clip(); c.translate(0, -s.cameraY);

    // Alt ajan veri bağları (Parent -> Subagent neon hat)
    s.order.forEach(function (id) {
      var a = s.actors[id], parent = s.registry.tasks.get(a.parentTaskId);
      var p = parent && s.actors[parent.actorId];
      if (!p || p === a) return;
      var from = seat(p.idx), to = seat(a.idx);
      c.strokeStyle = '#a855f7';
      c.beginPath(); c.moveTo(from.x, from.y + 22); c.lineTo(to.x, to.y + 22); c.stroke();
    });

    // Masalar (claude-code-park + pixel-agents tarzı: monitör, kahve kupası, sarı post-it, klavye)
    s.order.forEach(function (id) {
      var a = s.actors[id], p = seat(a.idx), x = p.x - 26, y = p.y;
      if (y - s.cameraY < 40 || y - s.cameraY > H + 40) return;
      var live = activeTasks(s, a).length > 0, def = theme(a);

      // Ergonomik Sandalye Taburesi
      rect(c, '#1e6f5c', p.x - 6, y + 2, 12, 5);
      // Masa Üstü (Sıcak Meşe + Ön Kenar Gölgeli)
      rect(c, '#c49a6c', x, y - 10, 52, 7);
      rect(c, '#8c6239', x, y - 3, 52, 3);
      rect(c, '#334155', x + 2, y, 3, 8);
      rect(c, '#334155', x + 47, y, 3, 8);

      // Masa Üstü Aksesuarları: Kahve Kupası (sol) + Sarı Post-it Notlar (sağ)
      rect(c, '#f8fafc', x + 5, y - 9, 4, 4);
      rect(c, '#78350f', x + 6, y - 9, 2, 1);
      rect(c, '#facc15', x + 41, y - 9, 6, 4);
      rect(c, '#38bdf8', x + 42, y - 8, 4, 1);

      // Geniş Monitör + Kod Satırları
      rect(c, '#1e293b', x + 16, y - 29, 20, 15);
      rect(c, '#475569', x + 24, y - 14, 4, 4);
      rect(c, live ? '#091926' : '#090d16', x + 18, y - 27, 16, 11);
      if (live) {
        for (var l = 0; l < 4; l++) {
          var lineCol = a.mode === 'waiting' ? '#f59e0b' : (l % 2 === 0 ? '#3fb950' : '#38bdf8');
          rect(c, lineCol, x + 19, y - 25 + ((l * 2 + Math.floor(t * (a.mode === 'typing' ? 6 : 1.5))) % 8), 5 + (l * 3) % 8, 1);
        }
      }
      // Klavye
      rect(c, a.mode === 'typing' && Math.floor(t * 8) % 2 ? '#fde047' : '#94a3b8', x + 20, y - 8, 12, 3);

      // Seçili Masa Vurgusu
      if (s.selectedActorId === id) {
        rect(c, '#facc15', x - 1, y + 8, 54, 2);
      }

      // Ajan Etiketi
      c.fillStyle = def.color;
      c.font = 'bold 5.5px "Segoe UI", monospace';
      c.textAlign = 'center';
      c.fillText(def.name.slice(0, 10) + ' #' + id.slice(6), p.x, y + 36);
    });

    // Karakterleri Y-sırasına göre çiz
    s.order.map(function (id) { return s.actors[id]; }).sort(function (a, b) { return a.y - b.y; }).forEach(function (a) {
      if (a.y - s.cameraY >= 55 && a.y - s.cameraY <= H + 24) drawAgent(c, a, theme(a), t);
    });
    c.restore();

    if (worldHeight(s) > H) {
      rect(c, '#334155', W - 4, 57, 2, H - 60);
      rect(c, '#f8fafc', W - 4, 57 + s.cameraY / (worldHeight(s) - H) * (H - 70), 2, 10);
    }
  }

  function hitTest(s, x, y) {
    if (y < 55) return null;
    y += s.cameraY;
    var ids = s.order.slice().sort(function (a, b) { return s.actors[b].y - s.actors[a].y; });
    for (var id of ids) {
      var a = s.actors[id];
      if (x >= a.x - 9 && x <= a.x + 9 && y >= a.y - 24 && y <= a.y + 3) return id;
    }
    for (var id of ids) {
      var p = seat(s.actors[id].idx);
      if (x >= p.x - 26 && x <= p.x + 26 && y >= p.y - 30 && y <= p.y + 10) return id;
    }
    return null;
  }

  /** Tuval + HiDPI 3x animasyon döngüsü */
  function mount(canvas, onPick) {
    var state = createState(); var raf = 0; var last = 0;
    canvas.width = W * SCALE; canvas.height = H * SCALE;
    var ctx = canvas.getContext('2d');
    if (ctx) ctx.imageSmoothingEnabled = false;
    function frame(now) {
      raf = root.requestAnimationFrame(frame);
      var dt = Math.min(0.1, (now - last) / 1000); last = now;
      step(state, dt);
      if (ctx) {
        ctx.save();
        if (typeof ctx.scale === 'function') ctx.scale(SCALE, SCALE);
        drawScene(ctx, state);
        ctx.restore();
      }
    }
    function pick(ev) {
      if (!onPick) return;
      var r = canvas.getBoundingClientRect(); var x = (ev.clientX - r.left) / r.width * W, y = (ev.clientY - r.top) / r.height * H;
      var id = hitTest(state, x, y);
      if (id) { state.selectedActorId = id; onPick(id); }
    }
    function scroll(ev) {
      if (worldHeight(state) <= H) return;
      ev.preventDefault();
      state.cameraY = Math.max(0, Math.min(worldHeight(state) - H, state.cameraY + Math.sign(ev.deltaY) * 40));
    }
    function key(ev) {
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      scroll({ deltaY: ev.key === 'ArrowDown' ? 1 : -1, preventDefault: function () { ev.preventDefault(); } });
    }
    canvas.tabIndex = 0;
    canvas.addEventListener('wheel', scroll, { passive: false });
    canvas.addEventListener('keydown', key);
    canvas.addEventListener('click', pick);
    return {
      state: state,
      feed: function (ev) { return feed(state, ev); },
      reconcile: function (rows) { reconcile(state, rows); },
      select: function (id) {
        var a = state.actors[id]; if (!a) return;
        state.selectedActorId = id; state.cameraY = Math.max(0, Math.min(worldHeight(state) - H, seat(a.idx).y - 112));
      },
      destroy: function () {
        this.stop(); canvas.removeEventListener('click', pick); canvas.removeEventListener('wheel', scroll); canvas.removeEventListener('keydown', key);
      },
      start: function () { if (raf || !root.requestAnimationFrame) return; last = root.performance.now(); raf = root.requestAnimationFrame(frame); },
      stop: function () { if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf); raf = 0; }
    };
  }

  root.ObsOffice = {
    ActorRegistry: ActorRegistry, StationAllocator: StationAllocator, reconcile: reconcile,
    hitTest: hitTest, seat: seat, worldHeight: worldHeight, W: W, H: H, SCALE: SCALE, HOOK_NAMES: HOOK_NAMES,
    classifyTool: classifyTool, createState: createState, feed: feed, step: step,
    poseOf: poseOf, bubbleKind: bubbleKind, drawSpeechBubble: drawSpeechBubble,
    drawActionPill: drawActionPill, drawScene: drawScene, mount: mount
  };
})(typeof window !== 'undefined' ? window : globalThis);
