/* Shared renderer: model data is text; executable components are maintained here. */
(function (root) {
  'use strict';
  const en = () => document.documentElement.lang === 'en';
  const tr = (a, b) => en() ? b : a;
  const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = String(text); return e; };
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
        b.fields.forEach(f => {
          const label = node('label'); label.append(node('span', '', f.label)); const input = node('input'); input.name = f.id; input.type = f.type; input.required = !!f.required; if (f.type === 'number') input.step = 'any'; input.value = f.value === undefined ? '' : f.value;
          inputs.set(f.id, input); label.append(input); form.append(label);
        });
        const output = node('output', 'iui-result'); output.setAttribute('aria-live', 'polite');
        const values = () => Object.fromEntries([...inputs].filter(([, i]) => i.value !== '').map(([k, i]) => [k, i.type === 'number' ? Number(i.value) : i.value]));
        function refresh() { if (!b.calculation) return; const result = calculate(b.calculation, values()); output.textContent = `${b.calculation.label}: ${result === null ? '—' : new Intl.NumberFormat(en() ? 'en-US' : 'tr-TR', { maximumFractionDigits: 4 }).format(result)} ${b.calculation.unit || ''}`; }
        form.addEventListener('input', refresh); if (b.calculation) { refresh(); form.append(output); }
        const button = node('button', 'iui-submit', b.submitLabel || tr('Yanıtı gönder', 'Submit answer')); button.type = 'submit'; button.disabled = options.readOnly === true;
        const status = node('p', 'iui-status'); status.setAttribute('role', 'status');
        let requestId = null; let lastValues = '';
        form.addEventListener('submit', async event => {
          event.preventDefault(); if (!form.reportValidity() || button.disabled) return;
          const v = values(); const serialized = JSON.stringify(v); if (!requestId || serialized !== lastValues) requestId = crypto.randomUUID(); lastValues = serialized;
          button.disabled = true; status.textContent = tr('Gönderiliyor…', 'Submitting…');
          try { await options.onAction({ id: doc.id, expectedRevision: doc.revision, blockId: b.id, requestId, values: v }); status.textContent = tr('Yanıt kaydedildi. Ajan tarafından okunabilir.', 'Answer saved. Available to the agent.'); requestId = null; }
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
  root.ObsUI = { render, calculate };
  if (typeof module !== 'undefined') module.exports = root.ObsUI;
})(typeof window !== 'undefined' ? window : globalThis);
