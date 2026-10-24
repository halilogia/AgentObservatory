(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const TOKEN = document.querySelector('meta[name="obs-token"]').content;
  const I18N = ObsI18n;
  const t = (key, params) => I18N.t(key, params);
  const svg = (d, extra = '') => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  const ICON = {
    chev: svg('<path d="M4 6l4 4 4-4"/>'),
    caps: svg('<path d="M8 2.5l1.3 3.2 3.2 1.3-3.2 1.3L8 11.5 6.7 8.3 3.5 7l3.2-1.3z"/><path d="M12.5 11v3M11 12.5h3"/>'),
    undo: svg('<path d="M6 3.5L3 6.5l3 3"/><path d="M3 6.5h6.5a3.5 3.5 0 010 7H6"/>'),
    check: svg('<path d="M3.5 8.5l3 3 6-7"/>'),
    folder: svg('<path d="M2 4.5A1.5 1.5 0 013.5 3h2.3l1.4 1.5h5.3A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5z"/>'),
    lock: svg('<rect x="3.5" y="7" width="9" height="6" rx="1.5"/><path d="M5.5 7V5.5a2.5 2.5 0 015 0V7"/>'),
    pen: svg('<path d="M3 13l.7-2.8L10.9 3a1.2 1.2 0 011.7 0l.4.4a1.2 1.2 0 010 1.7L5.8 12.3z"/>'),
    up: svg('<path d="M8 13V3M3.5 7.5L8 3l4.5 4.5"/>'),
    plus: svg('<path d="M8 3v10M3 8h10"/>'),
    panel: svg('<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6 3v10"/>'),
    x: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
    sun: svg('<circle cx="8" cy="8" r="2.8"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/>'),
    moon: svg('<path d="M13 9.6A5.4 5.4 0 016.4 3 5.4 5.4 0 108 13.4a5.4 5.4 0 005-3.8z"/>'),
    stop: '<svg viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor"/></svg>'
  };
  const st = { cfg: null, engine: 'claude', model: 'sonnet', effort: 'medium', mode: 'read', cwd: '', running: null };
  const views = new Map();
  let chat = null;
  let early = [];
  let stick = true;
  const locale = () => (I18N.language === 'tr' ? 'tr-TR' : 'en-US');

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const engineById = (id) => st.cfg.engines.find((e) => e.id === id);
  const fmtTok = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n));
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* yoksay */ } };
  const saveSettings = () => lsSet('obs-web', JSON.stringify({ engine: st.engine, model: st.model, effort: st.effort, cwd: st.cwd }));

  async function api(path, body) {
    const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-observatory-token': TOKEN }, body: JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch { /* gövde yok */ }
    if (!r.ok) throw Object.assign(new Error(j.error || 'HTTP ' + r.status), { info: j });
    return j;
  }
  /** sunucu hata kodunu seçili dile çevirir; kod yoksa sunucu metnini gösterir */
  function apiMsg(err) {
    const i = err.info || {};
    return i.code ? t('api.' + i.code, i.params || {}) : err.message;
  }

  // ---------- kaydırma ve kopyalama ----------
  const main = () => $('#main');
  function scrollDown(force) {
    if (force) stick = true;
    if (!stick) return;
    requestAnimationFrame(() => { main().scrollTop = main().scrollHeight; });
  }
  function onScroll() {
    const m = main();
    stick = m.scrollHeight - m.scrollTop - m.clientHeight < 80;
    $('#jump').hidden = stick || !$('#thread').childElementCount;
  }
  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = el('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { /* yoksay */ } ta.remove();
    }
    if (btn) { const old = btn.textContent; btn.textContent = t('common.copied'); setTimeout(() => { btn.textContent = old; }, 1200); }
  }
  const renderMd = (box, text) => ObsMd.render(document, box, text, { onCopy: copyText, copyLabel: t('common.copy') });

  function toolSummary(name, input) {
    const o = input && typeof input === 'object' ? input : {};
    const v = o.command ?? o.CommandLine ?? o.cmd ?? o.file_path ?? o.filePath ?? o.path ?? o.pattern ?? o.query ?? Object.values(o).find((x) => typeof x === 'string') ?? '';
    return String(v).replace(/\s+/g, ' ').slice(0, 140);
  }
  /** Bildirimler dilden bağımsız saklanır ({key, params} veya ham metin) ve çizilirken çevrilir */
  function noticeFor(d) {
    const kind = d.errorKind;
    if (kind === 'rate_limit') return d.cooldownMs ? { key: 'err.rate_limit_wait', mins: Math.max(1, Math.round(d.cooldownMs / 60000)) } : { key: 'err.rate_limit' };
    if (['auth', 'model_unsupported', 'permission', 'spawn_failed'].includes(kind)) return { key: 'err.' + kind };
    const raw = String(d.error || d.reason || '').split('\n')[0].slice(0, 300);
    return raw ? { text: raw } : { key: 'notice.failed' };
  }
  function noticeText(n) {
    if (n.key) {
      const p = { ...(n.params || {}) };
      if (n.mins) p.wait = n.mins >= 90 ? t('time.hours', { count: Math.round(n.mins / 60) }) : t('time.minutes', { count: n.mins });
      return t(n.key, p);
    }
    return n.text || '';
  }
  function metaText(m) {
    if (typeof m === 'string') return m; // eski kayıtlar
    if (!m) return '';
    return [t('meta.sec', { n: m.sec }), m.tin ? t('meta.in', { n: fmtTok(m.tin) }) : '', m.tout ? t('meta.out', { n: fmtTok(m.tout) }) : ''].filter(Boolean).join(' · ');
  }

  // ---------- sohbet verisi ve geçmiş ----------
  function ensureChat(firstText) {
    if (chat) return;
    chat = { id: ObsStore.newId(), title: firstText.replace(/\s+/g, ' ').slice(0, 48), created: Date.now(), updated: Date.now(), session: null, messages: [] };
  }
  function persist() { if (chat && chat.messages.length) { ObsStore.save(chat); renderHistory(); } }
  function when(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return t('time.now'); if (m < 60) return t('time.min', { n: m }); if (m < 1440) return t('time.hour', { n: Math.round(m / 60) });
    return new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  }
  function renderHistory() {
    const box = $('#history'); box.replaceChildren();
    const list = ObsStore.list();
    if (!list.length) return;
    const day = (ts) => { const d = new Date(ts), n = new Date(); const diff = Math.floor((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5); return diff <= 0 ? t('history.today') : diff === 1 ? t('history.yesterday') : t('history.older'); };
    let last = '';
    list.forEach((c) => {
      const g = day(c.updated); if (g !== last) { box.appendChild(el('div', 'hgroup', g)); last = g; }
      const item = el('div', 'hitem' + (chat && chat.id === c.id ? ' on' : ''));
      const title = c.title || t('history.untitled');
      const main1 = el('button', 'hmain'); main1.type = 'button'; main1.title = title;
      const lastBot = [...c.messages].reverse().find((m) => m.r === 'b');
      const dot = el('span', 'dot'); if (lastBot) dot.style.setProperty('--c', lastBot.color);
      main1.append(dot, el('span', 't', title), el('span', 'when', when(c.updated)));
      main1.onclick = () => loadChat(c.id);
      const del = el('button', 'del'); del.type = 'button'; del.setAttribute('aria-label', t('history.delete')); del.innerHTML = ICON.x;
      del.onclick = (ev) => { ev.stopPropagation(); ObsStore.remove(c.id); if (chat && chat.id === c.id) newChat(); else renderHistory(); };
      item.append(main1, del); box.appendChild(item);
    });
  }
  function clearThread() { $('#thread').replaceChildren(); views.clear(); }
  function showThread(has) { $('#empty').hidden = has; }
  function renderThread() {
    clearThread();
    if (!chat || !chat.messages.length) { showThread(false); return; }
    showThread(true);
    chat.messages.forEach((m, i) => { if (m.r === 'u') addUserDom(m.text, i); else createBot(m, false); });
  }
  function newChat() {
    if (st.running) return;
    chat = null; clearThread(); showThread(false); renderHistory(); $('#prompt').focus(); stick = true; onScroll();
  }
  function loadChat(id) {
    if (st.running) { $('#foot').textContent = t('foot.busy'); return; }
    const c = ObsStore.get(id); if (!c) return;
    chat = c; renderThread();
    const lastBot = [...c.messages].reverse().find((m) => m.r === 'b');
    if (lastBot && engineById(lastBot.engine)) {
      const le = engineById(lastBot.engine); // model listeden kalkmış olabilir (OpenCode ücretsiz listesi değişir): ilk modele düş
      st.engine = lastBot.engine; st.model = le.models.some((x) => x.id === lastBot.model) ? lastBot.model : le.models[0].id;
      if (lastBot.effort && le.efforts.includes(lastBot.effort)) st.effort = lastBot.effort;
      if (st.cfg.projects.some((p) => p.path === lastBot.cwd)) st.cwd = lastBot.cwd;
      if (!engineById(st.engine).write) st.mode = 'read';
    }
    refreshControls(); renderHistory(); closeNavOnMobile(); scrollDown(true); onScroll();
  }

  // ---------- mesaj DOM'u ----------
  function addUserDom(text, idx) {
    showThread(true);
    const d = el('div', 'msg user', text);
    const b = el('button', 'undo'); b.type = 'button'; b.title = t('rewind.title'); b.setAttribute('aria-label', t('rewind.title')); b.innerHTML = ICON.undo;
    b.onclick = () => rewind(idx);
    d.appendChild(b); $('#thread').appendChild(d); scrollDown();
  }
  /** küçük onay penceresi: seçilen düğmenin sırasını döndürür, kapatılırsa -1 */
  function ask(text, labels) {
    return new Promise((resolve) => {
      const ov = el('div', 'dlg'); const box = el('div', 'dlgbox'); box.setAttribute('role', 'dialog'); box.append(el('p', '', text));
      const done = (n) => { ov.remove(); document.removeEventListener('keydown', onKey, true); resolve(n); };
      const onKey = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); done(-1); } };
      labels.forEach((l, n) => { const b = el('button', n === 0 ? 'primary' : '', l); b.type = 'button'; b.onclick = () => done(n); box.appendChild(b); });
      ov.onclick = (ev) => { if (ev.target === ov) done(-1); };
      document.addEventListener('keydown', onKey, true); ov.appendChild(box); document.body.appendChild(ov); box.querySelector('button').focus();
    });
  }
  /** her CLI'nin skill / ajan / komut / MCP / eklenti adları (salt okunur; gizli değerler sunucuda bile okunmaz) */
  async function openCaps() {
    if (document.querySelector('.dlg')) return;
    let data; try { data = await api('/api/capabilities?cwd=' + encodeURIComponent(st.cwd)); } catch (err) { $('#foot').textContent = err.info ? apiMsg(err) : err.message; return; }
    let cur = st.engine, q = '';
    const ov = el('div', 'dlg'); const box = el('div', 'dlgbox caps'); box.setAttribute('role', 'dialog');
    const tabs = el('div', 'ctabs'), search = el('input', 'addin'), list = el('div', 'clist');
    search.type = 'text'; search.placeholder = t('caps.search'); search.spellcheck = false;
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } };
    function paint() {
      tabs.replaceChildren(); list.replaceChildren();
      st.cfg.engines.forEach((e) => {
        const b = el('button', 'ctab' + (e.id === cur ? ' on' : ''), e.label.replace(/ \(.*\)$/, '')); b.type = 'button'; b.style.setProperty('--c', e.color);
        b.onclick = () => { cur = e.id; paint(); }; tabs.appendChild(b);
      });
      const c = data[cur] || {}; let any = false; const low = q.toLowerCase();
      ['skills', 'agents', 'commands', 'mcp', 'plugins'].forEach((k) => {
        const items = (c[k] || []).filter((i) => !low || i.name.toLowerCase().includes(low) || (i.desc || '').toLowerCase().includes(low));
        if (!items.length) return; any = true;
        list.appendChild(el('div', 'hgroup', t('caps.' + k) + ' · ' + items.length));
        items.forEach((i) => {
          const row = el('div', 'crow'); const head = el('div', 'cname', i.name);
          if (i.scope === 'project') head.appendChild(el('span', 'cbadge', t('caps.project')));
          row.appendChild(head); if (i.desc) row.appendChild(el('div', 'cdesc', i.desc)); list.appendChild(row);
        });
      });
      if (!any) list.appendChild(el('div', 'cnone', t('caps.none')));
    }
    search.oninput = () => { q = search.value.trim(); paint(); };
    const x = el('button', '', t('caps.close')); x.type = 'button'; x.onclick = close;
    ov.onclick = (ev) => { if (ev.target === ov) close(); };
    box.append(el('p', 'ctitle', t('caps.title')), tabs, search, list, x);
    document.addEventListener('keydown', onKey, true); ov.appendChild(box); document.body.appendChild(ov); paint(); search.focus();
  }
  /** sohbeti seçilen kullanıcı mesajından önceki haline geri sarar; Yazabilir kipinde değişen dosyalar da geri alınabilir */
  async function rewind(i) {
    if (st.running || !chat) return;
    const removed = chat.messages.slice(i);
    const snapRec = removed.find((m) => m.r === 'b' && m.snap);
    let files = false;
    if (snapRec) {
      const c = await ask(t('rewind.askFiles'), [t('rewind.both'), t('rewind.chatOnly'), t('rewind.cancel')]);
      if (c === 2 || c < 0) return;
      files = c === 0;
    }
    if (files) {
      try { await api('/api/restore', { cwd: snapRec.snapCwd, snap: snapRec.snap }); }
      catch (err) { $('#foot').textContent = err.info ? apiMsg(err) : err.message; return; }
    }
    const text = removed[0].text;
    chat.messages = chat.messages.slice(0, i);
    chat.session = null; // CLI oturumu geri alınan turları hâlâ hatırlar: yeni oturum açılır, bağlam özetle taşınır
    if (chat.messages.length) persist(); else { ObsStore.remove(chat.id); chat = null; }
    renderThread(); renderHistory();
    const box = $('#prompt'); box.value = text; autosize(); box.focus();
  }
  function fullText(rec) { return rec.parts.filter((p) => p.k === 'text').map((p) => p.v).join('\n\n'); }
  function engineLabel(rec) { const e = st.cfg && engineById(rec.engine); return e ? e.label : rec.engine; }

  function createBot(rec, live) {
    showThread(true);
    const row = el('div', 'msg bot'); row.style.setProperty('--c', rec.color);
    row.appendChild(el('div', 'avatar', engineLabel(rec).charAt(0)));
    const col = el('div', 'body');
    const who = el('div', 'who'); who.appendChild(el('span', '', `${engineLabel(rec)} · ${rec.label}`));
    const dots = el('span', 'state'); dots.append(el('b'), el('b'), el('b'));
    if (live) who.appendChild(dots);
    const content = el('div'); const meta = el('div', 'meta');
    col.append(who, content, meta); row.appendChild(col);
    $('#thread').appendChild(row);
    const v = { rec, row, content, meta, dots, curText: null, tools: new Map(), lastTool: null, raf: 0, tin: 0, tout: 0, t0: Date.now(), done: !live };
    if (!live) {
      rec.parts.forEach((p) => { if (p.k === 'text') { const box = el('div'); content.appendChild(box); renderMd(box, p.v); } else buildTool(v, p, true); });
      if (rec.notice) content.appendChild(el('div', 'notice' + (rec.notice.warn ? ' warn' : ''), noticeText(rec.notice)));
      renderMeta(v);
    }
    scrollDown();
    return v;
  }
  function addText(v, txt) {
    if (!txt) return;
    if (!v.curText) { const part = { k: 'text', v: '' }; v.rec.parts.push(part); v.curText = { part, box: el('div') }; v.content.appendChild(v.curText.box); }
    v.curText.part.v += txt;
    if (!v.raf) v.raf = requestAnimationFrame(() => { v.raf = 0; if (v.curText) renderMd(v.curText.box, v.curText.part.v); scrollDown(); });
  }
  function buildTool(v, part, withOut) {
    const det = el('details', 'tool'); const sum = el('summary');
    sum.append(el('span', 'tn', part.name), el('span', 'ts', part.summary || ''));
    det.appendChild(sum); v.content.appendChild(det);
    if (withOut && part.out) { const pre = el('pre'); pre.appendChild(el('code', '', part.out)); det.appendChild(pre); }
    return det;
  }
  function addTool(v, d) {
    v.curText = null;
    const part = { k: 'tool', name: d.name || 'tool', summary: toolSummary(d.name, d.input), out: '' };
    v.rec.parts.push(part);
    const rec = { part, det: buildTool(v, part, false), done: false };
    v.tools.set(d.id || 'n' + v.tools.size, rec); v.lastTool = rec; scrollDown();
  }
  function toolDone(v, d) {
    const rec = (d.toolUseId && v.tools.get(d.toolUseId)) || v.lastTool;
    if (!rec || rec.done) return;
    rec.done = true;
    const out = String(d.output ?? d.result ?? '').split('\n').slice(0, 40).join('\n').slice(0, 4000);
    rec.part.out = out;
    if (out.trim()) { const pre = el('pre'); pre.appendChild(el('code', '', out)); rec.det.appendChild(pre); }
  }
  function renderMeta(v) {
    v.meta.replaceChildren();
    const txt = metaText(v.rec.meta);
    if (txt) v.meta.appendChild(el('span', '', txt));
    if (fullText(v.rec)) { const b = el('button', '', t('common.copy')); b.type = 'button'; b.onclick = () => copyText(fullText(v.rec), b); v.meta.appendChild(b); }
  }
  function retryRow(v) {
    const others = st.cfg.engines.filter((e) => e.id !== v.rec.engine && e.installed && !e.limitedUntil);
    if (!others.length || !v.rec.prompt) return;
    const row = el('div', 'retry'); row.appendChild(el('span', '', t('retry.label')));
    others.forEach((e) => {
      const b = el('button'); b.type = 'button';
      const d = el('span', 'dot'); d.style.setProperty('--c', e.color);
      b.append(d, document.createTextNode(e.label));
      b.onclick = () => { st.engine = e.id; st.model = e.models[0].id; if (!e.efforts.includes(st.effort)) st.effort = e.efforts.includes('medium') ? 'medium' : e.efforts[0] || ''; if (!e.write) st.mode = 'read'; saveSettings(); refreshControls(); runPrompt(v.rec.prompt, { bubble: false }); };
      row.appendChild(b);
    });
    v.content.appendChild(row);
  }
  function finish(v, kind, d) {
    if (v.done) return; v.done = true;
    v.dots.remove();
    if (v.raf) { cancelAnimationFrame(v.raf); v.raf = 0; }
    if (!fullText(v.rec) && d && d.result && kind === 'completed') addText(v, String(d.result));
    if (v.raf) { cancelAnimationFrame(v.raf); v.raf = 0; }
    if (v.curText) renderMd(v.curText.box, v.curText.part.v);
    let notice = null;
    if (kind === 'failed') notice = noticeFor(d || {});
    else if (kind === 'cancelled') notice = { key: 'notice.cancelled', warn: true };
    else if (kind === 'completed' && !fullText(v.rec)) notice = { key: v.tools.size ? 'notice.noTextTools' : 'notice.noText', warn: true };
    if (notice) { v.rec.notice = notice; v.content.appendChild(el('div', 'notice' + (notice.warn ? ' warn' : ''), noticeText(notice))); }
    if (kind === 'failed') retryRow(v);
    v.rec.meta = { sec: Math.round((Date.now() - v.t0) / 1000), tin: v.tin, tout: v.tout };
    renderMeta(v);
    if (st.running === v.rec.taskId) st.running = null;
    persist(); refreshSend(); refreshConfig(); $('#prompt').focus(); scrollDown();
  }

  // ---------- olay akışı ----------
  function onEvent(ev) {
    const v = views.get(ev.taskId);
    if (!v) { early.push(ev); if (early.length > 600) early = early.slice(-300); return; }
    if (ev.sessionId && !v.done && chat) chat.session = { id: ev.sessionId, engine: v.rec.engine, cwd: v.rec.cwd };
    const d = ev.data || {};
    if (ev.type === 'message.delta') addText(v, String(d.text || ''));
    else if (ev.type === 'tool.invoked') addTool(v, d);
    else if (ev.type === 'tool.completed') toolDone(v, d);
    else if (ev.type === 'usage.updated') { const u = d.usage || {}; v.tin += Number(u.input_tokens ?? u.inputTokens ?? u.input ?? 0) || 0; v.tout += Number(u.output_tokens ?? u.outputTokens ?? u.output ?? 0) || 0; }
    else if (ev.type === 'task.completed') finish(v, 'completed', d);
    else if (ev.type === 'task.failed') finish(v, 'failed', d);
    else if (ev.type === 'task.cancelled') finish(v, 'cancelled', d);
  }
  function connect() {
    const es = new EventSource('/stream');
    es.addEventListener('observatory', (m) => { try { onEvent(JSON.parse(m.data)); } catch { /* bozuk olay */ } });
    es.onopen = () => refreshFoot();
    es.onerror = () => { $('#foot').textContent = t('foot.disconnected'); };
  }

  // ---------- gönderme ----------
  async function runPrompt(text, o = {}) {
    if (st.running || !text.trim()) return;
    ensureChat(text);
    const e = engineById(st.engine); const m = e.models.find((x) => x.id === st.model);
    // oturum sürdürülemiyorsa (motor ya da klasör değişti) önceki konuşma özet olarak yeni isteme eklenir
    const resume = chat.session && chat.session.engine === e.id && chat.session.cwd === st.cwd ? chat.session.id : undefined;
    const sendText = resume ? text : ObsCtx.build(chat.messages, text) || text;
    if (o.bubble !== false) { chat.messages.push({ r: 'u', text }); addUserDom(text); }
    const rec = { r: 'b', engine: e.id, model: m.id, label: m.label, color: e.color, parts: [], notice: null, meta: null, prompt: text, cwd: st.cwd, taskId: null, effort: e.efforts.length ? st.effort : '' };
    chat.messages.push(rec);
    const view = createBot(rec, true);
    st.running = 'pending'; stick = true; refreshSend(); persist();
    try {
      if (e.write && st.mode === 'write') { // dosya geri alma için: görev başlamadan önce klasörün anlık görüntüsü (git deposu değilse yok)
        try { rec.snap = (await api('/api/snapshot', { cwd: st.cwd })).snap || null; rec.snapCwd = st.cwd; } catch { rec.snap = null; }
      }
      const r = await api('/api/run', { engine: e.id, model: m.id, effort: e.efforts.length ? st.effort : undefined, prompt: sendText, mode: e.write ? st.mode : 'read', cwd: st.cwd, sessionId: resume });
      rec.taskId = r.taskId; views.set(r.taskId, view); st.running = r.taskId;
      const buffered = early.filter((x) => x.taskId === r.taskId); early = early.filter((x) => x.taskId !== r.taskId);
      buffered.forEach(onEvent); refreshSend();
    } catch (err) {
      view.dots.remove(); view.done = true; st.running = null;
      const i = err.info || {};
      rec.notice = i.code ? { key: 'api.' + i.code, params: i.params || {} } : { text: err.message };
      view.content.appendChild(el('div', 'notice', noticeText(rec.notice)));
      retryRow(view); persist(); refreshSend(); refreshConfig();
    }
  }
  async function send() {
    if (st.running) { const id = st.running; if (id !== 'pending') { try { await api('/api/cancel', { taskId: id }); } catch { /* bitmiş olabilir */ } } return; }
    const box = $('#prompt'); const text = box.value.trim();
    if (!text) return;
    box.value = ''; autosize(); hideSlash();
    runPrompt(text);
  }

  // ---------- kontroller ----------
  function autosize() { const b = $('#prompt'); b.style.height = 'auto'; b.style.height = Math.min(b.scrollHeight, 220) + 'px'; refreshSend(); updateSlash(); }
  function refreshSend() {
    const b = $('#send'); const running = !!st.running;
    b.innerHTML = running ? ICON.stop : ICON.up;
    b.setAttribute('aria-label', running ? t('composer.stop') : t('composer.send'));
    b.disabled = running ? st.running === 'pending' : !$('#prompt').value.trim();
    $('#newChat').disabled = running;
  }
  const shortModel = (m) => m.label.replace(/^Claude /, '');
  const effortLabel = (x) => t('effort.' + x);
  function refreshControls() {
    const e = engineById(st.engine); const m = e.models.find((x) => x.id === st.model);
    $('#modelDot').style.setProperty('--c', e.color);
    $('#modelLabel').textContent = shortModel(m) + (e.efforts.length ? ' · ' + effortLabel(st.effort) : '');
    $('#projectIco').innerHTML = ICON.folder;
    $('#projectLabel').textContent = st.cwd.split(/[\\/]/).filter(Boolean).pop() || t('project.label');
    $('#projectBtn').title = st.cwd;
    document.querySelectorAll('.chev').forEach((c) => { c.innerHTML = ICON.chev; });
    const mb = $('#modeBtn'); const write = st.mode === 'write' && e.write;
    mb.disabled = !e.write; mb.classList.toggle('on', write);
    $('#modeIco').innerHTML = write ? ICON.pen : ICON.lock;
    $('#modeLabel').textContent = write ? t('mode.write') : t('mode.read');
    mb.title = !e.write ? t('mode.noWrite', { engine: e.label }) : write ? t('mode.writeTitle') : t('mode.readTitle');
    refreshFoot();
  }
  function refreshFoot() {
    $('#foot').textContent = '';
  }
  function renderEngineStatus() {
    const box = $('#engineStatus'); box.replaceChildren();
    // yalnızca sorunlu motor gösterilir (kurulu değil / kota dolu)
    st.cfg.engines.filter((e) => !e.installed || e.limitedUntil).forEach((e) => {
      const c = el('span', 'eng' + (!e.installed || e.limitedUntil ? ' off' : '')); c.style.setProperty('--c', e.color);
      const label = e.limitedUntil ? t('status.limitUntil', { engine: e.label, time: new Date(e.limitedUntil).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) }) : !e.installed ? `${e.label} · ${t('status.notInstalled')}` : e.label;
      c.append(el('i'), document.createTextNode(label)); box.appendChild(c);
    });
  }

  // menüler: yer yoksa aşağı açılır, yükseklik sınırlanır ve kaydırılır (taşma yok)
  function placeMenu(menu) {
    const c = $('#composer').getBoundingClientRect();
    const above = c.top - 12, below = innerHeight - c.bottom - 12;
    const up = above >= 320 || above >= below;
    menu.classList.toggle('up', up); menu.classList.toggle('down', !up);
    menu.style.maxHeight = Math.max(160, Math.floor((up ? above : below) - 8)) + 'px';
  }
  function closeMenus() { $('#modelMenu').hidden = true; $('#projectMenu').hidden = true; hideSlash(); }
  function pick(engineId, modelId) {
    const e = engineById(engineId); st.engine = engineId; st.model = modelId;
    if (!e.efforts.includes(st.effort)) st.effort = e.efforts.includes('medium') ? 'medium' : e.efforts[0] || '';
    if (!e.write) st.mode = 'read';
    saveSettings(); refreshControls(); openModelMenu(true);
  }
  function openModelMenu(keep) {
    const menu = $('#modelMenu');
    if (!keep && !menu.hidden) { menu.hidden = true; return; }
    const keepScroll = menu.scrollTop;
    $('#projectMenu').hidden = true; hideSlash(); menu.replaceChildren();
    st.cfg.engines.forEach((e) => {
      const g = el('div', 'mgroup'); const gd = el('span', 'dot'); gd.style.setProperty('--c', e.color); g.append(gd, document.createTextNode(e.label)); menu.appendChild(g);
      e.models.forEach((m) => {
        const blocked = !e.installed ? t('status.notInstalled') : e.limitedUntil ? t('status.limited') : '';
        const b = el('button', 'item'); b.type = 'button'; b.disabled = !!blocked; b.setAttribute('role', 'option');
        const dot = el('span', 'dot'); dot.style.setProperty('--c', e.color);
        const txt = el('span'); txt.append(el('div', 't', m.label), el('div', 's', t(m.sub)));
        if (blocked) txt.appendChild(el('div', 'b', blocked));
        const ck = el('span', 'check'); if (e.id === st.engine && m.id === st.model) ck.innerHTML = ICON.check;
        b.append(dot, txt, ck); b.onclick = () => pick(e.id, m.id); menu.appendChild(b);
      });
    });
    const e = engineById(st.engine); const box = el('div', 'effort');
    const row = el('div', 'row'); row.append(el('span', '', t('effort.title')), el('span', '', e.efforts.length ? effortLabel(st.effort) : t('effort.none'))); box.appendChild(row);
    const seg = el('div', 'seg');
    (e.efforts.length ? e.efforts : ['—']).forEach((x) => {
      const b = el('button', x === st.effort ? 'on' : '', e.efforts.length ? effortLabel(x) : x); b.type = 'button'; b.disabled = !e.efforts.length;
      b.onclick = () => { st.effort = x; saveSettings(); refreshControls(); openModelMenu(true); }; seg.appendChild(b);
    });
    box.appendChild(seg); menu.appendChild(box); menu.hidden = false; placeMenu(menu); menu.scrollTop = keepScroll;
  }
  function openProjectMenu() {
    const menu = $('#projectMenu');
    if (!menu.hidden) { menu.hidden = true; return; }
    $('#modelMenu').hidden = true; hideSlash(); menu.replaceChildren();
    st.cfg.projects.forEach((p) => {
      const b = el('button', 'item'); b.type = 'button';
      const ic = el('span', 'ico'); ic.innerHTML = ICON.folder;
      const txt = el('span'); txt.append(el('div', 't', p.name), el('div', 's', p.path));
      const ck = el('span', 'check'); if (p.path === st.cwd) ck.innerHTML = ICON.check;
      b.append(ic, txt, ck); b.onclick = () => { st.cwd = p.path; saveSettings(); refreshControls(); closeMenus(); };
      if (p.custom) { // elle eklenen klasör: listeden çıkarılabilir (diskteki klasöre dokunulmaz)
        const x = el('span', 'rm'); x.setAttribute('role', 'button'); x.title = t('project.remove'); x.innerHTML = ICON.x;
        x.onclick = async (ev) => { ev.stopPropagation(); try { await api('/api/folders/remove', { path: p.path }); await refreshConfig(); menu.hidden = true; openProjectMenu(); } catch { /* yoksay */ } };
        b.appendChild(x);
      }
      menu.appendChild(b);
    });
    const add = el('button', 'item add'); add.type = 'button';
    const ai = el('span', 'ico'); ai.innerHTML = ICON.plus; add.append(ai, el('span', 't', t('project.add')));
    add.onclick = (ev) => {
      ev.stopPropagation();
      const input = el('input', 'addin'); input.type = 'text'; input.spellcheck = false; input.placeholder = t('project.addPlaceholder');
      const err = el('div', 'adderr');
      const row = el('div', 'addrow'); row.append(input, err); add.replaceWith(row); input.focus();
      input.onkeydown = async (e2) => {
        if (e2.key === 'Escape') { e2.stopPropagation(); menu.hidden = true; return; }
        if (e2.key !== 'Enter' || !input.value.trim()) return;
        try {
          const r = await api('/api/folders', { path: input.value.trim() });
          await refreshConfig(); st.cwd = r.path; saveSettings(); refreshControls(); closeMenus();
        } catch (e3) { err.textContent = e3.info ? apiMsg(e3) : String(e3.message || e3); }
      };
    };
    menu.appendChild(add);
    menu.hidden = false; placeMenu(menu);
  }
  function toggleMode() { if (engineById(st.engine).write) { st.mode = st.mode === 'write' ? 'read' : 'write'; refreshControls(); } }

  // ---------- / komutları (adlar dile göre: /yeni veya /new) ----------
  const COMMANDS = [
    { id: 'model', run: () => openModelMenu() },
    { id: 'new', run: () => newChat() },
    { id: 'folder', run: () => openProjectMenu() },
    { id: 'write', run: () => toggleMode() },
    { id: 'history', run: () => toggleNav() },
    { id: 'copy', run: () => { const b = [...(chat ? chat.messages : [])].reverse().find((m) => m.r === 'b'); if (b) copyText(fullText(b)); } }
  ];
  const cmdName = (c) => t('slashName.' + c.id);
  let slashIdx = 0, slashList = [];
  function hideSlash() { $('#slashMenu').hidden = true; slashList = []; }
  function updateSlash() {
    const v = $('#prompt').value;
    if (!/^\/[^\s]*$/.test(v)) { hideSlash(); return; }
    slashList = COMMANDS.filter((c) => cmdName(c).startsWith(v.toLowerCase()));
    if (!slashList.length) { hideSlash(); return; }
    slashIdx = Math.min(slashIdx, slashList.length - 1);
    const menu = $('#slashMenu'); menu.replaceChildren();
    slashList.forEach((c, i) => {
      const b = el('button', 'item' + (i === slashIdx ? ' sel' : '')); b.type = 'button';
      b.append(el('span', 't', cmdName(c)), el('span', 's', t('slash.' + c.id))); b.onclick = () => runSlash(c); menu.appendChild(b);
    });
    $('#modelMenu').hidden = true; $('#projectMenu').hidden = true; menu.hidden = false; placeMenu(menu);
  }
  function runSlash(c) { $('#prompt').value = ''; autosize(); hideSlash(); c.run(); }

  // ---------- kenar çubuğu, tema, dil ----------
  const narrow = () => window.matchMedia('(max-width: 860px)').matches;
  function toggleNav() {
    const l = $('#layout');
    if (narrow()) l.classList.toggle('nav-open');
    else { l.classList.toggle('nav-closed'); lsSet('obs-nav', l.classList.contains('nav-closed') ? 'closed' : 'open'); }
  }
  function closeNavOnMobile() { $('#layout').classList.remove('nav-open'); }
  function refreshTheme() {
    const dark = ObsTheme.get() === 'dark';
    $('#themeIco').innerHTML = dark ? ICON.sun : ICON.moon;
    const label = dark ? t('theme.toLight') : t('theme.toDark');
    $('#themeBtn').title = label; $('#themeBtn').setAttribute('aria-label', label);
  }
  /** dil değişince arayüzün tamamı yeniden çevrilir */
  function applyLanguage() {
    I18N.applyDom(); document.title = t('app.title');
    $('#capsBtn').title = t('caps.btn'); $('#capsBtn').setAttribute('aria-label', t('caps.btn')); $('#langBtn').textContent = t('lang.switchTo'); $('#langBtn').title = t('lang.switchTitle');
    refreshControls(); refreshSend(); refreshTheme(); renderEngineStatus(); renderHistory(); closeMenus();
    if (!st.running) renderThread();
  }

  // kahve fincanı: yalnızca Claude sohbetinde görünür; duman = istem önbelleği (prompt cache) hâlâ sıcak
  const CUP_TTL = 60 * 60000;
  let cupFrame = 0;
  function refreshCup() {
    const cv = $('#cup');
    const lastBot = chat && [...chat.messages].reverse().find((m) => m.r === 'b');
    if (!lastBot || lastBot.engine !== 'claude') { cv.hidden = true; return; }
    const now = Date.now(), busy = !!st.running;
    const state = ObsCup.stateOf(chat.updated, now, CUP_TTL, busy);
    cv.hidden = false; ObsCup.draw(cv, state, cupFrame++);
    const left = Math.max(0, Math.ceil((chat.updated + CUP_TTL - now) / 1000));
    cv.title = busy || state === 'cold' ? '' : Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  }

  async function refreshConfig() { try { st.cfg = await api('/api/config'); renderEngineStatus(); } catch { /* sunucu yok */ } }

  async function init() {
    I18N.init();
    st.cfg = await api('/api/config');
    let saved = {}; try { saved = JSON.parse(lsGet('obs-web') || '{}'); } catch { /* yoksay */ }
    const e0 = st.cfg.engines.find((e) => e.id === saved.engine && e.installed && !e.limitedUntil) || st.cfg.engines.find((e) => e.installed && !e.limitedUntil) || st.cfg.engines[0];
    st.engine = e0.id;
    st.model = e0.models.some((m) => m.id === saved.model) ? saved.model : e0.models[0].id;
    st.effort = e0.efforts.includes(saved.effort) ? saved.effort : e0.efforts.includes('medium') ? 'medium' : e0.efforts[0] || '';
    st.cwd = st.cfg.projects.some((p) => p.path === saved.cwd) ? saved.cwd : st.cfg.defaultCwd;
    if (!narrow() && lsGet('obs-nav') === 'closed') $('#layout').classList.add('nav-closed');
    $('#capsIco').innerHTML = ICON.caps; $('#capsBtn').onclick = openCaps;
    $('#newIco').innerHTML = ICON.plus; $('#sideIco').innerHTML = ICON.panel;
    applyLanguage();
    I18N.on('languageChanged', applyLanguage);
    $('#send').onclick = send; $('#newChat').onclick = newChat;
    $('#sideToggle').onclick = toggleNav; $('#scrim').onclick = closeNavOnMobile;
    $('#langBtn').onclick = () => I18N.changeLanguage(I18N.language === 'tr' ? 'en' : 'tr');
    $('#themeBtn').onclick = () => { ObsTheme.set(ObsTheme.get() === 'dark' ? 'light' : 'dark'); refreshTheme(); };
    $('#jump').onclick = () => { scrollDown(true); $('#jump').hidden = true; };
    $('#modelBtn').onclick = (ev) => { ev.stopPropagation(); openModelMenu(); };
    $('#projectBtn').onclick = (ev) => { ev.stopPropagation(); openProjectMenu(); };
    $('#modeBtn').onclick = toggleMode;
    main().addEventListener('scroll', onScroll, { passive: true });
    $('#prompt').addEventListener('input', autosize);
    $('#prompt').addEventListener('keydown', (ev) => {
      if (slashList.length && !$('#slashMenu').hidden) {
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); slashIdx = (slashIdx + (ev.key === 'ArrowDown' ? 1 : slashList.length - 1)) % slashList.length; updateSlash(); return; }
        if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); runSlash(slashList[slashIdx]); return; }
      }
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); send(); }
    });
    document.addEventListener('click', (ev) => { if (!ev.target.closest('.menu')) closeMenus(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeMenus(); });
    window.addEventListener('resize', () => { ['#modelMenu', '#projectMenu', '#slashMenu'].forEach((s) => { if (!$(s).hidden) placeMenu($(s)); }); });
    setInterval(refreshConfig, 60000);
    setInterval(refreshCup, 250);
    connect(); $('#prompt').focus();
  }
  init().catch((err) => { const m = err && err.info ? apiMsg(err) : (err && err.message) || String(err); $('#foot').textContent = t('foot.startFailed', { msg: m }); });
})();
