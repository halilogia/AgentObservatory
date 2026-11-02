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
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let diagramSeq = 0;
  function svgEl(tag, attrs) {
    const element = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    return element;
  }
  function wrapLabel(text, max) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const lines = []; let current = '';
    for (const word of words) {
      const next = current ? current + ' ' + word : word;
      if (next.length <= max) current = next;
      else { if (current) lines.push(current); current = word.length > max ? word.slice(0, max - 1) + '…' : word; }
      if (lines.length === 2) break;
    }
    if (current && lines.length < 2) lines.push(current);
    if (!lines.length) lines.push('—');
    if (lines.length === 2 && lines[1].length > max) lines[1] = lines[1].slice(0, max - 1) + '…';
    return lines;
  }
  /** Deterministic layered layout for a small DAG; cycles are broken by depth-first back-edge removal. */
  function diagramLayout(nodes, edges) {
    const W = 148, H = 46, GX = 62, GY = 26, PAD = 18, MAX = 10000;
    const index = new Map(nodes.map((n, i) => [n.id, i]));
    const valid = (edges || []).filter(e => e && index.has(e.from) && index.has(e.to));
    const out = new Map(nodes.map(n => [n.id, []]));
    for (const e of valid) if (e.from !== e.to) out.get(e.from).push(e.to);
    const dag = new Map(nodes.map(n => [n.id, []]));
    const state = new Map();
    const visit = id => {
      state.set(id, 1);
      for (const to of out.get(id)) {
        const seen = state.get(to) || 0;
        if (seen === 1) continue;
        dag.get(id).push(to);
        if (seen === 0) visit(to);
      }
      state.set(id, 2);
    };
    nodes.forEach(n => { if (!state.get(n.id)) visit(n.id); });
    const indegree = new Map(nodes.map(n => [n.id, 0]));
    for (const [, targets] of dag) for (const to of targets) indegree.set(to, indegree.get(to) + 1);
    const rank = new Map(nodes.map(n => [n.id, 0]));
    const queue = nodes.filter(n => indegree.get(n.id) === 0).map(n => n.id);
    let guard = 0;
    while (queue.length && guard++ < MAX) {
      const id = queue.shift();
      for (const to of dag.get(id)) {
        rank.set(to, Math.max(rank.get(to), rank.get(id) + 1));
        indegree.set(to, indegree.get(to) - 1);
        if (indegree.get(to) === 0) queue.push(to);
      }
    }
    const columns = [];
    nodes.forEach(n => { const r = rank.get(n.id); (columns[r] ||= []).push(n.id); });
    const rows = Math.max(1, ...columns.map(c => (c ? c.length : 0)));
    const pos = new Map();
    columns.forEach((column, r) => {
      if (!column) return;
      const offset = (rows - column.length) * (H + GY) / 2;
      column.forEach((id, k) => pos.set(id, { x: PAD + r * (W + GX), y: PAD + offset + k * (H + GY), w: W, h: H }));
    });
    const width = PAD * 2 + (columns.length ? (columns.length - 1) * (W + GX) + W : W);
    const height = PAD * 2 + (rows - 1) * (H + GY) + H;
    return { width: Math.max(width, W + PAD * 2), height: Math.max(height, H + PAD * 2), pos, edges: valid };
  }
  function edgePath(from, to) {
    if (from === to) {
      const cx = from.x + from.w / 2, top = from.y, lift = 42;
      return `M ${cx - 20} ${top} C ${cx - 34} ${top - lift}, ${cx + 34} ${top - lift}, ${cx + 20} ${top}`;
    }
    const sx = from.x + from.w / 2, sy = from.y + from.h / 2, tx = to.x + to.w / 2, ty = to.y + to.h / 2;
    if (to.x > from.x) {
      const ax = from.x + from.w, bx = to.x;
      return `M ${ax} ${sy} C ${ax + 34} ${sy}, ${bx - 34} ${ty}, ${bx} ${ty}`;
    }
    const ax = from.x + from.w, bx = to.x + to.w;
    return `M ${ax} ${sy} C ${ax + 48} ${sy - 28}, ${bx + 48} ${ty - 28}, ${bx} ${ty}`;
  }
  function renderDiagram(box, block, doc) {
    const layout = diagramLayout(block.nodes, block.edges);
    const label = block.title || tr('Diyagram', 'Diagram');
    const svg = svgEl('svg', { class: 'iui-svg', viewBox: `0 0 ${layout.width} ${layout.height}`, width: layout.width, height: layout.height, role: 'img', 'aria-label': label });
    const title = svgEl('title'); title.textContent = label; svg.append(title);
    const markerId = 'iui-arrow-' + (++diagramSeq);
    const defs = svgEl('defs'); const marker = svgEl('marker', { id: markerId, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    marker.append(svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'iui-diagram-arrow' }));
    defs.append(marker); svg.append(defs);
    for (const edge of layout.edges) {
      const from = layout.pos.get(edge.from), to = layout.pos.get(edge.to);
      const path = svgEl('path', { d: edgePath(from, to), class: 'iui-diagram-edge', 'marker-end': `url(#${markerId})` });
      const edgeTitle = svgEl('title'); edgeTitle.textContent = `${labelOf(block, edge.from)} → ${labelOf(block, edge.to)}${edge.label ? ' · ' + edge.label : ''}`;
      path.append(edgeTitle); svg.append(path);
      if (edge.label) {
        const text = svgEl('text', { x: (from.x + to.x) / 2 + from.w / 2, y: (from.y + to.y) / 2 + from.h / 2 - 6, class: 'iui-diagram-edge-label' });
        text.textContent = edge.label; svg.append(text);
      }
    }
    for (const nodeData of block.nodes) {
      const p = layout.pos.get(nodeData.id); if (!p) continue;
      const group = svgEl('g', { class: 'iui-diagram-node', transform: `translate(${p.x} ${p.y})` });
      const nodeTitle = svgEl('title'); nodeTitle.textContent = nodeData.label; group.append(nodeTitle);
      group.append(svgEl('rect', { width: p.w, height: p.h, rx: 9 }));
      const lines = wrapLabel(nodeData.label, 18);
      lines.forEach((line, i) => {
        const text = svgEl('text', { x: p.w / 2, y: p.h / 2 + (lines.length === 1 ? 0 : i === 0 ? -8 : 8) });
        text.textContent = line; group.append(text);
      });
      svg.append(group);
    }
    const scroll = node('div', 'iui-diagram-scroll'); scroll.append(svg); box.append(scroll);
    const details = node('details', 'iui-edges-wrap');
    details.append(node('summary', '', `${tr('Bağlantılar', 'Connections')} (${layout.edges.length})`));
    const list = node('ul', 'iui-edges');
    layout.edges.forEach(e => list.append(node('li', '', `${labelOf(block, e.from)} → ${labelOf(block, e.to)}${e.label ? ' · ' + e.label : ''}`)));
    details.append(list); box.append(details);
  }
  function labelOf(block, id) {
    const found = block.nodes.find(n => n.id === id);
    return found ? found.label : id;
  }
  function render(doc, options = {}) {
    const section = node('section', 'iui-document'); section.dataset.uiId = doc.id; section.dataset.revision = doc.revision;
    const head = node('header', 'iui-head');
    head.append(node('span', 'iui-eyebrow', `${doc.agent} · ${tr('Görsel yanıt', 'Visual answer')}`), node('h2', '', doc.spec.title), node('p', 'iui-summary', doc.spec.summary));
    const badge = node('span', 'iui-revision', `${tr('Sürüm', 'Revision')} ${doc.revision}`); head.append(badge); section.append(head);
    const grid = node('div', 'iui-grid'); section.append(grid);
    for (const b of doc.spec.blocks) {
      const box = node('section', 'iui-block iui-' + b.type); box.dataset.blockId = b.id; box.dataset.blockType = b.type;
      if (b.type === 'form') box.dataset.signature = JSON.stringify({ title: b.title || '', fields: b.fields, calculation: b.calculation || null, submitLabel: b.submitLabel || '', readOnly: options.readOnly === true, capability: options.state?.continuation || null, forms: options.state?.forms || null, continuations: options.state?.continuations || null });
      if (b.title) box.append(node('h3', '', b.title));
      if (b.type === 'text' || b.type === 'card') { box.dataset.tone = b.tone || 'neutral'; box.append(node('p', '', b.text)); }
      if (b.type === 'table') {
        const table = node('table'); if (b.title) table.append(node('caption', 'iui-sr-only', b.title)); const header = node('tr'); b.columns.forEach(c => { const th = node('th', '', c); th.scope = 'col'; header.append(th); });
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
      if (b.type === 'diagram') renderDiagram(box, b, doc);
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
        continueBox.addEventListener('change', () => { const current = readDraft(key); current.continueAgent = continueBox.checked; saveDraft(key, current); requestId = null; });
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
            const result = await options.onAction({ id: doc.id, expectedRevision: doc.revision, blockId: b.id, requestId, values: v, continue: continueBox.checked }, { continueAgent: continueBox.checked });
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
  function restoreFocus(scope, field) {
    if (!field) return;
    const input = [...scope.querySelectorAll('input')].find(i => i.name === field.name && i.closest('.iui-block')?.dataset.blockId === field.blockId);
    if (!input) return;
    input.focus({ preventScroll: true });
    if (input.type === 'text' && field.start !== null) input.setSelectionRange(field.start, field.end);
  }
  /** Keyed update: unchanged form blocks keep their DOM, focus and selection; other blocks are replaced in place. */
  function reconcile(old, next) {
    const oldHead = old.querySelector(':scope > .iui-head'), newHead = next.querySelector(':scope > .iui-head');
    if (oldHead && newHead) old.replaceChild(newHead, oldHead);
    const oldGrid = old.querySelector(':scope > .iui-grid'), newGrid = next.querySelector(':scope > .iui-grid');
    if (oldGrid && newGrid) {
      const existing = new Map([...oldGrid.children].map(el => [el.dataset.blockId, el]));
      const ordered = [];
      for (const block of [...newGrid.children]) {
        const prior = existing.get(block.dataset.blockId);
        const keep = prior && block.dataset.blockType === 'form' && prior.dataset.blockType === 'form' && block.dataset.signature === prior.dataset.signature;
        ordered.push(keep ? prior : block);
        existing.delete(block.dataset.blockId);
      }
      oldGrid.replaceChildren(...ordered);
    }
    const oldLink = old.querySelector(':scope > .iui-open'), newLink = next.querySelector(':scope > .iui-open');
    if (oldLink && newLink) old.replaceChild(newLink, oldLink);
    old.dataset.revision = next.dataset.revision;
  }
  function replace(old, doc, options) {
    const active = document.activeElement;
    const field = old && old.contains(active) && active.tagName === 'INPUT' ? { blockId: active.closest('.iui-block')?.dataset.blockId, name: active.name, start: active.selectionStart, end: active.selectionEnd } : null;
    if (old && old.dataset.uiId === doc.id) {
      reconcile(old, render(doc, options));
      restoreFocus(old, field);
      return old;
    }
    const next = render(doc, options);
    if (old) old.replaceWith(next);
    restoreFocus(next, field);
    return next;
  }
  root.ObsUI = { render, replace, calculate, diagramLayout };
  if (typeof module !== 'undefined') module.exports = root.ObsUI;
})(typeof window !== 'undefined' ? window : globalThis);
