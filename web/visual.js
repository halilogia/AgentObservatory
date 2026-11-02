(async function () {
  'use strict';
  const I18N = window.ObsI18n;
  const t = (key, params) => I18N ? I18N.t(key, params) : key;
  const host = document.getElementById('visual-root'); const key = new URLSearchParams(location.search).get('id');
  const langBtn = document.getElementById('langBtn'); const themeBtn = document.getElementById('themeBtn'); const deleteBtn = document.getElementById('deleteBtn');
  let revision = 0; let generation = 0; let readOnly = false; let stateKey = ''; let state = null;
  let documents = []; let query = '';
  function syncChrome() {
    if (I18N) I18N.applyDom();
    if (langBtn && I18N) { langBtn.textContent = t('lang.switchTo'); langBtn.title = t('lang.switchTitle'); }
    if (themeBtn && window.ObsTheme) {
      const dark = ObsTheme.get() === 'dark';
      themeBtn.textContent = dark ? '☀' : '☾';
      themeBtn.title = t(dark ? 'theme.toLight' : 'theme.toDark');
      themeBtn.setAttribute('aria-label', themeBtn.title);
    }
    if (deleteBtn) { deleteBtn.textContent = t('ui.delete'); deleteBtn.title = t('ui.delete'); }
  }
  async function post(url, body) {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-observatory-token': document.querySelector('meta[name=obs-token]').content }, body: JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || data.code || 'request failed'); return data;
  }
  async function action(body, choice) {
    const saved = await post('/api/ui/action', body);
    if (!choice?.continueAgent) return saved;
    try { return { ...saved, ...await post('/api/ui/continue', { id: body.id, requestId: body.requestId }) }; }
    catch (error) { return { ...saved, continuationError: error.message }; }
  }
  function renderList(focusInput) {
    const previous = host.querySelector('.visual-search');
    const position = previous ? previous.selectionStart : null;
    const tools = document.createElement('div'); tools.className = 'visual-tools';
    const input = document.createElement('input'); input.type = 'search'; input.className = 'visual-search';
    input.placeholder = t('ui.search'); input.setAttribute('aria-label', t('ui.search')); input.value = query;
    const count = document.createElement('span'); count.className = 'visual-count';
    tools.append(input, count);
    const list = document.createElement('div'); list.className = 'visual-list';
    const needle = query.trim().toLowerCase();
    const filtered = documents.filter(doc => !needle || `${doc.spec.title} ${doc.spec.summary} ${doc.agent}`.toLowerCase().includes(needle));
    count.textContent = t('ui.count', { count: filtered.length });
    const groups = new Map();
    for (const doc of filtered) { const group = doc.agent || '—'; if (!groups.has(group)) groups.set(group, []); groups.get(group).push(doc); }
    for (const [agent, docs] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
      const heading = document.createElement('h2'); heading.className = 'visual-group'; heading.textContent = agent; list.append(heading);
      for (const doc of docs) {
        const link = document.createElement('a'); link.href = '/visual.html?id=' + encodeURIComponent(doc.id);
        const title = document.createElement('strong'); title.textContent = doc.spec.title;
        const sub = document.createElement('small'); sub.textContent = doc.spec.summary;
        const meta = document.createElement('small'); meta.className = 'visual-meta'; meta.textContent = t('ui.blocks', { count: doc.spec.blocks.length }) + ' · ' + doc.id;
        link.append(title, sub, meta); list.append(link);
      }
    }
    if (!filtered.length) { const p = document.createElement('p'); p.className = 'visual-state'; p.textContent = documents.length ? t('ui.search') : t('ui.empty'); list.append(p); }
    host.replaceChildren(tools, list);
    input.addEventListener('input', () => { query = input.value; renderList(true); });
    if (focusInput) { input.focus({ preventScroll: true }); if (position !== null) input.setSelectionRange(position, position); }
  }
  async function load() {
    const request = ++generation;
    try {
      const response = await fetch('/api/ui' + (key ? '?id=' + encodeURIComponent(key) : '')); const data = await response.json();
      if (request !== generation) return;
      if (response.status === 404) { revision = 0; state = null; stateKey = ''; host.replaceChildren(); const missing = document.createElement('p'); missing.className = 'visual-state'; missing.textContent = t('ui.error'); host.append(missing); if (deleteBtn) deleteBtn.hidden = true; return; }
      if (!response.ok) throw new Error(data.error || t('ui.error'));
      if (key) {
        if (data.document.revision < revision) return;
        const nextStateKey = JSON.stringify(data.state);
        if (data.document.revision === revision && stateKey === nextStateKey) return;
        state = data.state; stateKey = nextStateKey;
        const old = host.querySelector('.iui-document');
        const element = ObsUI.replace(old, data.document, { onAction: action, readOnly, state });
        if (!old) host.replaceChildren(element);
        revision = data.document.revision; document.title = data.document.spec.title + ' · Agent Observatory';
        if (deleteBtn) deleteBtn.hidden = readOnly;
      }
      else {
        documents = data.documents;
        document.title = t('ui.all') + ' · Agent Observatory';
        if (deleteBtn) deleteBtn.hidden = true;
        renderList(false);
      }
    } catch (error) { if (!revision) { host.replaceChildren(); const p = document.createElement('p'); p.className = 'visual-state'; p.textContent = error.message; host.append(p); } }
  }
  let loadTimer = null;
  function scheduleLoad() { if (loadTimer) clearTimeout(loadTimer); loadTimer = setTimeout(() => { loadTimer = null; void load(); }, 200); }
  if (I18N) I18N.init();
  syncChrome();
  if (I18N) I18N.on('languageChanged', () => { syncChrome(); if (key) void load(); else renderList(false); });
  if (langBtn) langBtn.addEventListener('click', () => { if (I18N) I18N.changeLanguage(I18N.language === 'tr' ? 'en' : 'tr'); });
  if (themeBtn) themeBtn.addEventListener('click', () => { if (!window.ObsTheme) return; ObsTheme.set(ObsTheme.get() === 'dark' ? 'light' : 'dark'); syncChrome(); });
  if (deleteBtn) deleteBtn.addEventListener('click', async () => {
    if (!key || !confirm(t('ui.deleteConfirm'))) return;
    deleteBtn.disabled = true;
    try { await post('/api/ui/delete', { id: key, expectedRevision: revision }); location.href = '/visual.html'; }
    catch (error) { deleteBtn.disabled = false; alert(error.message); }
  });
  try { const response = await fetch('/api/config'); if (response.ok) readOnly = (await response.json()).writeAllowed === false; } catch { /* backend remains authoritative */ }
  await load();
  const stream = new EventSource('/stream');
  stream.addEventListener('observatory', event => {
    try {
      const e = JSON.parse(event.data);
      if (e.type.startsWith('ui.') && (!key || e.data.id === key)) scheduleLoad();
      else if (key && ['task.completed', 'task.failed', 'task.cancelled'].includes(e.type)) scheduleLoad();
      else if (e.type.startsWith('task.') && state?.continuations.some(c => c.continuationTaskId === e.taskId)) scheduleLoad();
    } catch { /* malformed event */ }
  });
  stream.onopen = () => { void load(); }; // replay current snapshot after reconnect
  window.addEventListener('pagehide', () => stream.close());
})();
