// Canlı AI ofis: SSE olaylarını (tool.invoked, permission.requested, task.completed ...) 2D piksel-art animasyonlarına çevirir.
// Saf Canvas 2D, dış bağımlılık yok (CSP: script-src 'self'). Mantık (feed/step) çizimden ayrıdır; Node'da test edilir.
(function (root) {
  'use strict';
  var W = 320, H = 180;
  var AGENTS = [
    { id: 'agy', name: 'Antigravity', color: '#4c8dff', hair: '#1d3f8f' },
    { id: 'claude', name: 'Claude Code', color: '#ff8a3d', hair: '#7a3a0b' },
    { id: 'codex', name: 'Codex CLI', color: '#ef5350', hair: '#6b1b1a' },
    { id: 'opencode', name: 'OpenCode', color: '#8b949e', hair: '#30363d' }
  ];
  var SPEED = 70; // piksel/sn
  var DESK_Y = 112; // oturan ajanın ayak çizgisi
  var deskX = function (i) { return 20 + i * 76; };
  var seat = function (i) { return { x: deskX(i) + 26, y: DESK_Y }; };
  var shelf = function (i) { return { x: 34 + i * 12, y: 66 + (i % 2) * 5 }; };
  var rest = function (i) { return { x: 252 + i * 14, y: 66 + (i % 2) * 6 }; };

  var WRITE_RE = /write|edit|patch|apply|create|bash|shell|exec|run|command|terminal|replace|delete|move|mkdir/i;
  var READ_RE = /read|view|cat|search|grep|glob|find|list|fetch|web|browse|open|ls|lookup|get/i;
  /** Araç adı -> 'typing' (yazma/komut) | 'reading' (okuma/arama) | 'thinking'. Yazma önceliklidir. */
  function classifyTool(name) {
    var n = String(name || '');
    if (WRITE_RE.test(n)) return 'typing';
    if (READ_RE.test(n)) return 'reading';
    return 'typing';
  }

  function createState() {
    var s = { t: 0, agents: {}, order: [], ended: {} };
    AGENTS.forEach(function (a, i) {
      var r = rest(i);
      s.agents[a.id] = { id: a.id, idx: i, x: r.x, y: r.y, tx: r.x, ty: r.y, mode: 'idle', tasks: {}, badge: null, doneCount: 0, failCount: 0, idleAt: 0, walking: false, tool: '' };
      s.order.push(a.id);
    });
    return s;
  }

  function badge(a, kind, t, ttl) { a.badge = { kind: kind, until: ttl ? t + ttl : Infinity }; }
  function goTo(a, p) { a.tx = p.x; a.ty = p.y; }
  function activeCount(a) { return Object.keys(a.tasks).length; }

  /** Tek bir TaskEvent'i ajan durumuna uygular. Bilinmeyen ajanlar (hermes, ollama ...) yok sayılır. */
  function feed(s, ev) {
    if (!ev || !ev.type) return null;
    var a = s.agents[ev.agent]; if (!a) return null;
    var d = ev.data || {}; var t = s.t; var id = ev.taskId || '_';
    var ending = ev.type === 'task.completed' || ev.type === 'task.failed' || ev.type === 'task.cancelled';
    if (!ending && s.ended[id]) return a; // bitmiş görevin geç gelen olayı
    if (!ending) a.tasks[id] = true; else s.ended[id] = true;
    if (ev.type === 'task.started' || ev.type === 'turn.started' || ev.type === 'message.delta' || ev.type === 'usage.updated') {
      if (a.mode === 'idle' || a.mode === 'done' || a.mode === 'failed') { a.mode = 'thinking'; goTo(a, seat(a.idx)); if (a.badge && a.badge.kind !== 'ask') a.badge = null; }
    } else if (ev.type === 'tool.invoked') {
      a.mode = classifyTool(d.name); a.tool = String(d.name || '');
      goTo(a, a.mode === 'reading' ? shelf(a.idx) : seat(a.idx));
      if (a.badge && a.badge.kind !== 'ask') a.badge = null;
    } else if (ev.type === 'tool.completed') {
      if (d.isError || d.error) badge(a, 'deny', t, 1.5); else badge(a, 'ok', t, 0.9);
      if (a.mode === 'typing' || a.mode === 'reading') { a.mode = 'thinking'; goTo(a, seat(a.idx)); }
    } else if (ev.type === 'permission.requested') {
      a.mode = 'waiting'; goTo(a, seat(a.idx)); badge(a, 'ask', t, 0);
    } else if (ev.type === 'permission.resolved') {
      var denied = d.allowed === false || d.approved === false || /deny|denied|reject|block/i.test(String(d.decision || d.outcome || ''));
      badge(a, denied ? 'deny' : 'ok', t, 1.5); a.mode = 'thinking';
    } else if (ending) {
      delete a.tasks[id];
      if (ev.type === 'task.completed') { a.doneCount++; badge(a, 'ok', t, 2.5); a.mode = 'done'; }
      else if (ev.type === 'task.failed') { a.failCount++; badge(a, 'deny', t, 3); a.mode = 'failed'; }
      else { a.badge = null; a.mode = 'done'; }
      goTo(a, seat(a.idx)); a.idleAt = t + (ev.type === 'task.cancelled' ? 0.4 : 2.5);
    }
    if ((d.blocked || d.denied || ev.type === 'tool.blocked') && !ending) { a.mode = 'waiting'; badge(a, 'deny', t, 2.5); }
    return a;
  }

  /** dt saniye ilerletir: yürüme, rozet süresi, boşta -> dinlenme alanı. */
  function step(s, dt) {
    s.t += dt;
    s.order.forEach(function (k) {
      var a = s.agents[k];
      if (a.badge && s.t >= a.badge.until) a.badge = null;
      if ((a.mode === 'done' || a.mode === 'failed') && s.t >= a.idleAt) {
        if (activeCount(a) === 0) { a.mode = 'idle'; goTo(a, rest(a.idx)); } else { a.mode = 'thinking'; }
      }
      if (a.mode === 'thinking' && activeCount(a) === 0) { a.mode = 'idle'; goTo(a, rest(a.idx)); }
      var dx = a.tx - a.x, dy = a.ty - a.y, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.5) { a.x = a.tx; a.y = a.ty; a.walking = false; return; }
      var mv = Math.min(dist, SPEED * dt);
      a.x += dx / dist * mv; a.y += dy / dist * mv; a.walking = true;
    });
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
    s.order.forEach(function (k, n) {
      var a = s.agents[k], d = AGENTS[n], y = 13 + n * 8;
      rect(c, d.color, 125, y, 4, 4);
      for (var q = 0; q < Math.min(a.doneCount, 14); q++) rect(c, '#2ea043', 133 + q * 4, y, 3, 4);
      for (var z = 0; z < Math.min(a.failCount, 4); z++) rect(c, '#da3633', 190 + z * 3, y, 2, 4);
    });
    // su sebili + kahve makinesi (dinlenme alanı)
    rect(c, '#cfd8e3', 244, 14, 16, 36); rect(c, '#7fc4ff', 247, 16, 10, 14); rect(c, '#9aa7b5', 246, 34, 12, 3);
    rect(c, '#3a3f46', 270, 22, 22, 28); rect(c, '#111', 274, 28, 14, 8); rect(c, Math.floor(t * 2) % 2 ? '#2ea043' : '#1f6f31', 276, 40, 3, 3); rect(c, '#f1ede4', 280, 44, 5, 6);
    rect(c, '#3b3228', 238, 62, 70, 1);
    // masalar
    AGENTS.forEach(function (d, n) {
      var a = s.agents[d.id], x = deskX(n), live = activeCount(a) > 0;
      rect(c, '#3a4048', x + 17, 92, 18, 13); // monitör
      rect(c, live ? '#0d2a16' : '#0b0e12', x + 19, 94, 14, 9);
      if (live) for (var l = 0; l < 4; l++) rect(c, a.mode === 'waiting' ? '#d29922' : '#3fb950', x + 20, 95 + ((l * 2 + Math.floor(t * (a.mode === 'typing' ? 6 : 1.5))) % 8), 4 + (l * 3) % 8, 1);
      rect(c, '#2d333b', x + 24, 105, 4, 3);
    });
    s.order.forEach(function (k) { var a = s.agents[k]; if (a.y < DESK_Y - 1) drawAgent(c, a, AGENTS[a.idx], t); });
    AGENTS.forEach(function (d, n) { // masa yüzeyi
      var x = deskX(n);
      rect(c, '#6b4f33', x, 112, 52, 6); rect(c, '#4a3622', x, 118, 52, 2); rect(c, '#4a3622', x + 2, 120, 3, 10); rect(c, '#4a3622', x + 47, 120, 3, 10);
      rect(c, '#9aa0a6', x + 20, 113, 12, 3); // klavye
    });
    s.order.forEach(function (k) { var a = s.agents[k]; if (a.y >= DESK_Y - 1) drawAgent(c, a, AGENTS[a.idx], t); });
    s.order.forEach(function (k, n) { // isim etiketleri
      c.fillStyle = AGENTS[n].color; c.font = '8px monospace'; c.textAlign = 'center';
      c.fillText(AGENTS[n].name, deskX(n) + 26, 160);
    });
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
      var best = null, bd = 1e9;
      state.order.forEach(function (k) { var a = state.agents[k], dd = Math.abs(a.x - x) + Math.abs(a.y - 10 - y) * 0.8; if (dd < bd) { bd = dd; best = k; } });
      if (best && (bd < 22 || (y > 100 && Math.abs(deskX(state.agents[best].idx) + 26 - x) < 30))) onPick(best);
    }
    canvas.addEventListener('click', pick);
    return {
      state: state,
      feed: function (ev) { return feed(state, ev); },
      start: function () { if (raf || !root.requestAnimationFrame) return; last = root.performance.now(); raf = root.requestAnimationFrame(frame); },
      stop: function () { if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf); raf = 0; }
    };
  }

  root.ObsOffice = { AGENTS: AGENTS, W: W, H: H, classifyTool: classifyTool, createState: createState, feed: feed, step: step, poseOf: poseOf, drawScene: drawScene, mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
