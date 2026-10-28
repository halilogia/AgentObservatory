// Fleet görünümü: 4 takımın (Claude, Codex, Antigravity, OpenCode) anlık durumu ve araç çağrıları.
// Saf özetleme + DOM oluşturucu. Tarayıcıda window.ObsFleetView, Node.js altında module.exports.
(function (root) {
  'use strict';

  var TEAMS = [
    { id: 'claude', agents: ['claude'], label: 'Claude', color: '#f97316' },
    { id: 'codex', agents: ['codex'], label: 'Codex', color: '#ef4444' },
    { id: 'antigravity', agents: ['agy', 'antigravity'], label: 'Antigravity', color: '#3b82f6' },
    { id: 'opencode', agents: ['opencode'], label: 'OpenCode', color: '#a855f7' }
  ];

  function teamOf(agent) {
    var a = String(agent || '').toLowerCase();
    for (var i = 0; i < TEAMS.length; i++) if (TEAMS[i].agents.indexOf(a) >= 0) return TEAMS[i];
    return null;
  }

  function clip(s, n) {
    var one = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return one.length > n ? one.slice(0, n - 1) + '…' : one;
  }

  /**
   * Görev özetlerinden (TaskSummary[]) takım başına anlık durum çıkarır.
   * state: working (çalışan görev var) | rate_limited (son görev kota hatası) | error | idle
   * Her zaman 4 takım, sabit sırada döner.
   */
  function summarize(tasks) {
    var fleet = TEAMS.map(function (t) {
      return { id: t.id, label: t.label, color: t.color, state: 'idle', running: 0, completed: 0, failed: 0, current: null, toolCalls: 0, recentTools: [] };
    });
    var byId = {};
    fleet.forEach(function (f) { byId[f.id] = f; });

    var sorted = (tasks || []).slice().sort(function (a, b) { return (a.startTime || 0) - (b.startTime || 0); });
    var last = {};
    sorted.forEach(function (t) {
      var team = teamOf(t.agent);
      if (!team) return;
      var f = byId[team.id];
      var tools = t.toolsUsed || [];
      if (t.status === 'running') {
        f.running++;
        f.toolCalls += tools.length;
        f.current = { taskId: t.taskId, prompt: clip(t.prompt, 80), model: t.model };
        f.recentTools = tools.slice(-3).map(function (x) { return x.name; });
      } else if (t.status === 'completed') f.completed++;
      else if (t.status === 'failed') f.failed++;
      last[team.id] = t;
    });
    fleet.forEach(function (f) {
      if (f.running) f.state = 'working';
      else if (last[f.id] && last[f.id].status === 'failed') {
        f.state = /rate.?limit|quota|usage limit|429|exhausted/i.test(last[f.id].error || '') ? 'rate_limited' : 'error';
      }
    });
    return fleet;
  }

  function render(doc, parent, tasks) {
    var fleet = summarize(tasks);
    var wrap = doc.createElement('div');
    wrap.className = 'fleet-grid';
    fleet.forEach(function (f) {
      var card = doc.createElement('div');
      card.className = 'fleet-card fleet-' + f.state;
      card.dataset.team = f.id;
      card.style.borderTopColor = f.color;

      var head = doc.createElement('div');
      head.className = 'fleet-head';
      var name = doc.createElement('span'); name.className = 'fleet-name'; name.textContent = f.label;
      var badge = doc.createElement('span'); badge.className = 'fleet-state'; badge.textContent = f.state;
      head.append(name, badge);

      var body = doc.createElement('div');
      body.className = 'fleet-body';
      body.textContent = f.current ? f.current.prompt : '—';

      var foot = doc.createElement('div');
      foot.className = 'fleet-foot';
      foot.textContent = f.toolCalls + ' araç çağrısı' + (f.recentTools.length ? ' · ' + f.recentTools.join(', ') : '') +
        ' · ' + f.completed + ' bitti, ' + f.failed + ' hata';
      card.append(head, body, foot);
      wrap.appendChild(card);
    });
    if (parent.replaceChildren) parent.replaceChildren(wrap); else parent.appendChild(wrap);
    return wrap;
  }

  root.ObsFleetView = { TEAMS: TEAMS, teamOf: teamOf, summarize: summarize, render: render };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ObsFleetView;
})(typeof globalThis !== 'undefined' ? globalThis : this);
