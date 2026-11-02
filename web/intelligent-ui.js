/* Shared renderer: model data is text; executable components are maintained here. */
(function (root) {
  'use strict';
  const en = () => document.documentElement.lang === 'en';
  const tr = (a, b) => en() ? b : a;
  const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = String(text); return e; };
  const drafts = new Map();
  function readDraft(key) {
    try { const stored = JSON.parse(sessionStorage.getItem(key)); if (stored && typeof stored === 'object') return stored; } catch { /* storage can be unavailable */ }
    return drafts.get(key) || { fields: {} };
  }
  function saveDraft(key, value) {
    drafts.set(key, value);
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* keep current-tab memory fallback */ }
  }
  function continuationText(state) {
    if (state.state === 'failed') return tr('Ajan başlatılamadı: ', 'Could not start agent: ') + (state.error || '');
    if (state.taskStatus === 'completed') return tr('Ajan devam görevini tamamladı.', 'Agent completed the continuation.');
    if (state.taskStatus === 'failed' || state.taskStatus === 'cancelled') return tr('Devam görevi sona erdi: ', 'Continuation ended: ') + state.taskStatus;
    if (state.state === 'started') return tr('Ajan aynı oturumda devam ediyor.', 'Agent is continuing in the same session.');
    return tr('Devam işlemi başlatılıyor. Tekrar gönderim yeni görev açmaz.', 'Continuation is starting. Resubmitting will not create another task.');
  }
  function calculate(calc, values) {
    const ns = calc.inputs.map(k => values[k]);
    if (ns.some(v => typeof v !== 'number' || !Number.isFinite(v))) return null;
    const result = calc.operation === 'sum' ? ns.reduce((a, b) => a + b, 0) : calc.operation === 'product' ? ns.reduce((a, b) => a * b, 1) : ns[0] * ns[1] / 100;
    return Number.isFinite(result) ? result : null;
  }
  function render(doc, options = {}) {
    const section = node('section', 'iui-document'); section.dataset.uiId = doc.id; section.dataset.revision = doc.revision;
    const head = node('header', 'iui-head');
    head.append(node('span', 'iui-eyebrow', `${doc.agent} · ${tr('Görsel yanıt', 'Visual answer')}`), node('h2', '', doc.spec.title), node('p', 'iui-summary', doc.spec.summary));
    const badge = node('span', 'iui-revision', `${tr('Sürüm', 'Revision')} ${doc.revision}`); head.append(badge); section.append(head);
    const grid = node('div', 'iui-grid'); section.append(grid);
    for (const b of doc.spec.blocks) {
      const box = node('section', 'iui-block iui-' + b.type); box.dataset.blockId = b.id;
      if (b.title) box.append(node('h3', '', b.title));
      if (b.type === 'text' || b.type === 'card') { box.dataset.tone = b.tone || 'neutral'; box.append(node('p', '', b.text)); }
      if (b.type === 'table') {
        const table = node('table'); const header = node('tr'); b.columns.forEach(c => { const th = node('th', '', c); th.scope = 'col'; header.append(th); });
        const thead = node('thead'); thead.append(header); table.append(thead); const body = node('tbody');
        b.rows.forEach(r => { const row = node('tr'); r.forEach(v => row.append(node('td', '', v === null ? '—' : v))); body.append(row); }); table.append(body); box.append(table);
      }
      if (b.type === 'bar_chart') {
        const max = Math.max(1, ...b.items.map(i => Math.abs(i.value || 0)));
        b.items.forEach(i => {
          const row = node('div', 'iui-bar-row'); const labels = node('div', 'iui-bar-label'); labels.append(node('span', '', i.label), node('strong', '', i.value === null ? tr('Bilinmiyor', 'Unknown') : `${i.value} ${i.unit || ''}`));
          const meter = node('progress', 'iui-meter'); meter.max = max; meter.value = Math.abs(i.value || 0); meter.setAttribute('aria-label', `${i.label}: ${i.value === null ? tr('Bilinmiyor', 'Unknown') : i.value}`); if (i.value < 0) meter.classList.add('negative');
          row.append(labels, meter); box.append(row);
        });
      }
      if (b.type === 'diagram') {
        const flow = node('div', 'iui-flow'); b.nodes.forEach(n => flow.append(node('span', 'iui-flow-node', n.label))); box.append(flow);
        const edges = node('ul', 'iui-edges'); b.edges.forEach(e => edges.append(node('li', '', `${b.nodes.find(n => n.id === e.from).label} → ${b.nodes.find(n => n.id === e.to).label}${e.label ? ' · ' + e.label : ''}`))); box.append(edges);
      }
      if (b.type === 'form') {
        const form = node('form', 'iui-form'); const inputs = new Map();
        const key = `obs-ui-draft:${doc.id}:${b.id}`; const draft = readDraft(key);
        const submitted = (options.state?.forms || []).find(f => f.blockId === b.id);
        const continuation = (options.state?.continuations || []).find(c => c.requestId === (draft.requestId || submitted?.requestId));
        b.fields.forEach(f => {
          const label = node('label'); label.append(node('span', '', f.label)); const input = node('input'); input.name = f.id; input.type = f.type; input.required = !!f.required; if (f.type === 'number') input.step = 'any'; input.value = f.value === undefined ? '' : f.value;
          if (f.type === 'text') input.maxLength = 1000;
          const saved = draft.fields?.[f.id];
          const sent = submitted?.values?.[f.id];
          if (saved && saved.type === f.type && typeof saved.value === 'string') input.value = saved.value;
          else if (sent !== undefined && typeof sent === (f.type === 'number' ? 'number' : 'string')) input.value = String(sent);
          inputs.set(f.id, input); label.append(input); form.append(label);
        });
        const output = node('output', 'iui-result'); output.setAttribute('aria-live', 'polite');
        const values = () => Object.fromEntries([...inputs].filter(([, i]) => i.value !== '').map(([k, i]) => [k, i.type === 'number' ? Number(i.value) : i.value]));
        function refresh() { if (!b.calculation) return; const result = calculate(b.calculation, values()); output.textContent = `${b.calculation.label}: ${result === null ? '—' : new Intl.NumberFormat(en() ? 'en-US' : 'tr-TR', { maximumFractionDigits: 4 }).format(result)} ${b.calculation.unit || ''}`; }
        function persistFields() {
          const current = readDraft(key);
          current.fields = Object.fromEntries([...inputs].map(([id, input]) => [id, { type: input.type, value: input.value }]));
          current.dirty = JSON.stringify(values()) !== current.lastValues;
          saveDraft(key, current);
          if (current.dirty) status.textContent = tr('Kaydedilmemiş değişiklikler var.', 'There are unsaved changes.');
        }
        form.addEventListener('input', event => { if (!inputs.has(event.target.name)) return; persistFields(); refresh(); }); if (b.calculation) { refresh(); form.append(output); }
        const choice = node('label', 'iui-continue'); const continueBox = node('input'); continueBox.type = 'checkbox'; continueBox.name = '__continue';
        const capability = options.state?.continuation;
        continueBox.checked = !!draft.continueAgent && capability?.available === true;
        continueBox.disabled = options.readOnly === true || capability?.available !== true;
        choice.append(continueBox, node('span', '', tr('Gönderince ajan aynı oturum ve izinlerle devam etsin', 'Continue the agent in the same session with the same permissions')));
        continueBox.addEventListener('change', () => { const current = readDraft(key); current.continueAgent = continueBox.checked; saveDraft(key, current); });
        form.append(choice);
        if (capability?.sandbox === 'workspace-write') form.append(node('p', 'iui-status', tr('Kaynak oturumda dosya yazma izni var.', 'The source session has file write permission.')));
        if (capability && !capability.available) form.append(node('p', 'iui-status', capability.reason));
        const button = node('button', 'iui-submit', b.submitLabel || tr('Yanıtı gönder', 'Submit answer')); button.type = 'submit'; button.disabled = options.readOnly === true;
        const status = node('p', 'iui-status'); status.setAttribute('role', 'status');
        if (draft.dirty) status.textContent = tr('Kaydedilmemiş değişiklikler var.', 'There are unsaved changes.');
        else if (continuation) status.textContent = continuationText(continuation);
        else if (draft.message) status.textContent = draft.message;
        else if (submitted) status.textContent = tr('Önceki yanıt kaydedildi.', 'Previous answer is saved.');
        let requestId = draft.requestId || submitted?.requestId || null; let lastValues = draft.lastValues || (submitted ? JSON.stringify(submitted.values) : '');
        let requestRevision = draft.requestRevision || submitted?.revision;
        function announce(message) {
          status.textContent = message;
          for (const section of document.querySelectorAll('.iui-document')) {
            if (section.dataset.uiId !== doc.id) continue;
            const block = [...section.querySelectorAll('.iui-block')].find(e => e.dataset.blockId === b.id);
            const visibleStatus = block?.querySelector('.iui-form > [role=status]');
            if (visibleStatus) visibleStatus.textContent = message;
          }
        }
        form.addEventListener('submit', async event => {
          event.preventDefault(); if (!form.reportValidity() || button.disabled) return;
          persistFields();
          const v = values(); const serialized = JSON.stringify(v); if (!requestId || serialized !== lastValues || requestRevision !== doc.revision) requestId = crypto.randomUUID(); lastValues = serialized; requestRevision = doc.revision;
          const current = readDraft(key); current.requestId = requestId; current.requestRevision = requestRevision; current.lastValues = serialized; current.continueAgent = continueBox.checked; delete current.message; saveDraft(key, current);
          button.disabled = true; status.textContent = tr('Gönderiliyor…', 'Submitting…');
          try {
            const result = await options.onAction({ id: doc.id, expectedRevision: doc.revision, blockId: b.id, requestId, values: v }, { continueAgent: continueBox.checked });
            const message = result?.continuation ? continuationText(result.continuation) : result?.continuationError ? tr('Yanıt kaydedildi. Devam başlatılamadı: ', 'Answer saved. Could not continue: ') + result.continuationError : tr('Yanıt kaydedildi. Ajan tarafından okunabilir.', 'Answer saved. Available to the agent.');
            const saved = readDraft(key); saved.message = message;
            const currentValues = Object.fromEntries(Object.entries(saved.fields || {}).filter(([, f]) => f.value !== '').map(([id, f]) => [id, f.type === 'number' ? Number(f.value) : f.value]));
            saved.dirty = JSON.stringify(currentValues) !== serialized; saveDraft(key, saved);
            announce(saved.dirty ? tr('Kaydedilmemiş değişiklikler var.', 'There are unsaved changes.') : message);
          }
          catch (error) { status.textContent = error.message; }
          finally { button.disabled = options.readOnly === true; }
        });
        form.append(button, status); box.append(form);
      }
      grid.append(box);
    }
    const link = node('a', 'iui-open', tr('Ayrı görünümde aç ↗', 'Open separate view ↗')); link.href = '/visual.html?id=' + encodeURIComponent(doc.id); link.target = '_blank'; link.rel = 'noopener'; section.append(link);
    return section;
  }
  function replace(old, doc, options) {
    const active = document.activeElement;
    const field = old && old.contains(active) && active.tagName === 'INPUT' ? { blockId: active.closest('.iui-block')?.dataset.blockId, name: active.name, start: active.selectionStart, end: active.selectionEnd } : null;
    const next = render(doc, options);
    if (old) old.replaceWith(next);
    if (field) {
      const input = [...next.querySelectorAll('input')].find(i => i.name === field.name && i.closest('.iui-block')?.dataset.blockId === field.blockId);
      if (input) { input.focus({ preventScroll: true }); if (input.type === 'text' && field.start !== null) input.setSelectionRange(field.start, field.end); }
    }
    return next;
  }
  root.ObsUI = { render, replace, calculate };
  if (typeof module !== 'undefined') module.exports = root.ObsUI;
})(typeof window !== 'undefined' ? window : globalThis);
