(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const TOKEN = document.querySelector('meta[name="obs-token"]').content;
  const svg = (d, extra = '') => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  const ICON = {
    chev: svg('<path d="M4 6l4 4 4-4"/>'),
    check: svg('<path d="M3.5 8.5l3 3 6-7"/>'),
    folder: svg('<path d="M2 4.5A1.5 1.5 0 013.5 3h2.3l1.4 1.5h5.3A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5z"/>'),
    lock: svg('<rect x="3.5" y="7" width="9" height="6" rx="1.5"/><path d="M5.5 7V5.5a2.5 2.5 0 015 0V7"/>'),
    pen: svg('<path d="M3 13l.7-2.8L10.9 3a1.2 1.2 0 011.7 0l.4.4a1.2 1.2 0 010 1.7L5.8 12.3z"/>'),
    up: svg('<path d="M8 13V3M3.5 7.5L8 3l4.5 4.5"/>'),
    stop: '<svg viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor"/></svg>'
  };
  const EFFORT = { low: 'Düşük', medium: 'Orta', high: 'Yüksek', xhigh: 'Çok yüksek', max: 'En yüksek' };
  const SUGGEST = [
    'Bu klasörün yapısını kısaca özetle',
    'Son git değişikliklerini açıkla',
    'README dosyasında eksik olan neler?',
    'Testleri nasıl çalıştırırım?'
  ];
  const st = { cfg: null, engine: 'claude', model: 'sonnet', effort: 'medium', mode: 'read', cwd: '', session: null, running: null };
  const tasks = new Map();
  let early = [];

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const eng = (id = st.engine) => st.cfg.engines.find((e) => e.id === id);
  const fmtTok = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n));
  const save = () => { try { localStorage.setItem('obs-web', JSON.stringify({ engine: st.engine, model: st.model, effort: st.effort, cwd: st.cwd })); } catch { /* yoksay */ } };

  async function api(path, body) {
    const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-observatory-token': TOKEN }, body: JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch { /* gövde yok */ }
    if (!r.ok) throw Object.assign(new Error(j.error || 'istek başarısız (' + r.status + ')'), { info: j });
    return j;
  }

  // ---------- biçimlendirme (innerHTML kullanmadan) ----------
  function inline(parent, text) {
    text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/).forEach((part) => {
      if (!part) return;
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) parent.appendChild(el('code', '', part.slice(1, -1)));
      else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) parent.appendChild(el('strong', '', part.slice(2, -2)));
      else parent.appendChild(document.createTextNode(part));
    });
  }
  function renderMd(box, text) {
    box.replaceChildren();
    text.split('```').forEach((chunk, i) => {
      if (i % 2 === 1) { const pre = el('pre'); pre.appendChild(el('code', '', chunk.replace(/^[^\n]*\n/, '').replace(/\n$/, ''))); box.appendChild(pre); return; }
      chunk.split(/\n{2,}/).forEach((para) => {
        if (!para.trim()) return;
        const lines = para.split('\n');
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          const ul = el('ul'); lines.forEach((l) => { const li = el('li'); inline(li, l.replace(/^\s*[-*]\s+/, '')); ul.appendChild(li); }); box.appendChild(ul);
        } else { const p = el('p'); inline(p, para.replace(/^#{1,4}\s+/gm, '')); box.appendChild(p); }
      });
    });
  }
  function toolSummary(name, input) {
    const o = input && typeof input === 'object' ? input : {};
    const v = o.command ?? o.CommandLine ?? o.cmd ?? o.file_path ?? o.filePath ?? o.path ?? o.pattern ?? o.query ?? Object.values(o).find((x) => typeof x === 'string') ?? '';
    return String(v).replace(/\s+/g, ' ').slice(0, 140);
  }
  function friendlyError(d) {
    const kind = d.errorKind;
    const mins = d.cooldownMs ? Math.max(1, Math.round(d.cooldownMs / 60000)) : 0;
    if (kind === 'rate_limit') return 'Kota doldu' + (mins ? ` (yaklaşık ${mins >= 90 ? Math.round(mins / 60) + ' saat' : mins + ' dk'} sonra açılır)` : '') + '. Başka bir motor seç.';
    if (kind === 'auth') return 'Giriş gerekli: ilgili CLI\'da oturum aç.';
    if (kind === 'model_unsupported') return 'Bu model hesapta desteklenmiyor. Başka bir model seç.';
    if (kind === 'permission') return 'İzin gerekiyor. Yazabilir kipini destekleyen bir motor seç ya da isteği salt okunur yap.';
    if (kind === 'spawn_failed') return 'Program başlatılamadı. Terminalde "observatory doctor" çalıştır.';
    return String(d.error || d.reason || 'Görev başarısız oldu.').split('\n')[0].slice(0, 300);
  }

  // ---------- mesajlar ----------
  function addUser(text) {
    $('#empty').hidden = true; $('#chips').hidden = true;
    $('#thread').appendChild(el('div', 'msg user', text));
    scrollDown();
  }
  function addBot(e, modelLabel, cwd) {
    $('#empty').hidden = true; $('#chips').hidden = true;
    const row = el('div', 'msg bot'); row.style.setProperty('--c', e.color);
    row.appendChild(el('div', 'avatar', e.label.charAt(0)));
    const col = el('div', 'body');
    const who = el('div', 'who'); who.appendChild(el('span', '', `${e.label} · ${modelLabel}`));
    const dots = el('span', 'state'); dots.append(el('b'), el('b'), el('b')); who.appendChild(dots);
    const content = el('div'); const meta = el('div', 'meta');
    col.append(who, content, meta); row.appendChild(col);
    $('#thread').appendChild(row);
    const view = { engine: e, cwd, content, meta, who, dots, text: '', textBox: null, tools: new Map(), lastTool: null, tin: 0, tout: 0, t0: Date.now(), done: false, taskId: null };
    scrollDown();
    return view;
  }
  function scrollDown() { const m = $('#main'); requestAnimationFrame(() => { m.scrollTop = m.scrollHeight; }); }
  function addText(v, t) {
    if (!t) return;
    if (!v.textBox) { v.textBox = el('div'); v.content.appendChild(v.textBox); v.text = ''; }
    v.text += t;
    if (!v.raf) v.raf = requestAnimationFrame(() => { v.raf = 0; renderMd(v.textBox, v.text); scrollDown(); });
  }
  function addTool(v, d) {
    v.textBox = null;
    const det = el('details', 'tool'); const sum = el('summary');
    sum.append(el('span', 'tn', d.name || 'araç'), el('span', 'ts', toolSummary(d.name, d.input)));
    det.appendChild(sum);
    v.content.appendChild(det);
    const rec = { det, id: d.id || null, done: false };
    v.tools.set(rec.id || 'n' + v.tools.size, rec); v.lastTool = rec;
    scrollDown();
  }
  function toolDone(v, d) {
    const rec = (d.toolUseId && v.tools.get(d.toolUseId)) || v.lastTool;
    if (!rec || rec.done) return;
    rec.done = true;
    const out = String(d.output ?? d.result ?? '').split('\n').slice(0, 40).join('\n');
    if (out.trim()) { const pre = el('pre'); pre.appendChild(el('code', '', out.slice(0, 4000))); rec.det.appendChild(pre); }
  }
  function finish(v, kind, d) {
    if (v.done) return; v.done = true;
    v.dots.remove();
    if (v.raf) { cancelAnimationFrame(v.raf); v.raf = 0; }
    if (v.textBox) renderMd(v.textBox, v.text);
    if (!v.text && d && d.result && kind === 'completed') addText(v, String(d.result));
    if (v.raf) { cancelAnimationFrame(v.raf); v.raf = 0; if (v.textBox) renderMd(v.textBox, v.text); }
    if (kind === 'failed') v.content.appendChild(el('div', 'notice', friendlyError(d || {})));
    if (kind === 'cancelled') v.content.appendChild(el('div', 'notice warn', 'Görev iptal edildi.'));
    if (kind === 'completed' && !v.text) v.content.appendChild(el('div', 'notice warn', 'Motor yanıt metni üretmedi' + (v.tools.size ? ' (yalnızca araç çalıştırdı; üstteki araç kartlarını aç).' : '.') + ' Çok büyük bir klasörde çalışıyorsan daha küçük bir proje seç.'));
    const sec = Math.round((Date.now() - v.t0) / 1000);
    v.meta.textContent = [sec + ' sn', v.tin ? 'giriş ' + fmtTok(v.tin) : '', v.tout ? 'çıkış ' + fmtTok(v.tout) : ''].filter(Boolean).join(' · ');
    if (st.running === v.taskId) st.running = null;
    refreshSend(); refreshConfig(); $('#prompt').focus(); scrollDown();
  }

  // ---------- olay akışı ----------
  function onEvent(ev) {
    const v = tasks.get(ev.taskId);
    if (!v) { early.push(ev); if (early.length > 600) early = early.slice(-300); return; }
    if (ev.sessionId && !v.done) st.session = { id: ev.sessionId, engine: v.engine.id, cwd: v.cwd };
    const d = ev.data || {};
    if (ev.type === 'message.delta') addText(v, String(d.text || ''));
    else if (ev.type === 'tool.invoked') addTool(v, d);
    else if (ev.type === 'tool.completed') toolDone(v, d);
    else if (ev.type === 'usage.updated') { const u = d.usage || {}; v.tin += Number(u.input_tokens ?? u.input ?? 0) || 0; v.tout += Number(u.output_tokens ?? u.output ?? 0) || 0; }
    else if (ev.type === 'task.completed') finish(v, 'completed', d);
    else if (ev.type === 'task.failed') finish(v, 'failed', d);
    else if (ev.type === 'task.cancelled') finish(v, 'cancelled', d);
  }
  function connect() {
    const es = new EventSource('/stream');
    es.addEventListener('observatory', (m) => { try { onEvent(JSON.parse(m.data)); } catch { /* bozuk olay */ } });
    es.onopen = () => { $('#foot').dataset.conn = '1'; refreshFoot(); };
    es.onerror = () => { $('#foot').textContent = 'Bağlantı koptu, yeniden deneniyor...'; };
  }

  // ---------- gönderme ----------
  async function send() {
    if (st.running) { stop(); return; }
    const box = $('#prompt'); const text = box.value.trim();
    if (!text) return;
    const e = eng(); const m = e.models.find((x) => x.id === st.model);
    addUser(text); box.value = ''; autosize();
    const view = addBot(e, m.label, st.cwd);
    const resume = st.session && st.session.engine === st.engine && st.session.cwd === st.cwd ? st.session.id : undefined;
    st.running = 'pending'; refreshSend();
    try {
      const r = await api('/api/run', { engine: st.engine, model: st.model, effort: e.efforts.length ? st.effort : undefined, prompt: text, mode: st.mode, cwd: st.cwd, sessionId: resume });
      view.taskId = r.taskId; tasks.set(r.taskId, view); st.running = r.taskId;
      const buffered = early.filter((x) => x.taskId === r.taskId); early = early.filter((x) => x.taskId !== r.taskId);
      buffered.forEach(onEvent);
      refreshSend();
    } catch (err) {
      view.dots.remove(); view.done = true; st.running = null;
      view.content.appendChild(el('div', 'notice', err.message));
      refreshSend(); refreshConfig();
    }
  }
  async function stop() {
    const id = st.running; if (!id || id === 'pending') return;
    try { await api('/api/cancel', { taskId: id }); } catch { /* zaten bitmiş olabilir */ }
  }

  // ---------- kontroller ----------
  function autosize() { const b = $('#prompt'); b.style.height = 'auto'; b.style.height = Math.min(b.scrollHeight, 220) + 'px'; refreshSend(); }
  function refreshSend() {
    const b = $('#send'); const running = !!st.running;
    b.innerHTML = running ? ICON.stop : ICON.up;
    b.setAttribute('aria-label', running ? 'Durdur' : 'Gönder');
    b.disabled = running ? st.running === 'pending' : !$('#prompt').value.trim();
    $('#newChat').disabled = running;
  }
  function shortModel(m) { return m.label.replace(/^Claude /, ''); }
  function refreshControls() {
    const e = eng(); const m = e.models.find((x) => x.id === st.model);
    $('#modelDot').style.setProperty('--c', e.color);
    $('#modelLabel').textContent = shortModel(m) + (e.efforts.length ? ' · ' + (EFFORT[st.effort] || st.effort) : '');
    $('#projectIco').innerHTML = ICON.folder;
    $('#projectLabel').textContent = (st.cwd.split(/[\\/]/).filter(Boolean).pop()) || 'Klasör';
    $('#projectBtn').title = st.cwd;
    document.querySelectorAll('.chev').forEach((c) => { c.innerHTML = ICON.chev; });
    const mb = $('#modeBtn'); const write = st.mode === 'write';
    mb.disabled = !e.write; mb.classList.toggle('on', write);
    $('#modeIco').innerHTML = write ? ICON.pen : ICON.lock;
    $('#modeLabel').textContent = write ? 'Yazabilir' : 'Salt okunur';
    mb.title = !e.write ? e.label + ': yazma kipi yok' : write ? 'Ajan seçili klasörde dosya değiştirebilir' : 'Dosyalar değiştirilmez';
    refreshFoot();
  }
  function refreshFoot() {
    const e = eng(); const f = $('#foot');
    f.textContent = (e.note ? e.note + ' ' : '') + (st.mode === 'write' ? 'Yazma açık.' : '');
  }
  function renderEngineStatus() {
    const box = $('#engineStatus'); box.replaceChildren();
    st.cfg.engines.forEach((e) => {
      const c = el('span', 'eng' + (!e.installed || e.limitedUntil ? ' off' : '')); c.style.setProperty('--c', e.color);
      const label = e.limitedUntil ? `${e.label} · limit ${new Date(e.limitedUntil).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'e kadar` : !e.installed ? `${e.label} · kurulu değil` : e.label;
      c.append(el('i'), document.createTextNode(label)); box.appendChild(c);
    });
  }
  function closeMenus() { $('#modelMenu').hidden = true; $('#projectMenu').hidden = true; }
  function pick(engineId, modelId) {
    const e = eng(engineId); st.engine = engineId; st.model = modelId;
    if (!e.efforts.includes(st.effort)) st.effort = e.efforts.includes('medium') ? 'medium' : e.efforts[0] || '';
    if (!e.write) st.mode = 'read';
    save(); refreshControls(); openModelMenu(true);
  }
  function openModelMenu(keep) {
    const menu = $('#modelMenu');
    if (!keep && !menu.hidden) { menu.hidden = true; return; }
    $('#projectMenu').hidden = true;
    menu.replaceChildren();
    st.cfg.engines.forEach((e) => e.models.forEach((m) => {
      const blocked = !e.installed ? 'kurulu değil' : e.limitedUntil ? 'kota dolu' : '';
      const b = el('button', 'item'); b.type = 'button'; b.disabled = !!blocked; b.setAttribute('role', 'option');
      const dot = el('span', 'dot'); dot.style.setProperty('--c', e.color);
      const txt = el('span'); txt.append(el('div', 't', m.label), el('div', 's', `${e.label} · ${m.sub}`));
      if (blocked) txt.appendChild(el('div', 'b', blocked));
      const ck = el('span', 'check'); if (e.id === st.engine && m.id === st.model) ck.innerHTML = ICON.check;
      b.append(dot, txt, ck); b.onclick = () => pick(e.id, m.id); menu.appendChild(b);
    }));
    const e = eng(); const box = el('div', 'effort');
    const row = el('div', 'row'); row.append(el('span', '', 'Düşünme çabası'), el('span', '', e.efforts.length ? EFFORT[st.effort] || '' : 'bu motorda yok')); box.appendChild(row);
    const seg = el('div', 'seg');
    (e.efforts.length ? e.efforts : ['—']).forEach((x) => {
      const b = el('button', x === st.effort ? 'on' : '', EFFORT[x] || x); b.type = 'button'; b.disabled = !e.efforts.length;
      b.onclick = () => { st.effort = x; save(); refreshControls(); openModelMenu(true); }; seg.appendChild(b);
    });
    box.appendChild(seg); menu.appendChild(box); menu.hidden = false;
  }
  function openProjectMenu() {
    const menu = $('#projectMenu');
    if (!menu.hidden) { menu.hidden = true; return; }
    $('#modelMenu').hidden = true; menu.replaceChildren();
    st.cfg.projects.forEach((p) => {
      const b = el('button', 'item'); b.type = 'button';
      const ic = el('span', 'ico'); ic.innerHTML = ICON.folder;
      const txt = el('span'); txt.append(el('div', 't', p.name), el('div', 's', p.path));
      const ck = el('span', 'check'); if (p.path === st.cwd) ck.innerHTML = ICON.check;
      b.append(ic, txt, ck); b.onclick = () => { st.cwd = p.path; save(); refreshControls(); closeMenus(); }; menu.appendChild(b);
    });
    menu.hidden = false;
  }
  async function refreshConfig() {
    try { st.cfg = await api('/api/config'); renderEngineStatus(); } catch { /* sunucu yok */ }
  }
  function newChat() {
    $('#thread').replaceChildren(); tasks.clear(); st.session = null;
    $('#empty').hidden = false; $('#chips').hidden = false; $('#prompt').focus();
  }

  async function init() {
    st.cfg = await api('/api/config');
    let saved = {}; try { saved = JSON.parse(localStorage.getItem('obs-web') || '{}'); } catch { /* yoksay */ }
    const e0 = st.cfg.engines.find((e) => e.id === saved.engine && e.installed && !e.limitedUntil) || st.cfg.engines.find((e) => e.installed && !e.limitedUntil) || st.cfg.engines[0];
    st.engine = e0.id;
    st.model = e0.models.some((m) => m.id === saved.model) ? saved.model : e0.models[0].id;
    st.effort = e0.efforts.includes(saved.effort) ? saved.effort : e0.efforts.includes('medium') ? 'medium' : e0.efforts[0] || '';
    st.cwd = st.cfg.projects.some((p) => p.path === saved.cwd) ? saved.cwd : st.cfg.defaultCwd;
    renderEngineStatus(); refreshControls(); refreshSend();
    const chips = $('#chips'); SUGGEST.forEach((s) => { const b = el('button', 'chip', s); b.type = 'button'; b.onclick = () => { $('#prompt').value = s; autosize(); $('#prompt').focus(); }; chips.appendChild(b); });
    $('#send').onclick = send;
    $('#newChat').onclick = newChat;
    $('#modelBtn').onclick = (ev) => { ev.stopPropagation(); openModelMenu(); };
    $('#projectBtn').onclick = (ev) => { ev.stopPropagation(); openProjectMenu(); };
    $('#modeBtn').onclick = () => { if (eng().write) { st.mode = st.mode === 'write' ? 'read' : 'write'; refreshControls(); } };
    $('#prompt').addEventListener('input', autosize);
    $('#prompt').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); send(); } });
    document.addEventListener('click', (ev) => { if (!ev.target.closest('.menu')) closeMenus(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeMenus(); });
    connect(); $('#prompt').focus();
  }
  init().catch((err) => { $('#foot').textContent = 'Başlatılamadı: ' + err.message; });
})();
