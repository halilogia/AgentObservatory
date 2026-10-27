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
    think: svg('<path d="M8 2.5a4 4 0 00-2 7.4V11h4V9.9A4 4 0 008 2.5z"/><path d="M6.5 13.5h3"/>'),
    phone: svg('<rect x="5" y="1.8" width="6" height="12.4" rx="1.6"/><path d="M7.2 12.2h1.6"/>'),
    undo: svg('<path d="M6 3.5L3 6.5l3 3"/><path d="M3 6.5h6.5a3.5 3.5 0 010 7H6"/>'),
    check: svg('<path d="M3.5 8.5l3 3 6-7"/>'),
    folder: svg('<path d="M2 4.5A1.5 1.5 0 013.5 3h2.3l1.4 1.5h5.3A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5z"/>'),
    folderPlus: svg('<path d="M2 4.5A1.5 1.5 0 013.5 3h2.3l1.4 1.5h5.3A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5z"/><path d="M10 9.5h3M11.5 8v3"/>'),
    lock: svg('<rect x="3.5" y="7" width="9" height="6" rx="1.5"/><path d="M5.5 7V5.5a2.5 2.5 0 015 0V7"/>'),
    pen: svg('<path d="M3 13l.7-2.8L10.9 3a1.2 1.2 0 011.7 0l.4.4a1.2 1.2 0 010 1.7L5.8 12.3z"/>'),
    up: svg('<path d="M8 13V3M3.5 7.5L8 3l4.5 4.5"/>'),
    plus: svg('<path d="M8 3v10M3 8h10"/>'),
    paperclip: svg('<path d="M13.2 7.1l-6.4 6.4a3.5 3.5 0 01-5-5l6.4-6.4a2.4 2.4 0 013.4 3.4L5.2 11.9a1.2 1.2 0 01-1.7-1.7L9.2 4.5"/>'),
    panel: svg('<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6 3v10"/>'),
    x: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
    sun: svg('<circle cx="8" cy="8" r="2.8"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/>'),
    moon: svg('<path d="M13 9.6A5.4 5.4 0 016.4 3 5.4 5.4 0 108 13.4a5.4 5.4 0 005-3.8z"/>'),
    stop: '<svg viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor"/></svg>'
  };
  const st = { cfg: null, engine: 'claude', model: 'sonnet', effort: 'medium', mode: 'write', cwd: '', running: null, project: null };
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
  const saveSettings = () => lsSet('obs-web', JSON.stringify({ engine: st.engine, model: st.model, effort: st.effort, cwd: st.cwd, project: st.project }));

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

  function toolKind(name) {
    const n = String(name || '').toLowerCase();
    if (['edit', 'write', 'patch', 'multiedit', 'notebookedit'].includes(n)) return 'diff';
    if (['task', 'tasks', 'subtask'].includes(n)) return 'task';
    if (['bash', 'powershell', 'exec', 'command_execution', 'terminal'].includes(n)) return 'term';
    if (['read', 'glob', 'grep', 'dir', 'list'].includes(n)) return 'read';
    return 'generic';
  }

  function toolSummary(name, input) {
    const o = input && typeof input === 'object' ? input : {};
    const kind = toolKind(name);
    if (kind === 'term') {
      const cmd = o.command ?? o.CommandLine ?? o.cmd ?? '';
      return cmd ? '$ ' + String(cmd).replace(/\s+/g, ' ').slice(0, 140) : name;
    }
    if (kind === 'diff') {
      const fp = o.file_path ?? o.filePath ?? o.path ?? '';
      return fp ? '📄 ' + String(fp).split(/[\\/]/).pop() : name;
    }
    if (kind === 'task') {
      const title = o.title ?? o.description ?? o.prompt ?? '';
      return title ? '📋 ' + String(title).slice(0, 100) : name;
    }
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
  function smartTitle(raw) {
    if (!raw) return '';
    let text = String(raw).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    text = text.replace(/^[`#>*_\-\s]+/, '').trim();
    const noise = /^(lütfen\s+|bana\s+|acaba\s+|merhaba[,!\s]*|selam[,!\s]*|hey[,!\s]*|hi[,!\s]*|hello[,!\s]*|please\s+|can you\s+|could you\s+|how to\s+|yardımcı olur musun[,?\s]*)+/i;
    while (noise.test(text)) {
      text = text.replace(noise, '').trim();
    }
    if (text.length > 0) {
      text = text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1);
    }
    if (text.length > 48) {
      const cut = text.slice(0, 48);
      const lastSpace = cut.lastIndexOf(' ');
      text = (lastSpace > 18 ? cut.slice(0, lastSpace) : cut).trim() + '…';
    }
    return text || String(raw).slice(0, 48);
  }
  function ensureChat(firstText) {
    if (chat) return;
    chat = { id: ObsStore.newId(), title: smartTitle(firstText), created: Date.now(), updated: Date.now(), session: null, project: st.project || null, messages: [] };
  }
  function persist() { if (chat && chat.messages.length) { ObsStore.save(chat); renderHistory(); } }
  function when(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return t('time.now'); if (m < 60) return t('time.min', { n: m }); if (m < 1440) return t('time.hour', { n: Math.round(m / 60) });
    return new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  }
  // ---------- projeler: ad + klasör + talimatlar; sohbetler `chat.project` ile bağlanır ----------
  const pcol = () => { try { return new Set(JSON.parse(lsGet('obs-pcol') || '[]')); } catch { return new Set(); } };
  const savePcol = (s) => lsSet('obs-pcol', JSON.stringify([...s]));
  function renderCrumb() {
    const p = st.project ? ObsProjects.get(st.project) : null; if (st.project && !p) st.project = null;
    const c = $('#crumb'); c.hidden = !p; if (!p) return;
    const x = el('span', 'ico'); x.innerHTML = ICON.x;
    const label = el('span', 'crumb-content');
    label.innerHTML = '<span class="crumb-prefix">' + (I18N.language === 'tr' ? 'PROJE' : 'PROJECT') + '</span> ' + p.name;
    c.replaceChildren(label, x); c.title = t('proj.leave'); c.setAttribute('aria-label', t('proj.leave') + ': ' + p.name);
  }
  function selectProject(id) {
    if (st.running) { $('#foot').textContent = t('foot.busy'); return; }
    const p = ObsProjects.get(id); if (!p) return;
    st.project = id; ObsProjects.touch(id); if (p.cwd) st.cwd = p.cwd;
    saveSettings(); newChat(); refreshControls(); renderCrumb(); renderHistory(); closeNavOnMobile();
  }
  function leaveProject() {
    st.project = null;
    saveSettings();
    newChat();
    refreshControls();
    renderCrumb();
    renderHistory();
  }
  function openProjectDialog(p) {
    if (document.querySelector('.dlg')) return;
    const ov = el('div', 'dlg'); const box = el('div', 'dlgbox caps'); box.setAttribute('role', 'dialog');
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (ev) => { if (ev.key === 'Escape' && document.querySelectorAll('.dlg').length === 1) { ev.stopPropagation(); close(); } };

    if (!p) {
      // Kaynak klasörleri (Image 2 Mimarisi) - Doğrudan OS klasör seçimi
      const head = el('p', 'ctitle', t('proj.sourcesTitle'));
      const list = el('div', 'pcard-list');
      const paths = (st.cfg.projects || []).map((x) => x.path);

      if (paths.length) {
        paths.forEach((pt) => {
          const base = pt.split(/[\\/]/).filter(Boolean).pop() || pt;
          const card = el('div', 'pcard');
          const ico = el('span', 'pcard-ico'); ico.innerHTML = ICON.folder;
          const info = el('div', 'pcard-info');
          info.append(el('div', 'pcard-title', base), el('div', 'pcard-path', pt));
          const act = el('span', 'pcard-action', t('proj.addProject'));
          card.append(ico, info, act);
          card.onclick = () => {
            const r = ObsProjects.save({ id: ObsProjects.newId(), name: base, cwd: pt, instructions: '', created: Date.now(), touched: Date.now() });
            close();
            if (r) selectProject(r.id);
          };
          list.appendChild(card);
        });
      } else {
        list.appendChild(el('div', 'source-empty-hint', t('proj.noSources')));
      }

      // Kaynak klasörü ekleme kartı: "Bu bilgisayara klasör ekle ˅" + [📁+ Ekle]
      // Kaynak klasörü ekleme: sadece [📁+ Ekle] düğmesi
      const scard = el('div', 'source-card');
      const sbtn = el('button', 'btn-source-add');
      sbtn.type = 'button';
      const sico = el('span', 'ico'); sico.innerHTML = ICON.folderPlus;
      const slbl = el('span', '', t('proj.browse'));
      sbtn.append(sico, slbl);

      sbtn.onclick = async () => {
        sbtn.disabled = true;
        try {
          const r = await api('/api/folders/browse', {});
          if (r && r.path) {
            await refreshConfig();
            const pName = r.name || r.path.split(/[\\/]/).filter(Boolean).pop() || r.path;
            const saved = ObsProjects.save({ id: ObsProjects.newId(), name: pName, cwd: r.path, instructions: '', created: Date.now(), touched: Date.now() });
            close();
            if (saved) selectProject(saved.id);
          }
        } catch (err) {
          // yerel dialog kapandı
        } finally {
          sbtn.disabled = false;
        }
      };
      scard.appendChild(sbtn);

      const cancel = el('button', '', t('rewind.cancel'));
      cancel.type = 'button';
      cancel.onclick = close;

      box.append(head, list, scard, cancel);
      document.addEventListener('keydown', onKey, true);
      ov.onclick = (ev) => { if (ev.target === ov) close(); };
      ov.appendChild(box);
      document.body.appendChild(ov);
      return;
    }

    // Mevcut Projeyi Düzenleme (Ad ve Klasör - Talimat Angaryası Yok)
    const name = el('input', 'addin'); name.type = 'text'; name.maxLength = ObsProjects.NAME_MAX; name.placeholder = t('proj.namePh'); name.value = p.name;
    const folder = el('select', 'addin'); const paths = st.cfg.projects.map((x) => x.path); const cur = p.cwd || st.cwd;
    if (cur && !paths.includes(cur)) paths.unshift(cur);
    paths.forEach((pt) => { const o = el('option', '', pt.split(/[\\/]/).filter(Boolean).pop() || pt); o.value = pt; o.title = pt; o.selected = pt === cur; folder.appendChild(o); });
    const err = el('p', 'adderr', '');
    const save = el('button', 'primary', t('proj.save')); save.type = 'button';
    save.onclick = () => {
      const r = ObsProjects.save({ id: p.id, name: name.value, cwd: folder.value, instructions: p.instructions || '', created: p.created, touched: Date.now() });
      if (!r) { err.textContent = t('proj.nameNeeded'); name.focus(); return; }
      close();
      if (st.project === r.id && r.cwd) { st.cwd = r.cwd; saveSettings(); refreshControls(); }
      renderCrumb(); renderHistory();
    };
    const cancel = el('button', '', t('rewind.cancel')); cancel.type = 'button'; cancel.onclick = close;
    const del = el('button', '', t('proj.delete')); del.type = 'button';
    del.onclick = async () => {
      const c = await ask(t('proj.deleteAsk'), [t('proj.delete'), t('rewind.cancel')]); if (c !== 0) return;
      ObsProjects.remove(p.id); if (st.project === p.id) st.project = null; close(); saveSettings(); renderCrumb(); renderHistory();
    };
    box.append(el('p', 'ctitle', t('proj.edit')), el('div', 'hgroup', t('proj.namePh')), name, el('div', 'hgroup', t('proj.folder')), folder, err, save, del, cancel);
    document.addEventListener('keydown', onKey, true);
    ov.onclick = (ev) => { if (ev.target === ov) close(); };
    ov.appendChild(box);
    document.body.appendChild(ov);
    name.focus();
  }

  function chatRow(c, nested) {
    const item = el('div', 'hitem' + (nested ? ' nested' : '') + (chat && chat.id === c.id ? ' on' : ''));
    const title = c.title || t('history.untitled');
    const main1 = el('button', 'hmain'); main1.type = 'button'; main1.title = title;
    const lastBot = [...c.messages].reverse().find((m) => m.r === 'b');
    const dot = el('span', 'dot'); if (lastBot) dot.style.setProperty('--c', lastBot.color);
    const titleSpan = el('span', 't', title);
    main1.append(dot, titleSpan, el('span', 'when', when(c.updated)));
    main1.onclick = () => loadChat(c.id);

    function startRename(ev) {
      if (ev) ev.stopPropagation();
      if (item.classList.contains('renaming')) return;
      item.classList.add('renaming');
      const input = el('input', 'htitle-input');
      input.type = 'text';
      input.value = c.title || '';
      input.maxLength = 64;
      titleSpan.replaceWith(input);
      input.focus();
      input.select();

      let done = false;
      const finish = (save) => {
        if (done) return;
        done = true;
        const val = input.value.trim();
        if (save && val && val !== c.title) {
          c.title = val;
          if (chat && chat.id === c.id) chat.title = val;
          ObsStore.save(c);
        }
        renderHistory();
      };
      input.onkeydown = (ke) => {
        if (ke.key === 'Enter') { ke.preventDefault(); finish(true); }
        else if (ke.key === 'Escape') { ke.preventDefault(); finish(false); }
      };
      input.onblur = () => finish(true);
    }

    titleSpan.ondblclick = (ev) => { ev.stopPropagation(); startRename(ev); };

    const ren = el('button', 'ren'); ren.type = 'button'; ren.setAttribute('aria-label', t('history.rename')); ren.title = t('history.rename'); ren.innerHTML = ICON.pen;
    ren.onclick = (ev) => { ev.stopPropagation(); startRename(ev); };

    const del = el('button', 'del'); del.type = 'button'; del.setAttribute('aria-label', t('history.delete')); del.title = t('history.delete'); del.innerHTML = ICON.x;
    del.onclick = (ev) => { ev.stopPropagation(); ObsStore.remove(c.id); if (chat && chat.id === c.id) newChat(); else renderHistory(); };

    item.append(main1, ren, del);
    return item;
  }
  function renderHistory() {
    const box = $('#history'); box.replaceChildren();
    const list = ObsStore.list(); const projects = ObsProjects.list(); const collapsed = pcol();
    const head = el('div', 'hgroup phead'); head.appendChild(el('span', '', t('proj.title')));
    const add = el('button', 'padd'); add.type = 'button'; add.title = t('proj.add'); add.setAttribute('aria-label', t('proj.add')); add.innerHTML = ICON.plus; add.onclick = () => openProjectDialog(null);
    head.appendChild(add); box.appendChild(head);
    projects.forEach((p) => {
      const mine = list.filter((c) => c.project === p.id); const open = !collapsed.has(p.id);
      const row = el('div', 'hitem pitem' + (st.project === p.id ? ' on' : ''));
      const tog = el('button', 'ptog' + (open ? ' open' : '')); tog.type = 'button'; tog.setAttribute('aria-expanded', String(open)); tog.innerHTML = ICON.chev;
      tog.onclick = (ev) => { ev.stopPropagation(); if (open) collapsed.add(p.id); else collapsed.delete(p.id); savePcol(collapsed); renderHistory(); };
      const main1 = el('button', 'hmain'); main1.type = 'button'; main1.title = p.cwd;
      const ic = el('span', 'ico'); ic.innerHTML = ICON.folder; main1.append(ic, el('span', 't', p.name), el('span', 'when', String(mine.length)));
      main1.onclick = () => selectProject(p.id);
      const ed = el('button', 'del'); ed.type = 'button'; ed.title = t('proj.edit'); ed.setAttribute('aria-label', t('proj.edit')); ed.innerHTML = ICON.pen;
      ed.onclick = (ev) => { ev.stopPropagation(); openProjectDialog(p); };
      row.append(tog, main1, ed); box.appendChild(row);
      if (open) mine.forEach((c) => box.appendChild(chatRow(c, true)));
    });
    const free = list.filter((c) => !c.project || !projects.some((p) => p.id === c.project));
    renderTermSessions(box, list);
    if (!free.length) return;
    const day = (ts) => { const d = new Date(ts), n = new Date(); const diff = Math.floor((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5); return diff <= 0 ? t('history.today') : diff === 1 ? t('history.yesterday') : t('history.older'); };
    let last = '';
    free.forEach((c) => {
      const g = day(c.updated); if (g !== last) { box.appendChild(el('div', 'hgroup', g)); last = g; }
      box.appendChild(chatRow(c, false));
    });
  }
  // ---------- terminal (TUI) oturumları: veritabanından okunur; web'in kendi sohbetleri (localStorage) ayıklanır ----------
  let termSessions = [];
  async function refreshTermSessions() {
    try { termSessions = await api('/api/sessions'); renderHistory(); } catch { /* sunucu yok */ }
  }
  let termTimer = 0;
  function scheduleTermRefresh() { if (!termTimer) termTimer = setTimeout(() => { termTimer = 0; refreshTermSessions(); }, 3000); }
  function renderTermSessions(box, localChats) {
    const known = new Set(localChats.map((c) => c.session && c.session.id).filter(Boolean));
    const list = termSessions.filter((s) => !known.has(s.id));
    if (!list.length) return;
    box.appendChild(el('div', 'hgroup', t('term.title')));
    list.slice(0, 30).forEach((s) => {
      const item = el('div', 'hitem' + (chat && chat.termId === s.id ? ' on' : ''));
      const b = el('button', 'hmain'); b.type = 'button'; b.title = s.title;
      const dot = el('span', 'dot'); const e = engineById(s.agent); dot.style.setProperty('--c', e ? e.color : 'var(--faint)');
      b.append(dot, el('span', 't', smartTitle(s.title) || t('history.untitled')), el('span', 'when', s.running ? t('term.live') : when(s.end)));
      b.onclick = () => loadTermSession(s);
      item.appendChild(b); box.appendChild(item);
    });
  }
  async function loadTermSession(s) {
    if (st.running) { $('#foot').textContent = t('foot.busy'); return; }
    setOfficeView(false);
    let data;
    try { data = await api('/api/session?id=' + encodeURIComponent(s.id)); } catch (err) { $('#foot').textContent = err.info ? apiMsg(err) : err.message; return; }
    const colorOf = (a) => { const e = engineById(a); return e ? e.color : '#888'; };
    const messages = ObsSessions.toChat(data, { toolKind, toolSummary, color: colorOf });
    chat = { id: ObsStore.newId(), termId: s.id, title: smartTitle(s.title), created: s.start, updated: Date.now(), session: { id: s.id, engine: s.agent, cwd: '' }, project: null, messages };
    renderThread(); renderHistory(); closeNavOnMobile(); scrollDown(true); onScroll();
  }
  function clearThread() { $('#thread').replaceChildren(); views.clear(); }
  function showThread(has) {
    $('#empty').hidden = has;
    if (!has) {
      const p = st.project ? ObsProjects.get(st.project) : null;
      const emptyBox = $('#empty');
      if (emptyBox) {
        if (p) {
          emptyBox.innerHTML = '<div class="empty-project-pill"><span>' + (I18N.language === 'tr' ? 'Çalışma Alanı' : 'Workspace') + '</span></div>' +
            '<h1 class="empty-project-name">' + p.name + '</h1>' +
            '<p class="empty-project-path">' + p.cwd + '</p>';
        } else {
          emptyBox.innerHTML = '<h1 data-i18n="empty.title">' + t('empty.title') + '</h1>';
        }
      }
    }
  }
  function renderThread() {
    clearThread();
    if (!chat || !chat.messages.length) { showThread(false); return; }
    showThread(true);
    chat.messages.forEach((m, i) => { if (m.r === 'u') addUserDom(m.text, i); else createBot(m, false); });
  }
  // ---------- Ajan Operasyon Çekmecesi (hafif; 3D yok) ----------
  const DRAWER_AGENTS = [
    { id: 'agy', dot: '🔵', name: 'Antigravity', role: 'Sistem Mimarisi & Koordinasyon' },
    { id: 'claude', dot: '🟠', name: 'Claude Code', role: 'Ağır Kodlama, Test & Refactor' },
    { id: 'codex', dot: '🔴', name: 'Codex CLI', role: 'Statik Güvenlik & Red-Team Denetimi' },
    { id: 'opencode', dot: '⚫', name: 'OpenCode', role: 'Toplu Veri Motoru & ETL' }
  ];
  let officeActive = false;
  let office = null;
  function officeSim() { // tuval yalnızca bir kez bağlanır; olaylar panel kapalıyken de durumu günceller
    if (office || !window.ObsOffice) return office;
    const cv = $('#officeCanvas'); if (!cv) return null;
    office = ObsOffice.mount(cv, (id) => {
      const idx = DRAWER_AGENTS.findIndex((a) => a.id === id);
      const cards = $('#agentCards') ? $('#agentCards').children : [];
      Array.prototype.forEach.call(cards, (c, i) => c.classList.toggle('pick', i === idx));
      if (cards[idx]) cards[idx].scrollIntoView({ block: 'nearest' });
    });
    return office;
  }
  let drawerTimer = 0;
  function agentInfo(id, chats) {
    let last = null; let tin = 0; let tout = 0; let active = false;
    chats.forEach((c) => c.messages.forEach((m) => {
      if (m.r !== 'b' || m.engine !== id) return;
      if (m.meta) { tin += m.meta.tin || 0; tout += m.meta.tout || 0; }
      if (!last || c.updated >= last.at) last = { at: c.updated, m };
    }));
    views.forEach((v) => { if (!v.done && v.rec.engine === id) { active = true; tin += v.tin || 0; tout += v.tout || 0; } });
    let task = '—'; let cwd = '—'; let status = 'idle';
    if (last) {
      const m = last.m;
      const tools = (m.parts || []).filter((p) => p.k === 'tool');
      const tl = tools[tools.length - 1];
      task = tl ? (tl.name + ' ' + (tl.summary || '')).trim() : (m.prompt || '—');
      cwd = m.cwd || '—';
      if (m.notice && !m.notice.warn && m.notice.key !== 'notice.cancelled') status = 'failed';
    }
    if (active) status = 'active';
    return { task: String(task).slice(0, 120), cwd, status, tin, tout };
  }
  function renderDrawer() {
    const box = $('#agentCards'); if (!box) return;
    const chats = ObsStore.list();
    box.textContent = '';
    DRAWER_AGENTS.forEach((a) => {
      const i = agentInfo(a.id, chats);
      const label = i.status === 'active' ? '🟢 Aktif' : i.status === 'failed' ? '🔴 Hatalı' : '⚪ Beklemede';
      const card = el('div', 'agent-card ' + i.status);
      card.appendChild(el('div', 'agent-head', a.dot + ' ' + a.name));
      card.appendChild(el('div', 'agent-role', a.role));
      [['Durum', label], ['Son Görev / Eylem', i.task], ['Hedef Proje / Repo', i.cwd], ['Token', fmtTok(i.tin) + ' giriş · ' + fmtTok(i.tout) + ' çıkış']].forEach(([k, v]) => {
        const row = el('div', 'agent-row'); row.appendChild(el('span', 'agent-k', k)); row.appendChild(el('span', 'agent-v', v)); card.appendChild(row);
      });
      box.appendChild(card);
    });
  }
  function scheduleDrawer() { // SSE olaylarında en çok ~4 yenileme/sn
    if (!officeActive || drawerTimer) return;
    drawerTimer = setTimeout(() => { drawerTimer = 0; if (officeActive) renderDrawer(); }, 250);
  }
  function setOfficeView(show) {
    officeActive = !!show;
    const drawer = $('#officeView'); const scrim = $('#drawerScrim'); const btn = $('#officeBtn');
    if (officeActive) renderDrawer();
    const sim = officeSim(); if (sim) { if (officeActive) sim.start(); else sim.stop(); }
    if (drawer) { drawer.classList.toggle('open', officeActive); drawer.setAttribute('aria-hidden', officeActive ? 'false' : 'true'); }
    if (scrim) scrim.hidden = !officeActive;
    if (btn) btn.classList.toggle('on', officeActive);
  }
  function toggleOfficeView() {
    setOfficeView(!officeActive);
  }
  function newChat() {
    if (st.running) return;
    setOfficeView(false);
    chat = null; clearThread(); showThread(false); renderHistory(); $('#prompt').focus(); stick = true; onScroll();
  }
  function loadChat(id) {
    if (st.running) { $('#foot').textContent = t('foot.busy'); return; }
    setOfficeView(false);
    const c = ObsStore.get(id); if (!c) return;
    chat = c; renderThread();
    st.project = c.project && ObsProjects.get(c.project) ? c.project : null; renderCrumb();
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
  /** Telefondan erişim: QR kod ile tek tıkla eşleşme (Sıfır terminal komutu, sıfır elle kod girme) */
  async function openPhone() {
    if (document.querySelector('.dlg')) return;
    let s; try { s = await api('/api/remote'); } catch (err) { $('#foot').textContent = err.info ? apiMsg(err) : err.message; return; }

    // Remote kapalıysa otomatik aç ve eşleştirme kodu üret
    let pairData = null;
    try {
      if (!s.enabled) { await api('/api/remote', { enabled: true }); s = await api('/api/remote'); }
      pairData = await api('/api/pair/new', {});
      s = await api('/api/remote');
    } catch (err) {
      console.debug('Otomatik remote başlatma hatası:', err);
    }

    const ov = el('div', 'dlg'); const box = el('div', 'dlgbox phone-box'); box.setAttribute('role', 'dialog');
    const body = el('div', 'pbody');
    let pollTimer = setInterval(async () => {
      try {
        const fresh = await api('/api/remote');
        if (fresh.devices.length !== s.devices.length) {
          s = fresh;
          paint();
        }
      } catch (err) {
        console.debug('Uzak cihaz durum sorgusu hatası:', err);
      }
    }, 2000);

    const close = () => { clearInterval(pollTimer); ov.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (ev) => { if (ev.key === 'Escape' && document.querySelectorAll('.dlg').length === 1) { ev.stopPropagation(); close(); } };

    function paint() {
      body.replaceChildren();

      // Açıklama
      body.appendChild(el('p', 'cdesc', t('phone.qrHint')));

      // QR Kod
      const targetUrl = pairData ? pairData.url : (s.url || `http://${s.localIp || '127.0.0.1'}:8788/pair`);
      const qrWrap = el('div', 'pqr-wrap');
      if (typeof window.renderQrSvg === 'function' && targetUrl) {
        const qrEl = el('div', 'pqr-svg');
        qrEl.innerHTML = window.renderQrSvg(targetUrl, 2);
        qrWrap.appendChild(qrEl);
      }
      body.appendChild(qrWrap);

      // Kopyalanabilir doğrudan link
      if (targetUrl) {
        const linkRow = el('div', 'plink-row');
        const linkCode = el('code', 'plink-text', targetUrl);
        const copyB = el('button', 'pcopy-btn', t('phone.copy'));
        copyB.type = 'button';
        copyB.onclick = async () => {
          try {
            await navigator.clipboard.writeText(targetUrl);
            copyB.textContent = t('common.copied');
            setTimeout(() => { copyB.textContent = t('phone.copy'); }, 1500);
          } catch (err) {
            console.warn('Pano kopyalama hatası:', err);
          }
        };
        linkRow.append(linkCode, copyB);
        body.appendChild(linkRow);
      }

      // Canlı Durum Rozeti
      const statusRow = el('div', 'pstatus-row');
      if (s.devices.length > 0) {
        statusRow.innerHTML = '<span class="pdot green"></span><span>' + t('phone.connected', { count: s.devices.length }) + '</span>';
      } else {
        statusRow.innerHTML = '<span class="pdot pulse"></span><span>' + t('phone.waiting') + '</span>';
      }
      body.appendChild(statusRow);

      // Eşleşmiş Cihazlar Listesi
      if (s.devices.length > 0) {
        const devHead = el('div', 'hgroup', t('phone.devices') + ' (' + s.devices.length + ')');
        body.appendChild(devHead);
        s.devices.forEach((d) => {
          const row = el('div', 'crow drow');
          const info = el('div', '');
          info.append(el('div', 'cname', d.name), el('div', 'cdesc', t('phone.last', { when: d.lastSeen ? when(d.lastSeen) : '-' })));
          const wr = el('button', d.write ? 'on' : '', t('phone.write') + ': ' + (d.write ? t('phone.on') : t('phone.off')));
          wr.type = 'button';
          wr.onclick = async () => { await api('/api/devices/write', { id: d.id, write: !d.write }); s = await api('/api/remote'); paint(); };
          const rm = el('button', 'del', t('phone.remove'));
          rm.type = 'button';
          rm.onclick = async () => { await api('/api/devices/remove', { id: d.id }); s = await api('/api/remote'); paint(); };
          row.append(info, wr, rm);
          body.appendChild(row);
        });
      }
    }

    const x = el('button', '', t('caps.close')); x.type = 'button'; x.onclick = close;
    ov.onclick = (ev) => { if (ev.target === ov) close(); };
    box.append(el('p', 'ctitle', t('phone.title')), body, x);
    document.addEventListener('keydown', onKey, true);
    ov.appendChild(box);
    document.body.appendChild(ov);
    paint();
  }
  /** sohbeti seçilen kullanıcı mesajından önceki haline geri sarar; Yazabilir kipinde değişen dosyalar da geri alınabilir */
  async function rewind(i) {
    if (st.running || !chat) return;
    const removed = chat.messages.slice(i);
    const snapRec = st.cfg.remote ? undefined : removed.find((m) => m.r === 'b' && m.snap); // dosya geri alma yalnızca yerel sayfada
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
    const v = { rec, row, content, meta, dots, curText: null, tools: new Map(), lastTool: null, raf: 0, tin: 0, tout: 0, t0: Date.now(), done: !live, steps: [] };
    if (live) { runView = v; renderRunCard(); }
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
  function renderToolOutput(det, part) {
    const out = part.out || '';
    if (!out.trim()) return;
    const kind = part.kind || toolKind(part.name);
    if (kind === 'diff') {
      const box = el('div', 'tool-diff');
      const lines = out.split('\n').slice(0, 60);
      lines.forEach((line) => {
        let cls = 'diff-line';
        if (line.startsWith('+') && !line.startsWith('+++')) cls += ' diff-add';
        else if (line.startsWith('-') && !line.startsWith('---')) cls += ' diff-del';
        box.appendChild(el('div', cls, line));
      });
      det.appendChild(box);
      return;
    }
    const pre = el('pre');
    pre.appendChild(el('code', '', out));
    det.appendChild(pre);
  }
  function buildTool(v, part, withOut) {
    const det = el('details', 'tool' + (part.kind ? ' tool-' + part.kind : ''));
    const sum = el('summary');
    sum.append(el('span', 'tn', part.name), el('span', 'ts', part.summary || ''));
    det.appendChild(sum);
    v.content.appendChild(det);
    if (withOut && part.out) {
      renderToolOutput(det, part);
    }
    return det;
  }
  function addTool(v, d) {
    v.curText = null;
    const kind = toolKind(d.name);
    const part = { k: 'tool', name: d.name || 'tool', kind, summary: toolSummary(d.name, d.input), out: '', input: d.input };
    v.rec.parts.push(part);
    const step = { kind, name: d.name || 'tool', summary: part.summary, t0: Date.now(), t1: 0, out: '' };
    v.steps.push(step);
    const rec = { part, step, det: buildTool(v, part, false), done: false };
    v.tools.set(d.id || 'n' + v.tools.size, rec);
    v.lastTool = rec;
    renderRunCard();
    scrollDown();
  }
  function toolDone(v, d) {
    const rec = (d.toolUseId && v.tools.get(d.toolUseId)) || v.lastTool;
    if (!rec || rec.done) return;
    rec.done = true;
    const out = String(d.output ?? d.result ?? '').split('\n').slice(0, 60).join('\n').slice(0, 6000);
    rec.part.out = out;
    rec.step.t1 = Date.now(); rec.step.out = out;
    renderToolOutput(rec.det, rec.part);
    renderRunCard();
  }
  function addApproval(v, d) {
    if (!v.approvals) v.approvals = new Map();
    const key = d.id || d.tool || 'perm';
    if (v.approvals.has(key)) return;

    v.curText = null;
    const card = el('div', 'perm-card');
    const head = el('div', 'perm-head');
    const badge = el('span', 'perm-badge', t('perm.request'));
    const tool = el('span', 'perm-tool', d.tool || 'Bash');
    head.append(badge, tool);

    const descText = d.summary || d.command || d.description || toolSummary(d.tool, d.input);
    const body = el('div', 'perm-body');
    const code = el('code', 'perm-code', descText);
    body.appendChild(code);

    const actions = el('div', 'perm-actions');
    const btnApprove = el('button', 'perm-btn approve', t('perm.approve'));
    btnApprove.type = 'button';
    const btnReject = el('button', 'perm-btn reject', t('perm.reject'));
    btnReject.type = 'button';
    const status = el('span', 'perm-status');

    let settled = false;
    async function resolve(approved) {
      if (settled) return;
      settled = true;
      btnApprove.disabled = true;
      btnReject.disabled = true;
      try {
        await api('/api/approve', { taskId: v.rec.taskId, approved });
        markSettled(approved);
      } catch (err) {
        settled = false;
        btnApprove.disabled = false;
        btnReject.disabled = false;
      }
    }

    function markSettled(approved) {
      settled = true;
      btnApprove.remove();
      btnReject.remove();
      status.className = 'perm-status ' + (approved ? 'approved' : 'rejected');
      status.textContent = approved ? t('perm.approved') : t('perm.rejected');
    }

    btnApprove.onclick = () => resolve(true);
    btnReject.onclick = () => resolve(false);

    actions.append(btnApprove, btnReject, status);
    card.append(head, body, actions);
    v.content.appendChild(card);
    v.approvals.set(key, { card, markSettled });
    scrollDown();
  }
  function onApprovalResolved(v, d) {
    if (!v.approvals) return;
    const key = d.id || d.tool;
    const entry = (key && v.approvals.get(key)) || Array.from(v.approvals.values()).pop();
    if (entry) entry.markSettled(!!d.approved);
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
    v.steps.forEach((s) => { if (!s.t1) s.t1 = Date.now(); });
    if (runView === v) { runView = null; renderRunCard(); }
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

  // ---------- çalışma durum kartı (kapalı: tek satır; açık: adımlar + komut çıktısı) ----------
  let runView = null, runTimer = 0;
  const rcDetail = () => { try { return localStorage.getItem('obs.runDetail') === '1'; } catch { return false; } };
  const rcSetDetail = (on) => { try { localStorage.setItem('obs.runDetail', on ? '1' : '0'); } catch { /* depolama kapalı */ } };
  const RC_GLYPH = { term: '$', diff: '~', read: '·', task: '>', generic: '•' };
  function rcLabel(v) {
    const tr = ObsRunCard.trailing(v.steps);
    if (!tr.kind) return t('rc.start');
    return tr.kind === 'read' ? t('rc.read', { count: tr.count }) : t('rc.' + tr.kind);
  }
  function renderRunCard() {
    const box = $('#runCard'); const v = runView;
    if (!v || v.done) { box.hidden = true; box.replaceChildren(); if (runTimer) { clearInterval(runTimer); runTimer = 0; } return; }
    if (!runTimer) runTimer = setInterval(renderRunCard, 1000);
    const detail = rcDetail(); const now = Date.now();
    box.hidden = false; box.style.setProperty('--c', v.rec.color); box.classList.toggle('open', detail);
    const head = el('button', 'rc-head'); head.type = 'button'; head.title = t('rc.toggle'); head.setAttribute('aria-expanded', String(detail));
    const chev = el('span', 'ico chev'); chev.innerHTML = ICON.chev;
    head.append(el('span', 'rc-spin'), el('span', 'rc-label', rcLabel(v)), el('span', 'rc-time', ObsRunCard.clock(now - v.t0)), chev);
    head.onclick = () => { rcSetDetail(!rcDetail()); renderRunCard(); };
    const kids = [head];
    if (detail) {
      const body = el('div', 'rc-body');
      body.appendChild(el('div', 'rc-meta', `${engineLabel(v.rec)} · ${v.rec.label}` + (v.steps.length ? ' · ' + t('rc.step', { n: v.steps.length }) : '')));
      const seg = el('div', 'rc-seg'); ObsRunCard.segments(v.steps, 24).forEach((s) => seg.appendChild(el('i', s))); body.appendChild(seg);
      const list = el('div', 'rc-list');
      v.steps.slice(-8).forEach((s) => {
        const row = el('div', 'rc-step' + (s.t1 ? '' : ' run'));
        row.append(el('span', 'rc-ico', RC_GLYPH[s.kind] || '•'), el('span', 'rc-sum', s.summary || s.name), el('span', 'rc-dur', ObsRunCard.dur((s.t1 || now) - s.t0)));
        list.appendChild(row);
        if (s.kind === 'term' && s.out) {
          const o = ObsRunCard.outLines(s.out, 3); const pre = el('div', 'rc-out');
          o.lines.forEach((l) => pre.appendChild(el('div', '', l)));
          if (o.more) pre.appendChild(el('div', 'rc-more', t('rc.more', { n: o.more })));
          list.appendChild(pre);
        }
      });
      body.appendChild(list);
      const stop = el('button', 'rc-stop', t('rc.stop')); stop.type = 'button'; stop.disabled = st.running === 'pending'; stop.onclick = send;
      body.appendChild(stop);
      kids.push(body);
    }
    box.replaceChildren(...kids);
  }

  // ---------- olay akışı ----------
  function onEvent(ev) {
    const sim = officeSim(); if (sim) sim.feed(ev);
    scheduleDrawer();
    const v = views.get(ev.taskId);
    if (!v) { early.push(ev); if (early.length > 600) early = early.slice(-300); if (ev.type === 'task.started' || ev.type === 'task.completed') scheduleTermRefresh(); return; }
    if (ev.sessionId && !v.done && chat) chat.session = { id: ev.sessionId, engine: v.rec.engine, cwd: v.rec.cwd };
    const d = ev.data || {};
    if (ev.type === 'message.delta') addText(v, String(d.text || ''));
    else if (ev.type === 'tool.invoked') addTool(v, d);
    else if (ev.type === 'tool.completed') toolDone(v, d);
    else if (ev.type === 'permission.requested') addApproval(v, d);
    else if (ev.type === 'permission.resolved') onApprovalResolved(v, d);
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
    const proj = chat.project ? ObsProjects.get(chat.project) : null; // proje talimatları her YENİ CLI oturumunun başında verilir
    const sendText = resume ? text : ObsCtx.build(chat.messages, text, { instructions: proj && proj.instructions }) || text;
    if (o.bubble !== false) { chat.messages.push({ r: 'u', text }); addUserDom(text); }
    const rec = { r: 'b', engine: e.id, model: m.id, label: m.label, color: e.color, parts: [], notice: null, meta: null, prompt: text, cwd: st.cwd, taskId: null, effort: e.efforts.length ? st.effort : '' };
    chat.messages.push(rec);
    const view = createBot(rec, true);
    st.running = 'pending'; stick = true; refreshSend(); persist();
    try {
      if (canWrite(e) && st.mode === 'write' && !st.cfg.remote) { // dosya geri alma için: görev başlamadan önce klasörün anlık görüntüsü (git deposu değilse yok)
        try { rec.snap = (await api('/api/snapshot', { cwd: st.cwd })).snap || null; rec.snapCwd = st.cwd; } catch { rec.snap = null; }
      }
      const r = await api('/api/run', { engine: e.id, model: m.id, effort: e.efforts.length ? st.effort : undefined, prompt: sendText, mode: canWrite(e) ? st.mode : 'read', cwd: st.cwd, sessionId: resume });
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
    setOfficeView(false);
    if (st.running) { const id = st.running; if (id !== 'pending') { try { await api('/api/cancel', { taskId: id }); } catch { /* bitmiş olabilir */ } } return; }
    const box = $('#prompt'); const text = box.value.trim();
    if (!text) return;
    box.value = ''; autosize(); hideSlash();
    runPrompt(text);
  }

  // ---------- kontroller ----------
  function autosize() { const b = $('#prompt'); b.style.height = 'auto'; b.style.height = Math.min(b.scrollHeight, 220) + 'px'; refreshSend(); updateSlash(); }
  function refreshSend() {
    const b = $('#send'); const running = !!st.running; $('#think').classList.toggle('run', running);
    b.innerHTML = running ? ICON.stop : ICON.up;
    b.setAttribute('aria-label', running ? t('composer.stop') : t('composer.send'));
    b.disabled = running ? st.running === 'pending' : !$('#prompt').value.trim();
    $('#newChat').disabled = running;
  }
  // normal mod: motor destekliyorsa yazabilir; yapay cihaz izin kısıtlaması yok
  const canWrite = (e) => e.write;
  const shortModel = (m) => m.label.replace(/^Claude /, '');
  const effortLabel = (x) => t('effort.' + x);
  // düşünme çabası: modern yatay hassas kaydırıcı (precision slider), glowing knob, adım noktaları ve çaba etiketi
  function renderThink() {
    const e = engineById(st.engine); const box = $('#think');
    box.hidden = !e.efforts.length; if (!e.efforts.length) return;
    box.style.setProperty('--c', e.color);
    box.tabIndex = 0;
    box.setAttribute('role', 'slider');
    box.setAttribute('aria-label', t('effort.title'));
    box.setAttribute('aria-valuemin', '0');
    box.setAttribute('aria-valuemax', String(e.efforts.length - 1));

    if (box.dataset.engine !== e.id) {
      box.replaceChildren();
      box.dataset.engine = e.id;

      const ico = el('span', 'tb-ico');
      ico.innerHTML = ICON.think;
      box.appendChild(ico);

      const slider = el('div', 'tb-slider');
      const rail = el('div', 'tb-rail');
      const fill = el('div', 'tb-fill');
      rail.appendChild(fill);

      const pips = el('div', 'tb-pips');
      e.efforts.forEach((x, i) => {
        const pip = el('span', 'tb-pip');
        const pct = e.efforts.length > 1 ? (i / (e.efforts.length - 1)) * 100 : 0;
        pip.style.left = pct + '%';
        pips.appendChild(pip);
      });
      rail.appendChild(pips);

      const knob = el('div', 'tb-knob');
      rail.appendChild(knob);
      slider.appendChild(rail);
      box.appendChild(slider);

      const badge = el('span', 'tb-badge');
      box.appendChild(badge);
    }

    const idx = Math.max(0, e.efforts.indexOf(st.effort));
    const total = e.efforts.length;
    const pct = total > 1 ? (idx / (total - 1)) * 100 : 0;

    box.setAttribute('aria-valuenow', String(idx));
    box.setAttribute('aria-valuetext', effortLabel(st.effort));
    box.title = t('effort.title') + ': ' + effortLabel(st.effort);

    const fill = box.querySelector('.tb-fill');
    if (fill) fill.style.width = pct + '%';

    const knob = box.querySelector('.tb-knob');
    if (knob) knob.style.left = pct + '%';

    box.querySelectorAll('.tb-pip').forEach((pip, i) => {
      pip.classList.toggle('active', i <= idx);
      pip.classList.toggle('current', i === idx);
    });

    const badge = box.querySelector('.tb-badge');
    if (badge) badge.textContent = effortLabel(st.effort);

    box.classList.toggle('run', !!st.running);
  }
  let scrubbingThink = false;
  let cachedSliderRect = null;

  function calculateEffortIndex(ratio, currentIdx, total) {
    if (total <= 1) return 0;
    const raw = ratio * (total - 1);
    const candidate = Math.round(raw);
    if (currentIdx >= 0 && currentIdx < total && candidate !== currentIdx) {
      const boundary = (currentIdx + candidate) / 2;
      // histerezis eşiği: kaydırırken adımlar arasında gidip gelmeyi (salınım / jitter) önler
      if (Math.abs(raw - boundary) < 0.14) {
        return currentIdx;
      }
    }
    return Math.min(total - 1, Math.max(0, candidate));
  }

  function scrubEffort(clientX, isInitial = false) {
    const e = engineById(st.engine);
    if (!e || !e.efforts.length) return;
    const box = $('#think');
    const slider = box.querySelector('.tb-slider') || box;
    const rect = cachedSliderRect || slider.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const clampedX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const ratio = clampedX / rect.width;
    const total = e.efforts.length;
    const curIdx = Math.max(0, e.efforts.indexOf(st.effort));
    const idx = isInitial
      ? Math.min(total - 1, Math.max(0, Math.round(ratio * (total - 1))))
      : calculateEffortIndex(ratio, curIdx, total);
    const targetEffort = e.efforts[idx];
    if (st.effort !== targetEffort) {
      st.effort = targetEffort;
      saveSettings();
      renderThink();
    }
  }

  function initThinkScrub() {
    const box = $('#think');
    box.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      const e = engineById(st.engine);
      if (!e || !e.efforts.length) return;
      scrubbingThink = true;
      box.classList.add('scrubbing');
      const slider = box.querySelector('.tb-slider') || box;
      cachedSliderRect = slider.getBoundingClientRect();
      try { box.setPointerCapture(ev.pointerId); } catch {}
      scrubEffort(ev.clientX, true);
    });
    box.addEventListener('pointermove', (ev) => {
      if (!scrubbingThink) return;
      scrubEffort(ev.clientX, false);
    });
    const stopScrub = (ev) => {
      if (!scrubbingThink) return;
      scrubbingThink = false;
      cachedSliderRect = null;
      box.classList.remove('scrubbing');
      try { box.releasePointerCapture(ev.pointerId); } catch {}
      saveSettings();
    };
    box.addEventListener('pointerup', stopScrub);
    box.addEventListener('pointercancel', stopScrub);
    box.addEventListener('wheel', (ev) => {
      const e = engineById(st.engine);
      if (!e || !e.efforts.length) return;
      ev.preventDefault();
      const dir = ev.deltaY < 0 ? 1 : -1;
      const curIdx = Math.max(0, e.efforts.indexOf(st.effort));
      const nextIdx = Math.min(e.efforts.length - 1, Math.max(0, curIdx + dir));
      if (nextIdx !== curIdx) {
        st.effort = e.efforts[nextIdx];
        saveSettings();
        refreshControls();
      }
    }, { passive: false });
  }
  function thinkKey(ev) {
    const e = engineById(st.engine); const d = ev.key === 'ArrowRight' || ev.key === 'ArrowUp' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowDown' ? -1 : 0;
    if (!d) return; ev.preventDefault();
    const cur = e.efforts.indexOf(st.effort);
    const i = Math.min(e.efforts.length - 1, Math.max(0, (cur >= 0 ? cur : 0) + d));
    st.effort = e.efforts[i]; saveSettings(); refreshControls(); $('#think').focus();
  }
  function refreshControls() {
    const e = engineById(st.engine); const m = e.models.find((x) => x.id === st.model);
    $('#modelDot').style.setProperty('--c', e.color);
    $('#modelLabel').textContent = shortModel(m);
    // düşünme çabası kendi düğmesinde; çabası olmayan motorda (OpenCode) düğme gizlenir
    renderThink();
    $('#attachIco').innerHTML = ICON.plus;
    $('#attachFilesIco').innerHTML = ICON.paperclip;
    $('#attachFolderIco').innerHTML = ICON.folder;
    document.querySelectorAll('.chev').forEach((c) => { c.innerHTML = ICON.chev; });
    const mb = $('#modeBtn'); const cw = canWrite(e); const write = st.mode === 'write' && cw;
    mb.disabled = !cw; mb.classList.toggle('on', write);
    $('#modeIco').innerHTML = write ? ICON.pen : ICON.lock;
    $('#modeLabel').textContent = write ? t('mode.write') : t('mode.read');
    mb.title = !e.write ? t('mode.noWrite', { engine: e.label }) : !cw ? t('remote.noWrite') : write ? t('mode.writeTitle') : t('mode.readTitle');
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
  function openAttachMenu() {
    const m = $('#attachMenu');
    if (!m.hidden) { m.hidden = true; return; }
    closeMenus();
    m.hidden = false;
    placeMenu(m);
  }
  function closeMenus() { $('#modelMenu').hidden = true; $('#projectMenu').hidden = true; $('#attachMenu').hidden = true; hideSlash(); }
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
    menu.hidden = false; placeMenu(menu); menu.scrollTop = keepScroll;
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
    if (st.cfg.remote) { menu.hidden = false; placeMenu(menu); return; } // klasör ekleme yalnızca yerel sayfada
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
  function toggleMode() { if (canWrite(engineById(st.engine))) { st.mode = st.mode === 'write' ? 'read' : 'write'; refreshControls(); } }

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
    $('#phoneBtn').title = t('phone.btn'); $('#phoneBtn').setAttribute('aria-label', t('phone.btn'));
    $('#capsBtn').title = t('caps.btn'); $('#capsBtn').setAttribute('aria-label', t('caps.btn')); $('#langBtn').textContent = t('lang.switchTo'); $('#langBtn').title = t('lang.switchTitle');
    refreshControls(); refreshSend(); refreshTheme(); renderEngineStatus(); renderCrumb(); renderHistory(); closeMenus();
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
    st.project = saved.project && ObsProjects.get(saved.project) ? saved.project : null;
    const activeProj = st.project ? ObsProjects.get(st.project) : null;
    st.cwd = activeProj && activeProj.cwd ? activeProj.cwd : (st.cfg.projects.some((p) => p.path === saved.cwd) ? saved.cwd : '');
    if (!narrow() && lsGet('obs-nav') === 'closed') $('#layout').classList.add('nav-closed');
    $('#capsIco').innerHTML = ICON.caps; $('#capsBtn').onclick = openCaps;
    $('#phoneIco').innerHTML = ICON.phone; $('#phoneBtn').onclick = openPhone; $('#phoneBtn').hidden = !!st.cfg.remote;
    $('#newIco').innerHTML = ICON.plus; $('#sideIco').innerHTML = ICON.panel;
    applyLanguage();
    I18N.on('languageChanged', applyLanguage);
    $('#crumb').onclick = leaveProject; $('#send').onclick = send; $('#newChat').onclick = newChat;
    const officeBtn = $('#officeBtn');
    if (officeBtn) {
      officeBtn.onclick = (ev) => {
        ev.stopPropagation();
        closeMenus();
        toggleOfficeView();
      };
    }
    const dScrim = $('#drawerScrim'); if (dScrim) dScrim.onclick = () => setOfficeView(false);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && officeActive) setOfficeView(false); });
    const officeClose = $('#officeClose');
    if (officeClose) {
      officeClose.onclick = (ev) => {
        ev.stopPropagation();
        setOfficeView(false);
      };
    }
    $('#sideToggle').onclick = toggleNav; $('#scrim').onclick = closeNavOnMobile;
    $('#langBtn').onclick = () => I18N.changeLanguage(I18N.language === 'tr' ? 'en' : 'tr');
    $('#themeBtn').onclick = () => { ObsTheme.set(ObsTheme.get() === 'dark' ? 'light' : 'dark'); refreshTheme(); };
    $('#jump').onclick = () => { scrollDown(true); $('#jump').hidden = true; };
    $('#modelBtn').onclick = (ev) => { ev.stopPropagation(); openModelMenu(); };
    $('#think').addEventListener('keydown', thinkKey);
    initThinkScrub();
    $('#attachBtn').onclick = (ev) => { ev.stopPropagation(); openAttachMenu(); };
    $('#attachFolder').onclick = async (ev) => {
      ev.stopPropagation();
      closeMenus();
      try {
        const r = await api('/api/folders/browse', {});
        if (r && r.path) {
          await refreshConfig();
          const pName = r.name || r.path.split(/[\\/]/).filter(Boolean).pop() || r.path;
          const saved = ObsProjects.save({ id: ObsProjects.newId(), name: pName, cwd: r.path, instructions: '', created: Date.now(), touched: Date.now() });
          if (saved) selectProject(saved.id);
        }
      } catch (err) {
        // diyalog kapandÄ±
      }
    };
    $('#attachFiles').onclick = (ev) => {
      ev.stopPropagation();
      closeMenus();
      $('#filePicker').click();
    };
    $('#filePicker').onchange = (ev) => {
      const files = ev.target.files;
      if (!files || !files.length) return;
      const prompt = $('#prompt');
      Array.from(files).forEach((file) => {
        if (file.size > 2 * 1024 * 1024) {
          const cur = prompt.value;
          prompt.value = cur + (cur ? '\n' : '') + `[${file.name}]`;
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target.result;
          const cur = prompt.value;
          prompt.value = cur + (cur ? '\n\n' : '') + `\`\`\`${file.name}\n${text}\n\`\`\``;
          autosize();
          prompt.focus();
        };
        reader.readAsText(file);
      });
      ev.target.value = '';
    };
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
    window.addEventListener('resize', () => { ['#modelMenu', '#projectMenu', '#attachMenu', '#slashMenu'].forEach((s) => { if (!$(s).hidden) placeMenu($(s)); }); });
    setInterval(refreshConfig, 60000);
    refreshTermSessions(); setInterval(refreshTermSessions, 30000);
    setInterval(refreshCup, 250);
    connect(); $('#prompt').focus();
  }
  init().catch((err) => { const m = err && err.info ? apiMsg(err) : (err && err.message) || String(err); $('#foot').textContent = t('foot.startFailed', { msg: m }); });
})();
