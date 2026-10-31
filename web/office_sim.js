// Canlı AI ofis: SSE olaylarını (tool.invoked, permission.requested, task.completed ...) 2D piksel-art animasyonlarına çevirir.
// Saf Canvas 2D, dış bağımlılık yok (CSP: script-src 'self'). Mantık (feed/step) çizimden ayrıdır; Node'da test edilir.
(function (root) {
  'use strict';
  var W = 320, H = 180;
  // Provider definitions are visual themes, never actor identities.
  var THEMES = {
    agy: { name: 'Antigravity', color: '#4c8dff', hair: '#1d3f8f' },
    claude: { name: 'Claude', color: '#ff8a3d', hair: '#7a3a0b' },
    codex: { name: 'Codex', color: '#ef5350', hair: '#6b1b1a' },
    opencode: { name: 'OpenCode', color: '#8b949e', hair: '#30363d' }
  };
  var SPEED = 90, ROW = 88, COLUMNS = 4;
  var terminal = function (status) { return /^(completed|failed|cancelled)$/.test(status); };
  var seat = function (i) { return { x: 46 + (i % COLUMNS) * 76, y: 112 + Math.floor(i / COLUMNS) * ROW }; };
  var theme = function (a) { return THEMES[a.providerId] || { name: a.providerId, color: '#a371f7', hair: '#45305e' }; };
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
      // A late parent link can split a previously shared session actor.
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
          idleAt: 0, walking: false, tool: '', speechUntil: 0, lastSeenAt: 0 };
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
      seen: new Set(), cameraY: 0, selectedActorId: null };
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
    // Terminal state is absorbing; replay cannot restart a finished task.
    if (terminal(task.status)) return a;
    task.timestamp = Math.max(task.timestamp, Number(ev.timestamp) || 0);
    var toolId = String(d.toolUseId || d.tool_use_id || d.id || '');
    if (/^task\.(completed|failed|cancelled)$/.test(ev.type)) {
      task.status = ev.type.slice(5); task.tools.clear(); task.waiting = false;
      if (task.status === 'completed') a.doneCount++;
      if (task.status === 'failed') a.failCount++;
      if (!activeTasks(s, a).length) {
        a.mode = task.status === 'failed' ? 'failed' : 'done';
        badge(a, task.status === 'failed' ? 'deny' : 'ok', s.t, 2.5); a.idleAt = s.t + 2.5;
      }
    } else if (ev.type === 'tool.invoked') {
      // Unknown tools remain neutral; anonymous completions only match unambiguous calls.
      if (!toolId) toolId = 'anonymous:' + (ev.id || task.tools.size + ':' + s.t);
      if (!task.closedTools.has(toolId)) {
        task.tools.set(toolId, { name: String(d.name || d.tool || ''), at: Number(ev.timestamp) || 0 });
        a.speechUntil = s.t + 3; a.badge = null;
      }
    } else if (ev.type === 'tool.completed') {
      if (!toolId && task.tools.size === 1) toolId = task.tools.keys().next().value;
      if (toolId) { task.tools.delete(toolId); task.closedTools.add(toolId); }
      if (d.isError || d.error) badge(a, 'deny', s.t, 1.5);
    } else if (ev.type === 'permission.requested' || ev.type === 'tool.blocked' || d.blocked || d.denied) {
      task.waiting = true;
    } else if (ev.type === 'permission.resolved') {
      task.waiting = false;
      badge(a, d.allowed === false || d.approved === false || /deny|reject|block/i.test(String(d.decision || d.outcome || '')) ? 'deny' : 'ok', s.t, 1.5);
    }
    // A late identity/parent can move one task between actors.
    s.order.forEach(function (id) { refresh(s, s.actors[id]); });
    return a;
  }

  // Task summaries are authoritative for lifecycle, not for in-flight tools.
  // A summary's toolsUsed is history and must never be replayed as active calls.
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
      // Retain completed actors briefly; live actors and selected inspectors never expire.
      if (a.mode === 'idle' && s.t - a.lastSeenAt > 120 && s.selectedActorId !== id && !s.order.some(function (child) { return s.actors[child].parentTaskId && a.taskIds.has(s.actors[child].parentTaskId); })) { s.registry.remove(id); return; }
      // The archive's aisle idea: enter along the clear row below each desk.
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

  /** Görsel durum: yürüyorsa 'walking', değilse mod. */
  function poseOf(a) { return a.walking ? 'walking' : a.mode; }

  // ---------------- çizim ----------------
  var GLYPH = { // 5x5 rozet simgeleri
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

  /** Konuşma balonu türü: waiting -> ask, reading -> read, terminal araçları -> term, diğer yazma -> write, düşünme -> think. */
  function bubbleKind(a) {
    if (!a) return '';
    if (a.mode === 'waiting' || (a.badge && a.badge.kind === 'ask')) return 'ask';
    if (a.mode === 'reading') return 'read';
    if (a.mode === 'running') return 'term';
    if (a.mode === 'typing') return 'write';
    if (a.mode === 'thinking') return 'think';
    return '';
  }

  /** Pixel Agents tarzı minik balon: başın üstünde araç ikonu (terminal, dosya, kalem, onay, düşünme). */
  function drawSpeechBubble(c, kind, x, y, t) {
    if (!kind) return;
    var bx = Math.round(x) - 8, by = Math.round(y) - 41;
    rect(c, 'rgba(0,0,0,.28)', bx + 1, by + 2, 16, 12);
    rect(c, '#20262e', bx, by, 16, 12);
    rect(c, '#f5f2e8', bx + 1, by + 1, 14, 10);
    rect(c, '#20262e', bx + 9, by + 12, 3, 2);
    rect(c, '#20262e', bx + 10, by + 14, 2, 1);
    rect(c, '#f5f2e8', bx + 10, by + 12, 2, 1);

    if (kind === 'term') {
      rect(c, '#1b2129', bx + 3, by + 2, 10, 7);
      rect(c, '#3fb950', bx + 4, by + 3, 2, 1);
      rect(c, '#8b949e', bx + 5, by + 5, 6, 1);
      rect(c, '#8b949e', bx + 5, by + 7, 3, 1);
    } else if (kind === 'read') {
      rect(c, '#2d333b', bx + 4, by + 2, 8, 8);
      rect(c, '#eef1f4', bx + 5, by + 3, 6, 6);
      rect(c, '#8b949e', bx + 6, by + 4, 4, 1);
      rect(c, '#8b949e', bx + 6, by + 6, 4, 1);
      rect(c, '#8b949e', bx + 6, by + 8, 3, 1);
    } else if (kind === 'write') {
      rect(c, '#ffb86c', bx + 4, by + 3, 2, 2);
      rect(c, '#ffb86c', bx + 5, by + 4, 2, 2);
      rect(c, '#ff8a3d', bx + 6, by + 5, 2, 2);
      rect(c, '#ff8a3d', bx + 7, by + 6, 2, 2);
      rect(c, '#111', bx + 4, by + 7, 2, 1);
      rect(c, '#9aa0a6', bx + 3, by + 8, 5, 1);
    } else if (kind === 'ask') {
      rect(c, '#d29922', bx + 7, by + 2, 2, 5);
      rect(c, '#d29922', bx + 7, by + 8, 2, 1);
    } else if (kind === 'think') {
      var lit = Math.floor(t * 3) % 3;
      for (var i = 0; i < 3; i++) rect(c, i <= lit ? '#6b7280' : '#c9d1d9', bx + 4 + i * 3, by + 5, 2, 2);
    }
  }

  function drawAgent(c, a, def, t) {
    var x = Math.round(a.x), y = Math.round(a.y), pose = poseOf(a), f = Math.floor(t * 8) % 2;
    var bob = pose === 'idle' ? Math.round(Math.sin(t * 2 + a.idx)) : 0;
    rect(c, 'rgba(0,0,0,.25)', x - 5, y - 1, 10, 2); // gölge
    var leg = pose === 'walking' ? f : 0;
    rect(c, '#2d333b', x - 3, y - 6, 3, 6 - leg); rect(c, '#2d333b', x, y - 6, 3, 6 - (pose === 'walking' ? 1 - leg : 0));
    rect(c, def.color, x - 4, y - 14 + bob, 8, 8); // gövde
    rect(c, '#f2c9a0', x - 3, y - 20 + bob, 6, 6); // kafa
    rect(c, def.hair, x - 3, y - 21 + bob, 6, 2);
    rect(c, '#111', x - 2, y - 17 + bob, 1, 1); rect(c, '#111', x + 1, y - 17 + bob, 1, 1);
    if (pose === 'typing') { var k = Math.floor(t * 12) % 2; rect(c, '#f2c9a0', x - 5, y - 9 + k, 2, 2); rect(c, '#f2c9a0', x + 3, y - 9 + (1 - k), 2, 2); }
    else if (pose === 'reading') { rect(c, '#f5f2e8', x - 5, y - 12, 10, 6); rect(c, '#8b6b3a', x, y - 12, 1, 6); rect(c, '#9aa0a6', x - 4, y - 10, 3, 1); rect(c, '#9aa0a6', x + 2, y - 10, 3, 1); }
    else if (pose === 'idle') { // kahve fincanı + buhar
      rect(c, '#f1ede4', x + 3, y - 12, 4, 4); rect(c, '#3b2314', x + 4, y - 12, 2, 1);
      var sy = Math.floor(t * 3) % 3; rect(c, 'rgba(255,255,255,.5)', x + 4 + (sy % 2), y - 16 - sy, 1, 2);
    } else if (pose === 'thinking') {
      for (var i = 0; i < 3; i++) if (Math.floor(t * 3) % 3 >= i) rect(c, '#8b949e', x - 4 + i * 4, y - 26, 2, 2);
    } else if (pose === 'waiting') { rect(c, '#f2c9a0', x + 3, y - 18, 2, 5); } // el kaldırır
    var bubble = a.badge || (a.mode !== 'thinking' && a.mode !== 'waiting' && t > a.speechUntil) ? '' : bubbleKind(a);
    if (bubble) drawSpeechBubble(c, bubble, x, y, t);
    if (a.badge) drawBadge(c, a.badge.kind, x, y);
  }
  function drawScene(c, s) {
    var t = s.t, i;
    rect(c, '#1b2129', 0, 0, W, H); rect(c, '#262d36', 0, 54, W, H - 54); // duvar + zemin
    for (i = 0; i < W; i += 16) rect(c, 'rgba(255,255,255,.03)', i, 54, 1, H - 54);
    rect(c, '#0f1318', 0, 52, W, 3);
    // kitaplık (okuma alanı)
    rect(c, '#5b4128', 14, 8, 84, 42); rect(c, '#3e2b19', 14, 28, 84, 2);
    for (i = 0; i < 12; i++) { rect(c, ['#c0392b', '#2980b9', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22'][i % 6], 17 + i * 7, 11 + (i % 3), 5, 17 - (i % 3)); rect(c, ['#2980b9', '#e67e22', '#c0392b', '#27ae60', '#f1c40f', '#8e44ad'][i % 6], 17 + i * 7, 32 + (i % 2), 5, 15 - (i % 2)); }
    // beyaz tahta: tamamlanan / hatalı görev sayaçları
    rect(c, '#8b949e', 120, 8, 84, 40); rect(c, '#eef1f4', 122, 10, 80, 36);
    c.fillStyle = '#26333e'; c.font = '8px monospace'; c.textAlign = 'center';
    c.fillText(String(s.order.length), 162, 29);
    // su sebili + kahve makinesi (dinlenme alanı)
    rect(c, '#cfd8e3', 244, 14, 16, 36); rect(c, '#7fc4ff', 247, 16, 10, 14); rect(c, '#9aa7b5', 246, 34, 12, 3);
    rect(c, '#3a3f46', 270, 22, 22, 28); rect(c, '#111', 274, 28, 14, 8); rect(c, Math.floor(t * 2) % 2 ? '#2ea043' : '#1f6f31', 276, 40, 3, 3); rect(c, '#f1ede4', 280, 44, 5, 6);
    rect(c, '#3b3228', 238, 62, 70, 1);
    c.save(); c.beginPath(); c.rect(0, 55, W, H - 55); c.clip(); c.translate(0, -s.cameraY);
    // Parent links remain visible even when adjacent seats are occupied.
    s.order.forEach(function (id) {
      var a = s.actors[id], parent = s.registry.tasks.get(a.parentTaskId);
      var p = parent && s.actors[parent.actorId];
      if (!p || p === a) return;
      var from = seat(p.idx), to = seat(a.idx);
      c.strokeStyle = '#5a7395'; c.beginPath(); c.moveTo(from.x, from.y + 25); c.lineTo(to.x, to.y + 25); c.stroke();
    });
    s.order.forEach(function (id) {
      var a = s.actors[id], p = seat(a.idx), x = p.x - 26, y = p.y;
      if (y - s.cameraY < 40 || y - s.cameraY > H + 40) return;
      var live = activeTasks(s, a).length > 0, def = theme(a);
      rect(c, '#6b4f33', x, y - 9, 52, 6); rect(c, '#4a3622', x + 2, y - 3, 3, 10); rect(c, '#4a3622', x + 47, y - 3, 3, 10);
      rect(c, '#3a4048', x + 17, y - 29, 18, 15);
      rect(c, live ? '#0d2a16' : '#0b0e12', x + 19, y - 27, 14, 10);
      if (live) for (var l = 0; l < 4; l++) rect(c, a.mode === 'waiting' ? '#d29922' : '#3fb950', x + 20, y - 26 + ((l * 2 + Math.floor(t * (a.mode === 'typing' ? 6 : 1.5))) % 8), 4 + (l * 3) % 8, 1);
      rect(c, a.mode === 'typing' && Math.floor(t * 8) % 2 ? '#f5e5a0' : '#9aa0a6', x + 20, y - 8, 12, 3);
      if (a.mode === 'reading') drawSpeechBubble(c, 'read', x + 46, y + 28, t);
      if (a.mode === 'running') drawSpeechBubble(c, 'term', x + 46, y + 28, t);
      if (s.selectedActorId === id) rect(c, '#f5e5a0', x, y + 8, 52, 1);
      c.fillStyle = def.color; c.font = '7px monospace'; c.textAlign = 'center';
      c.fillText(def.name.slice(0, 9) + ' #' + id.slice(6), p.x, y + 42);
    });
    s.order.map(function (id) { return s.actors[id]; }).sort(function (a, b) { return a.y - b.y; }).forEach(function (a) {
      if (a.y - s.cameraY >= 55 && a.y - s.cameraY <= H + 24) drawAgent(c, a, theme(a), t);
    });
    c.restore();
    if (worldHeight(s) > H) {
      rect(c, '#44505f', W - 4, 57, 2, H - 60);
      rect(c, '#c9d1d9', W - 4, 57 + s.cameraY / (worldHeight(s) - H) * (H - 70), 2, 10);
    }
  }

  // AABB hit areas adapted from the archived RPG, with screen/world coordinates separated.
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

  /** Tuval + animasyon döngüsü. start/stop ile yalnızca panel açıkken çalışır; feed her zaman durumu günceller. */
  function mount(canvas, onPick) {
    var state = createState(); var raf = 0; var last = 0;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d'); if (ctx) ctx.imageSmoothingEnabled = false;
    function frame(now) {
      raf = root.requestAnimationFrame(frame);
      var dt = Math.min(0.1, (now - last) / 1000); last = now;
      step(state, dt); if (ctx) drawScene(ctx, state);
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

  root.ObsOffice = { ActorRegistry: ActorRegistry, StationAllocator: StationAllocator, reconcile: reconcile, hitTest: hitTest, seat: seat, worldHeight: worldHeight, W: W, H: H, classifyTool: classifyTool, createState: createState, feed: feed, step: step, poseOf: poseOf, bubbleKind: bubbleKind, drawSpeechBubble: drawSpeechBubble, drawScene: drawScene, mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
