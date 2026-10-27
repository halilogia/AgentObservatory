// Terminal (TUI) oturumunu web sohbetine çevirir: sunucudaki olay akışı → { r:'u' | 'b', ... } mesajları.
// Saf mantık (DOM yok). helpers: { toolKind(name), toolSummary(name, input), color(agent) }
(function (root) {
  'use strict';
  var MAX_OUT_LINES = 60, MAX_OUT_CHARS = 6000;

  function toChat(session, h) {
    var messages = [], bots = {}, seenPrompt = {}, taskInfo = {};
    session.tasks.forEach(function (t) { taskInfo[t.task_id] = t; });

    function bot(taskId) {
      if (bots[taskId]) return bots[taskId];
      var t = taskInfo[taskId] || {};
      var rec = { r: 'b', engine: t.agent, model: t.model || '', label: t.model || t.agent, color: h.color(t.agent), parts: [], notice: null, meta: null, prompt: t.prompt || '', cwd: '', taskId: taskId, effort: '', _cur: null, _tools: {}, _last: null, _t0: t.start_time };
      bots[taskId] = rec; messages.push(rec);
      return rec;
    }

    session.events.forEach(function (ev) {
      var d = ev.data || {};
      if (ev.type === 'task.started') {
        if (!seenPrompt[ev.taskId]) {
          seenPrompt[ev.taskId] = true;
          var p = d.prompt != null ? d.prompt : (taskInfo[ev.taskId] || {}).prompt;
          if (p) messages.push({ r: 'u', text: String(p).replace(/\s+$/, '') });
        }
        if (d.cwd) bot(ev.taskId).cwd = d.cwd;
        return;
      }
      var rec = bot(ev.taskId);
      if (ev.type === 'message.delta') {
        var text = String(d.text || ''); if (!text) return;
        if (!rec._cur) { rec._cur = { k: 'text', v: '' }; rec.parts.push(rec._cur); }
        rec._cur.v += text;
      } else if (ev.type === 'tool.invoked') {
        rec._cur = null;
        var part = { k: 'tool', name: d.name || 'tool', kind: h.toolKind(d.name), summary: h.toolSummary(d.name, d.input), out: '', input: d.input };
        rec.parts.push(part); rec._last = part; if (d.id) rec._tools[d.id] = part;
      } else if (ev.type === 'tool.completed') {
        var tp = (d.toolUseId && rec._tools[d.toolUseId]) || rec._last;
        if (tp && !tp.out) tp.out = String(d.output != null ? d.output : (d.result != null ? d.result : '')).split('\n').slice(0, MAX_OUT_LINES).join('\n').slice(0, MAX_OUT_CHARS);
      } else if (ev.type === 'task.completed' || ev.type === 'task.failed' || ev.type === 'task.cancelled') {
        rec._cur = null;
        var t0 = rec._t0 != null ? rec._t0 : ev.timestamp;
        rec.meta = { sec: Math.max(0, Math.round((ev.timestamp - t0) / 1000)), tin: rec.meta ? rec.meta.tin : 0, tout: rec.meta ? rec.meta.tout : 0 };
        if (ev.type === 'task.failed') rec.notice = { text: typeof d.error === 'string' ? d.error : 'hata' };
        else if (ev.type === 'task.cancelled') rec.notice = { key: 'notice.cancelled', warn: true };
      } else if (ev.type === 'usage.updated') {
        var u = d.usage || {};
        rec.meta = rec.meta || { sec: 0, tin: 0, tout: 0 };
        rec.meta.tin += Number(u.input_tokens != null ? u.input_tokens : (u.inputTokens != null ? u.inputTokens : u.input)) || 0;
        rec.meta.tout += Number(u.output_tokens != null ? u.output_tokens : (u.outputTokens != null ? u.outputTokens : u.output)) || 0;
      }
    });

    // boş balonları at, iç alanları temizle
    return messages.filter(function (m) { return m.r === 'u' || m.parts.length || m.notice; }).map(function (m) {
      if (m.r === 'b') { delete m._cur; delete m._tools; delete m._last; delete m._t0; }
      return m;
    });
  }

  root.ObsSessions = { toChat: toChat };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ObsSessions;
})(typeof globalThis !== 'undefined' ? globalThis : this);
