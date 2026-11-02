(async function () {
  'use strict';
  const host = document.getElementById('visual-root'); const key = new URLSearchParams(location.search).get('id');
  let revision = 0; let generation = 0; let readOnly = false; let stateKey = ''; let state = null;
  async function post(url, body) {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-observatory-token': document.querySelector('meta[name=obs-token]').content }, body: JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Yanıt gönderilemedi'); return data;
  }
  async function action(body, choice) {
    const saved = await post('/api/ui/action', body);
    if (!choice?.continueAgent) return saved;
    try { return { ...saved, ...await post('/api/ui/continue', { id: body.id, requestId: body.requestId }) }; }
    catch (error) { return { ...saved, continuationError: error.message }; }
  }
  async function load() {
    const request = ++generation;
    try {
      const response = await fetch('/api/ui' + (key ? '?id=' + encodeURIComponent(key) : '')); const data = await response.json();
      if (request !== generation) return;
      if (!response.ok) throw new Error(data.error || 'Görsel yanıt yüklenemedi');
      if (key) {
        if (data.document.revision < revision) return;
        const nextStateKey = JSON.stringify(data.state);
        if (data.document.revision === revision && stateKey === nextStateKey) return;
        state = data.state; stateKey = nextStateKey;
        const old = host.querySelector('.iui-document');
        const element = ObsUI.replace(old, data.document, { onAction: action, readOnly, state });
        if (!old) host.replaceChildren(element);
        revision = data.document.revision; document.title = data.document.spec.title + ' · Agent Observatory';
      }
      else {
        const list = document.createElement('div'); list.className = 'visual-list';
        for (const doc of data.documents) { const link = document.createElement('a'); link.href = '/visual.html?id=' + encodeURIComponent(doc.id); const title = document.createElement('strong'); title.textContent = doc.spec.title; const sub = document.createElement('small'); sub.textContent = `${doc.agent} · ${doc.spec.summary}`; link.append(title, sub); list.append(link); }
        if (!data.documents.length) { const p = document.createElement('p'); p.className = 'visual-state'; p.textContent = 'Henüz görsel yanıt yok. Ajanın ui_publish aracını kullanmasıyla burada görünür.'; list.append(p); }
        host.replaceChildren(list);
      }
    } catch (error) { if (!revision) host.textContent = error.message; }
  }
  try { const response = await fetch('/api/config'); if (response.ok) readOnly = (await response.json()).writeAllowed === false; } catch { /* backend remains authoritative */ }
  await load();
  const stream = new EventSource('/stream');
  stream.addEventListener('observatory', event => {
    try {
      const e = JSON.parse(event.data);
      if (e.type.startsWith('ui.') && (!key || e.data.id === key)) void load();
      else if (key && ['task.completed', 'task.failed', 'task.cancelled'].includes(e.type)) void load();
      else if (e.type.startsWith('task.') && state?.continuations.some(c => c.continuationTaskId === e.taskId)) void load();
    } catch { /* malformed event */ }
  });
  stream.onopen = () => { void load(); }; // replay current snapshot after reconnect
  window.addEventListener('pagehide', () => stream.close());
})();
