// Alt ajanlar (Claude Code Task/Agent aracı): sunucunun döndürdüğü `subs` listesini sohbetteki ilgili araç satırına bağlar.
// Saf mantık (DOM yok); çizim app.js'teki küçük kancada. Metinler bu dosyada (tr/en) tutulur.
(function (root) {
  'use strict';
  var LIVE_WINDOW_MS = 3600000, MAX_REPLY = 800, MAX_PROMPT = 400;

  var TEXT = {
    tr: { sub: 'alt ajan', running: 'çalışıyor', done: 'bitti', error: 'hata', stopped: 'durduruldu', task: 'Görev', tools: 'Araçlar', reply: 'Son yanıt', none: 'yanıt yok', badge: '{n} alt ajan', live: '{n} alt ajan çalışıyor', tool: 'araç' },
    en: { sub: 'subagent', running: 'running', done: 'done', error: 'error', stopped: 'stopped', task: 'Task', tools: 'Tools', reply: 'Final reply', none: 'no reply', badge: '{n} subagent(s)', live: '{n} subagent(s) running', tool: 'tools' }
  };
  function text(key, lang, vars) {
    var s = (TEXT[lang] || TEXT.en)[key] || key;
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; });
  }

  function isAgentTool(name) { return name === 'Task' || name === 'Agent'; }

  /** running | done | error | stopped; bir saatten eski "çalışıyor" kayıtları bitmemiş eski iş sayılır (bitti değil, durduruldu) */
  function statusOf(sub, now) {
    var s = sub.status;
    if (s === 'running' || s === 'pending') return now - Number(sub.start_time) < LIVE_WINDOW_MS ? 'running' : 'stopped';
    if (s === 'completed') return 'done';
    if (s === 'cancelled') return 'stopped';
    return 'error';
  }

  function trim(s, n) { s = String(s || '').replace(/\s+$/, ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /** tek alt ajanın çizime hazır özeti */
  function summarize(sub, now) {
    var evs = sub.events || [], counts = {}, order = [], reply = '', all = '', err = '', last = Number(sub.start_time);
    evs.forEach(function (e) {
      var d = e.data || {};
      if (e.timestamp > last) last = e.timestamp;
      if (e.type === 'tool.invoked') {
        var n = d.name || 'tool';
        if (!counts[n]) { counts[n] = 0; order.push(n); }
        counts[n]++; reply = '';
      } else if (e.type === 'message.delta') {
        var t = String(d.text || ''); reply += t; all += t;
      } else if (e.type === 'task.failed') {
        err = typeof d.error === 'string' ? d.error : (d.message || '');
      }
    });
    var status = statusOf(sub, now);
    var end = sub.end_time != null ? Number(sub.end_time) : (status === 'running' ? now : last);
    var firstLine = String(sub.prompt || '').split('\n').filter(function (l) { return l.trim(); })[0] || '';
    return {
      id: sub.task_id, parent: sub.parent_task_id, status: status, model: sub.model || '', agent: sub.agent,
      prompt: trim(sub.prompt, MAX_PROMPT), title: trim(firstLine, 90),
      sec: Math.max(0, Math.round((end - Number(sub.start_time)) / 1000)),
      tools: order.map(function (n) { return { name: n, count: counts[n] }; }),
      toolCount: evs.filter(function (e) { return e.type === 'tool.invoked'; }).length,
      reply: trim((reply || all).trim(), MAX_REPLY), error: err
    };
  }

  /**
   * Alt ajanları, ana sohbet mesajlarındaki Task/Agent araç satırlarına bağlar (part.subs).
   * Eşleşme: önce istem metni, sonra aynı turdaki sıra; bulunamazsa ebeveyn turun sonuna yapay bir araç satırı eklenir.
   * Dönüş: çalışan alt ajan sayısı (son turun rec.subRun alanına da yazılır).
   */
  function attach(messages, subs, now) {
    var running = 0, byTask = {};
    (subs || []).forEach(function (s) { (byTask[s.parent_task_id] = byTask[s.parent_task_id] || []).push(summarize(s, now)); });
    messages.forEach(function (m) {
      if (m.r !== 'b' || !byTask[m.taskId]) return;
      var mine = byTask[m.taskId], parts = m.parts.filter(function (p) { return p.k === 'tool' && isAgentTool(p.name); });
      var free = parts.slice(), left = [];
      mine.forEach(function (s) {
        var i = -1;
        for (var k = 0; k < free.length; k++) { var inp = free[k].input || {}; if (String(inp.prompt || '').trim() === String(subPrompt(subs, s.id)).trim()) { i = k; break; } }
        if (i >= 0) { push(free[i], s); free.splice(i, 1); } else left.push(s);
      });
      left.forEach(function (s) {
        if (free.length) { push(free.shift(), s); return; }
        var part = { k: 'tool', name: 'Agent', kind: 'task', summary: s.title, out: '', input: {}, t0: 0, t1: 0, subs: [s] };
        m.parts.push(part);
      });
    });
    function push(part, s) { (part.subs = part.subs || []).push(s); }
    Object.keys(byTask).forEach(function (k) { byTask[k].forEach(function (s) { if (s.status === 'running') running++; }); });
    var lastBot = null;
    messages.forEach(function (m) { if (m.r === 'b') lastBot = m; });
    if (lastBot) lastBot.subRun = running;
    return running;
  }
  function subPrompt(subs, id) {
    for (var i = 0; i < subs.length; i++) if (subs[i].task_id === id) return subs[i].prompt || '';
    return '';
  }

  function fmtSec(s) { return s < 60 ? s + ' sn' : Math.floor(s / 60) + ' dk ' + ('0' + (s % 60)).slice(-2) + ' sn'; }

  /** bir alt ajanın açılır bloğu (DOM); doc: document */
  function build(s, lang, doc) {
    function mk(tag, cls, txt) { var n = doc.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
    var det = mk('details', 'subagent sa-' + s.status);
    var sum = mk('summary');
    sum.appendChild(mk('span', 'sa-dot'));
    sum.appendChild(mk('span', 'sa-name', text('sub', lang)));
    sum.appendChild(mk('span', 'sa-title', s.title || s.model));
    sum.appendChild(mk('span', 'sa-state', text(s.status, lang) + ' · ' + fmtSec(s.sec) + ' · ' + s.toolCount + ' ' + text('tool', lang)));
    det.appendChild(sum);
    var body = mk('div', 'sa-body');
    if (s.prompt) { body.appendChild(mk('div', 'sa-k', text('task', lang))); body.appendChild(mk('div', 'sa-v', s.prompt)); }
    if (s.tools.length) {
      body.appendChild(mk('div', 'sa-k', text('tools', lang)));
      var chips = mk('div', 'sa-tools');
      s.tools.forEach(function (t) { chips.appendChild(mk('span', 'sa-chip', t.name + (t.count > 1 ? ' x' + t.count : ''))); });
      body.appendChild(chips);
    }
    body.appendChild(mk('div', 'sa-k', text('reply', lang)));
    body.appendChild(mk('div', 'sa-v' + (s.error ? ' sa-err' : ''), s.error || s.reply || text('none', lang)));
    det.appendChild(body);
    return det;
  }

  root.ObsSubagents = { text: text, statusOf: statusOf, summarize: summarize, attach: attach, isAgentTool: isAgentTool, build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ObsSubagents;
})(typeof globalThis !== 'undefined' ? globalThis : this);
