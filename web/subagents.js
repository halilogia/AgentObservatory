// Alt ajanlar (Claude Code Task/Agent aracı & Antigravity Subagents):
// Sunucunun döndürdüğü `subs` listesini sohbetteki ilgili araç satırına bağlar ve Antigravity tarzı Sağ Yan Paneli (Split View) yönetir.
(function (root) {
  'use strict';
  var LIVE_WINDOW_MS = 3600000, MAX_REPLY = 800, MAX_PROMPT = 400;
  var _registry = [];
  var _activeId = null;
  var _currentLang = 'tr';

  var TEXT = {
    tr: {
      sub: 'alt ajan', running: 'çalışıyor', done: 'bitti', error: 'hata', stopped: 'durduruldu',
      task: 'Görev', tools: 'Araçlar', reply: 'Son yanıt', none: 'yanıt yok',
      badge: '{n} alt ajan', live: '{n} alt ajan çalışıyor', tool: 'araç',
      openPanel: 'Yan Panel', fullView: 'Tam Görünüm',
      parentMsg: 'Message from Parent Agent',
      workedFor: 'Worked for {t}',
      filesChanged: '{n} file changed', filesChangedPlural: '{n} files changed',
      review: 'Review',
      killedNotice: 'This subagent was killed and can no longer be messaged.',
      runningNotice: 'This subagent is currently running in the background…'
    },
    en: {
      sub: 'subagent', running: 'running', done: 'done', error: 'error', stopped: 'stopped',
      task: 'Task', tools: 'Tools', reply: 'Final reply', none: 'no reply',
      badge: '{n} subagent(s)', live: '{n} subagent(s) running', tool: 'tools',
      openPanel: 'Side Panel', fullView: 'Full View',
      parentMsg: 'Message from Parent Agent',
      workedFor: 'Worked for {t}',
      filesChanged: '{n} file changed', filesChangedPlural: '{n} files changed',
      review: 'Review',
      killedNotice: 'This subagent was killed and can no longer be messaged.',
      runningNotice: 'This subagent is currently running in the background…'
    }
  };

  function text(key, lang, vars) {
    var s = (TEXT[lang] || TEXT.en)[key] || key;
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; });
  }

  function isAgentTool(name) {
    return name === 'Task' || name === 'Agent' || name === 'invoke_subagent' || name === 'run_agent' || name === 'start_task';
  }

  /** running | done | error | stopped; bir saatten eski "çalışıyor" kayıtları bitmemiş eski iş sayılır (bitti değil, durduruldu) */
  function statusOf(sub, now) {
    var s = sub.status;
    if (s === 'running' || s === 'pending') return now - Number(sub.start_time) < LIVE_WINDOW_MS ? 'running' : 'stopped';
    if (s === 'completed') return 'done';
    if (s === 'cancelled') return 'stopped';
    return 'error';
  }

  function trim(s, n) {
    s = String(s || '').replace(/\s+$/, '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function inferRoleName(sub, firstLine) {
    if (sub.role) return String(sub.role);
    var p = String(sub.prompt || '');
    if (/pixel[-_\s]?art|pxl\.js|sprite/i.test(p)) return 'Pixel Artist';
    if (/firestore\.rules/i.test(p)) return 'Firestore Rules Author';
    if (/a11y|accessibility/i.test(p)) return 'A11y Auditor';
    if (/research|araştır|incele/i.test(p)) return 'Codebase Researcher';
    if (/test|doğrula|verify/i.test(p)) return 'Verification Agent';
    if (sub.agent === 'codex') return 'Codex Agent';
    if (sub.agent === 'agy') return 'Antigravity Subagent';
    if (sub.agent === 'claude') return 'Claude Subagent';
    return trim(firstLine || sub.agent || 'Subagent', 28);
  }

  function extractFilesFromEvents(evs) {
    var fileMap = {};
    var fileOrder = [];
    (evs || []).forEach(function (e) {
      if (e.type !== 'tool.invoked') return;
      var d = e.data || {};
      var n = String(d.name || '');
      var inp = d.input || {};
      var filePath = inp.file_path || inp.path || inp.Path || inp.target_file || '';
      if (!filePath && (n === 'Bash' || n === 'run_command')) {
        var cmd = String(inp.command || inp.CommandLine || '');
        var m = cmd.match(/([\w./\\-]+\.(?:px\.js|js|ts|py|md|json|html|css))/i);
        if (m) filePath = m[1];
      }
      if (!filePath) return;
      var oldS = String(inp.old_string || inp.Target || '');
      var newS = String(inp.new_string || inp.Replacement || inp.content || inp.Content || '');
      var add = newS ? newS.split('\n').length : 12;
      var del = oldS ? oldS.split('\n').length : 0;
      if (!fileMap[filePath]) {
        fileMap[filePath] = { path: filePath, add: 0, del: 0, oldStr: oldS, newStr: newS, toolName: n, input: inp };
        fileOrder.push(filePath);
      }
      fileMap[filePath].add += add;
      fileMap[filePath].del += del;
      if (newS) fileMap[filePath].newStr = newS;
      if (oldS) fileMap[filePath].oldStr = oldS;
    });
    return fileOrder.map(function (k) { return fileMap[k]; });
  }

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
    var files = extractFilesFromEvents(evs);
    var totalAdd = 0, totalDel = 0;
    files.forEach(function (f) { totalAdd += f.add; totalDel += f.del; });
    return {
      id: sub.task_id,
      parent: sub.parent_task_id,
      status: status,
      model: sub.model || '',
      agent: sub.agent,
      roleName: inferRoleName(sub, firstLine),
      prompt: trim(sub.prompt, MAX_PROMPT),
      fullPrompt: String(sub.prompt || ''),
      title: trim(firstLine, 90),
      sec: Math.max(0, Math.round((end - Number(sub.start_time)) / 1000)),
      tools: order.map(function (n) { return { name: n, count: counts[n] }; }),
      toolCount: evs.filter(function (e) { return e.type === 'tool.invoked'; }).length,
      reply: trim((reply || all).trim(), MAX_REPLY),
      fullReply: String((reply || all).trim()),
      error: err,
      files: files,
      totalAdd: totalAdd,
      totalDel: totalDel
    };
  }

  /**
   * Alt ajanları, ana sohbet mesajlarındaki Task/Agent araç satırlarına bağlar (part.subs).
   * Eşleşme: önce istem metni, sonra aynı turdaki sıra; bulunamazsa ebeveyn turun sonuna yapay bir araç satırı eklenir.
   * Dönüş: çalışan alt ajan sayısı (son turun rec.subRun alanına da yazılır).
   */
  function attach(messages, subs, now) {
    var running = 0, byTask = {}, allSummarized = [];
    (subs || []).forEach(function (s) {
      var sum = summarize(s, now);
      allSummarized.push(sum);
      (byTask[s.parent_task_id] = byTask[s.parent_task_id] || []).push(sum);
    });
    _registry = allSummarized;
    messages.forEach(function (m) {
      if (m.r !== 'b' || !byTask[m.taskId]) return;
      var mine = byTask[m.taskId], parts = m.parts.filter(function (p) { return p.k === 'tool' && isAgentTool(p.name); });
      var free = parts.slice(), left = [];
      mine.forEach(function (s) {
        var i = -1;
        for (var k = 0; k < free.length; k++) {
          var inp = free[k].input || {};
          if (String(inp.prompt || inp.Prompt || '').trim() === String(subPrompt(subs, s.id)).trim()) { i = k; break; }
        }
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

  function fmtSec(s) {
    return s < 60 ? s + ' sn' : Math.floor(s / 60) + ' dk ' + ('0' + (s % 60)).slice(-2) + ' sn';
  }

  function fmtShortDuration(s) {
    if (s < 60) return Math.max(1, s) + 's';
    var m = Math.floor(s / 60);
    var rem = s % 60;
    return rem > 0 ? m + 'm ' + rem + 's' : m + 'm';
  }

  function upsertInRegistry(s) {
    if (!s || !s.id) return;
    for (var i = 0; i < _registry.length; i++) {
      if (_registry[i].id === s.id) { _registry[i] = s; return; }
    }
    _registry.push(s);
  }

  /** bir alt ajanın sohbetteki açılır bloğu (DOM); doc: document */
  function build(s, lang, doc) {
    _currentLang = lang || _currentLang || 'tr';
    upsertInRegistry(s);
    function mk(tag, cls, txt) {
      var n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (txt != null) n.textContent = txt;
      return n;
    }
    var det = mk('details', 'subagent sa-' + s.status);
    var sum = mk('summary');
    sum.appendChild(mk('span', 'sa-dot'));
    sum.appendChild(mk('span', 'sa-name', s.roleName || text('sub', lang)));
    sum.appendChild(mk('span', 'sa-title', s.title || s.model));
    sum.appendChild(mk('span', 'sa-state', text(s.status, lang) + ' · ' + fmtSec(s.sec) + ' · ' + s.toolCount + ' ' + text('tool', lang)));

    // Antigravity tarzı Sağ Yan Panelde Aç düğmesi
    if (doc && typeof doc.getElementById === 'function') {
      var openBtn = mk('button', 'sa-open-btn', '◨ ' + text('openPanel', lang));
      openBtn.type = 'button';
      openBtn.onclick = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openPanel(s, lang, doc);
      };
      sum.appendChild(openBtn);
    }

    det.appendChild(sum);
    var body = mk('div', 'sa-body');
    if (s.prompt) { body.appendChild(mk('div', 'sa-k', text('task', lang))); body.appendChild(mk('div', 'sa-v', s.prompt)); }
    if (s.tools && s.tools.length) {
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

  /** Sağ Alt Ajan Yan Panelini (Antigravity Split View) açar ve çizimini yapar */
  function openPanel(subOrId, lang, doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.getElementById) return;
    if (lang) _currentLang = lang;

    var target = null;
    if (typeof subOrId === 'object' && subOrId !== null) {
      upsertInRegistry(subOrId);
      target = subOrId;
    } else if (typeof subOrId === 'string') {
      for (var i = 0; i < _registry.length; i++) {
        if (_registry[i].id === subOrId) { target = _registry[i]; break; }
      }
    }
    if (!target && _registry.length) target = _registry[_registry.length - 1];
    if (!target) return;

    _activeId = target.id;
    var layout = doc.getElementById('layout');
    var panel = doc.getElementById('subPanel');
    var tabsBox = doc.getElementById('subPanelTabs');
    var bodyBox = doc.getElementById('subPanelBody');
    var footBox = doc.getElementById('subPanelFooter');
    if (!panel || !tabsBox || !bodyBox || !footBox) return;

    panel.hidden = false;
    if (layout) layout.classList.add('has-subpanel');

    function mk(tag, cls, txt) {
      var n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (txt != null) n.textContent = txt;
      return n;
    }

    // 1. Üst Sekmeler (Tabs: [Pixel Artist] +)
    tabsBox.innerHTML = '';
    _registry.forEach(function (item) {
      var tab = mk('button', 'subtab st-' + item.status + (item.id === _activeId ? ' active' : ''));
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(item.id === _activeId));
      tab.appendChild(mk('span', 'subtab-ico', '🪪'));
      tab.appendChild(mk('span', 'subtab-label', item.roleName || item.title || text('sub', _currentLang)));
      tab.onclick = function () { openPanel(item.id, _currentLang, doc); };
      tabsBox.appendChild(tab);
    });
    var plusBtn = mk('span', 'subtab-plus', '+');
    tabsBox.appendChild(plusBtn);

    // 2. Panel Gövdesi
    bodyBox.innerHTML = '';

    // Başlık Satırı: "Pixel Artist" ... "Full View ▤"
    var headRow = mk('div', 'subpanel-head-row');
    var roleTitle = mk('div', 'subpanel-role-title');
    roleTitle.appendChild(mk('span', '', target.roleName || target.title || text('sub', _currentLang)));
    headRow.appendChild(roleTitle);

    var fullBtn = mk('button', 'subpanel-fullview-btn', text('fullView', _currentLang) + ' ▤');
    fullBtn.type = 'button';
    fullBtn.onclick = function () {
      if (layout) layout.classList.toggle('subpanel-wide');
    };
    headRow.appendChild(fullBtn);
    bodyBox.appendChild(headRow);

    // Akordeon 1: Message from Parent Agent >
    if (target.fullPrompt || target.prompt) {
      var accMsg = mk('details', 'sub-acc');
      var sumMsg = mk('summary');
      sumMsg.appendChild(mk('span', '', text('parentMsg', _currentLang)));
      sumMsg.appendChild(mk('span', 'sub-acc-chev', '›'));
      accMsg.appendChild(sumMsg);
      accMsg.appendChild(mk('div', 'sub-acc-body', target.fullPrompt || target.prompt));
      bodyBox.appendChild(accMsg);
    }

    // Akordeon 2: Worked for 7m >
    var accWork = mk('details', 'sub-acc');
    var sumWork = mk('summary');
    sumWork.appendChild(mk('span', '', text('workedFor', _currentLang, { t: fmtShortDuration(target.sec) })));
    sumWork.appendChild(mk('span', 'sub-acc-chev', '›'));
    accWork.appendChild(sumWork);
    var workBody = mk('div', 'sub-acc-body');
    if (target.tools && target.tools.length) {
      var stepList = mk('div', 'sub-step-list');
      target.tools.forEach(function (tl) {
        var row = mk('div', 'sub-step-row');
        row.appendChild(mk('span', 'sub-step-name', tl.name));
        row.appendChild(mk('span', 'sub-step-meta', '×' + tl.count));
        stepList.appendChild(row);
      });
      workBody.appendChild(stepList);
    } else {
      workBody.textContent = text(target.status, _currentLang) + ' · ' + fmtSec(target.sec);
    }
    accWork.appendChild(workBody);
    bodyBox.appendChild(accWork);

    // Yanıt Metni (Response Box)
    var replyText = target.error || target.fullReply || target.reply || text('none', _currentLang);
    var replyBox = mk('div', 'sub-reply-box' + (target.error ? ' sub-reply-err' : ''));
    // UUID veya dosya kodu varsa pill olarak vurgula
    var parts = String(replyText).split(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[\w./\\-]+\.(?:px\.js|gif|png|json|ts|js|md))/gi);
    parts.forEach(function (part, idx) {
      if (idx % 2 === 1) {
        replyBox.appendChild(mk('code', 'sub-id-pill', part));
      } else if (part) {
        replyBox.appendChild(doc.createTextNode(part));
      }
    });
    bodyBox.appendChild(replyBox);

    // Değişen Dosyalar Kartı: "1 file changed +127 -0 > [Review]"
    var files = target.files && target.files.length ? target.files : [];
    if (files.length > 0) {
      var fCard = mk('div', 'sub-files-card');
      var fBar = mk('div', 'sub-files-bar');
      var fLeft = mk('div', 'sub-files-left');
      var fCountTxt = files.length === 1
        ? text('filesChanged', _currentLang, { n: 1 })
        : text('filesChangedPlural', _currentLang, { n: files.length });
      fLeft.appendChild(mk('span', '', fCountTxt));
      fLeft.appendChild(mk('span', 'sub-stat-add', '+' + (target.totalAdd || 127)));
      fLeft.appendChild(mk('span', 'sub-stat-del', '-' + (target.totalDel || 0)));
      fLeft.appendChild(mk('span', 'sub-acc-chev', '›'));
      fBar.appendChild(fLeft);

      var revBtn = mk('button', 'sub-review-btn', '📄 ' + text('review', _currentLang));
      revBtn.type = 'button';
      fBar.appendChild(revBtn);
      fCard.appendChild(fBar);

      var fDrawer = mk('div', 'sub-files-drawer');
      fDrawer.hidden = true;
      files.forEach(function (f) {
        var fItem = mk('div', 'sub-file-item');
        fItem.appendChild(mk('span', '', f.path));
        fItem.appendChild(mk('span', 'sub-stat-add', '+' + f.add + ' -' + f.del));
        fDrawer.appendChild(fItem);
        if (root.ObsDiff && typeof root.ObsDiff.computeDiff === 'function' && (f.newStr || f.oldStr)) {
          var diffData = root.ObsDiff.computeDiff(f.oldStr || '', f.newStr || '', 1);
          diffData.file = f.path;
          root.ObsDiff.renderDiff(doc, fDrawer, diffData, { maxLines: 25 });
        }
      });
      fCard.appendChild(fDrawer);

      var toggleDrawer = function () { fDrawer.hidden = !fDrawer.hidden; };
      fLeft.onclick = toggleDrawer;
      revBtn.onclick = toggleDrawer;
      bodyBox.appendChild(fCard);
    }

    // 3. Alt Durum Çubuğu (Footer Banner)
    footBox.innerHTML = '';
    var banner = mk(
      'div',
      'subpanel-status-banner' + (target.status === 'running' ? ' is-running' : ''),
      target.status === 'running' ? text('runningNotice', _currentLang) : text('killedNotice', _currentLang)
    );
    footBox.appendChild(banner);
  }

  function closePanel(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.getElementById) return;
    var layout = doc.getElementById('layout');
    var panel = doc.getElementById('subPanel');
    if (panel) panel.hidden = true;
    if (layout) {
      layout.classList.remove('has-subpanel');
      layout.classList.remove('subpanel-wide');
    }
    _activeId = null;
  }

  function initPanelControls(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.getElementById) return;
    var closeBtn = doc.getElementById('subPanelClose');
    var expandBtn = doc.getElementById('subPanelExpand');
    var layout = doc.getElementById('layout');
    if (closeBtn) closeBtn.onclick = function () { closePanel(doc); };
    if (expandBtn) expandBtn.onclick = function () {
      if (layout) layout.classList.toggle('subpanel-wide');
    };
    if (typeof location !== 'undefined' && location.search) {
      var params = new URLSearchParams(location.search);
      if (params.get('demo_subpanel') === '1') {
        if (doc.documentElement) doc.documentElement.setAttribute('data-theme', 'dark');
        openPanel({
          id: 'sub_pxl_demo',
          status: 'done',
          roleName: 'Pixel Artist',
          title: 'Pixel Artist',
          sec: 420,
          fullPrompt: '16x16 piksel sanat sunucu kabini ve kahve otomatı prop animasyonlarını pxl.js ile tasarla ve derle.',
          tools: [{ name: 'write_file', count: 1 }, { name: 'run_command', count: 2 }],
          toolCount: 3,
          fullReply: 'Tasarım ve derleme işlemi tamamlandı; detaylı asset yolları ve tasarım özeti ana ajana ( ea6de370-2461-403f-81a4-080391a4e1aa ) mesaj olarak iletildi.',
          files: [{ path: 'office_props.px.js', add: 127, del: 0, oldStr: '', newStr: '// 16x16 Pixel Art Office Props\nconst palette = { bg: "#1a1c2c", led: "#38b764" };' }],
          totalAdd: 127,
          totalDel: 0
        }, 'tr', doc);
      } else if (params.get('subpanel')) {
        openPanel(params.get('subpanel'), 'tr', doc);
      }
    }
  }

  root.ObsSubagents = {
    text: text,
    statusOf: statusOf,
    summarize: summarize,
    attach: attach,
    isAgentTool: isAgentTool,
    build: build,
    openPanel: openPanel,
    closePanel: closePanel,
    initPanelControls: initPanelControls,
    getRegistry: function () { return _registry.slice(); }
  };
  if (root.document && typeof root.document.getElementById === 'function') {
    initPanelControls(root.document);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ObsSubagents;
})(typeof globalThis !== 'undefined' ? globalThis : this);
