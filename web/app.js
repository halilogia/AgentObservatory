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
    plus: svg('<path d="M8 3v10M3 8h10"/>'),
    panel: svg('<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6 3v10"/>'),
    x: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
    stop: '<svg viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor"/></svg>'
  };
  const EFFORT = { low: 'Düşük', medium: 'Orta', high: 'Yüksek', xhigh: 'X-yüksek', max: 'Maks' };
  const SUGGEST = ['Bu klasörün yapısını kısaca özetle', 'Son git değişikliklerini açıkla', 'README dosyasında eksik olan neler?', 'Testleri nasıl çalıştırırım?'];
  const st = { cfg: null, engine: 'claude', model: 'sonnet', effort: 'medium', mode: 'read', cwd: '', running: null };
  const views = new Map();
  let chat = null;
  let early = [];
  let stick = true;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const engineById = (id) => st.cfg.engines.find((e) => e.id === id);
  const fmtTok = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n));
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* yoksay */ } };
  const saveSettings = () => lsSet('obs-web', JSON.stringify({ engine: st.engine, model: st.model, effort: st.effort, cwd: st.cwd }));

  async function api(path, body) {
    const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-observatory-token': TOKEN }, body: JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch { /* gövde yok */ }
    if (!r.ok) throw Object.assign(new Error(j.error || 'istek başarısız (' + r.status + ')'), { info: j });
    return j;
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
      const t = el('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { /* yoksay */ } t.remove();
    }
    if (btn) { const old = btn.textContent; btn.textContent = 'Kopyalandı'; setTimeout(() => { btn.textContent = old; }, 1200); }
  }
  const renderMd = (box, text) => ObsMd.render(document, box, text, { onCopy: copyText });

  function toolSummary(name, input) {
    const o = input && typeof input === 'object' ? input : {};
    const v = o.command ?? o.CommandLine ?? o.cmd ?? o.file_path ?? o.filePath ?? o.path ?? o.pattern ?? o.query ?? Object.values(o).find((x) => typeof x === 'string') ?? '';
    return String(v).replace(/\s+/g, ' ').slice(0, 140);
  }
  function friendlyError(d) {
    const kind = d.errorKind;
    const mins = d.cooldownMs ? Math.max(1, Math.round(d.cooldownMs / 60000)) : 0;
    if (kind === 'rate_limit') return 'Kota doldu' + (mins ? ` (yaklaşık ${mins >= 90 ? Math.round(mins / 60) + ' saat' : mins + ' dk'} sonra açılır)` : '') + '.';
    if (kind === 'auth') return 'Giriş gerekli: ilgili CLI\'da oturum aç.';
    if (kind === 'model_unsupported') return 'Bu model hesapta desteklenmiyor.';
    if (kind === 'permission') return 'İzin gerekiyor. Yazabilir kipini destekleyen bir motor seç ya da isteği salt okunur yap.';
    if (kind === 'spawn_failed') return 'Program başlatılamadı. Terminalde "observatory doctor" çalıştır.';
    return String(d.error || d.reason || 'Görev başarısız oldu.').split('\n')[0].slice(0, 300);
  }

  // ---------- sohbet verisi ve geçmiş ----------
  function ensureChat(firstText) {
    if (chat) return;
    chat = { id: ObsStore.newId(), title: firstText.replace(/\s+/g, ' ').slice(0, 48), created: Date.now(), updated: Date.now(), session: null, messages: [] };
  }
  function persist() { if (chat && chat.messages.length) { ObsStore.save(chat); renderHistory(); } }
  function when(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'şimdi'; if (m < 60) return m + ' dk'; if (m < 1440) return Math.round(m / 60) + ' sa';
    return new Date(ts).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  }
  function renderHistory() {
    const box = $('#history'); box.replaceChildren();
    const list = ObsStore.list();
    if (!list.length) { box.appendChild(el('div', 'hempty', 'Henüz sohbet yok.')); return; }
    const day = (ts) => { const d = new Date(ts), n = new Date(); const diff = Math.floor((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5); return diff <= 0 ? 'Bugün' : diff === 1 ? 'Dün' : 'Daha önce'; };
    let last = '';
    list.forEach((c) => {
      const g = day(c.updated); if (g !== last) { box.appendChild(el('div', 'hgroup', g)); last = g; }
      const item = el('div', 'hitem' + (chat && chat.id === c.id ? ' on' : ''));
      const main1 = el('button', 'hmain'); main1.type = 'button'; main1.title = c.title;
      const lastBot = [...c.messages].reverse().find((m) => m.r === 'b');
      const dot = el('span', 'dot'); if (lastBot) dot.style.setProperty('--c', lastBot.color);
      main1.append(dot, el('span', 't', c.title || 'Sohbet'), el('span', 'when', when(c.updated)));
      main1.onclick = () => loadChat(c.id);
      const del = el('button', 'del'); del.type = 'button'; del.setAttribute('aria-label', 'Sohbeti sil'); del.innerHTML = ICON.x;
      del.onclick = (ev) => { ev.stopPropagation(); ObsStore.remove(c.id); if (chat && chat.id === c.id) newChat(); else renderHistory(); };
      item.append(main1, del); box.appendChild(item);
    });
  }
  function clearThread() { $('#thread').replaceChildren(); views.clear(); }
  function showThread(has) { $('#empty').hidden = has; $('#chips').hidden = has; }
  function newChat() {
    if (st.running) return;
    chat = null; clearThread(); showThread(false); renderHistory(); $('#prompt').focus(); stick = true; onScroll();
  }
  function loadChat(id) {
    if (st.running) { $('#foot').textContent = 'Görev çalışırken sohbet değiştirilemez.'; return; }
    const c = ObsStore.get(id); if (!c) return;
    chat = c; clearThread(); showThread(true);
    c.messages.forEach((m) => { if (m.r === 'u') addUserDom(m.text); else createBot(m, false); });
    const lastBot = [...c.messages].reverse().find((m) => m.r === 'b');
    if (lastBot && engineById(lastBot.engine)) {
      st.engine = lastBot.engine; st.model = lastBot.model; if (lastBot.effort) st.effort = lastBot.effort;
      if (st.cfg.projects.some((p) => p.path === lastBot.cwd)) st.cwd = lastBot.cwd;
      if (!engineById(st.engine).write) st.mode = 'read';
    }
    refreshControls(); renderHistory(); closeNavOnMobile(); scrollDown(true); onScroll();
  }

  // ---------- mesaj DOM'u ----------
  function addUserDom(text) { showThread(true); $('#thread').appendChild(el('div', 'msg user', text)); scrollDown(); }
  function fullText(rec) { return rec.parts.filter((p) => p.k === 'text').map((p) => p.v).join('\n\n'); }

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
      if (rec.notice) content.appendChild(el('div', 'notice' + (rec.notice.warn ? ' warn' : ''), rec.notice.text));
      renderMeta(v);
    }
    scrollDown();
    return v;
  }
  function engineLabel(rec) { const e = st.cfg && engineById(rec.engine); return e ? e.label : rec.engine; }

  function addText(v, t) {
    if (!t) return;
    if (!v.curText) { const part = { k: 'text', v: '' }; v.rec.parts.push(part); v.curText = { part, box: el('div') }; v.content.appendChild(v.curText.box); }
    v.curText.part.v += t;
    if (!v.raf) v.raf = requestAnimationFrame(() => { v.raf = 0; if (v.curText) renderMd(v.curText.box, v.curText.part.v); scrollDown(); });
  }
  function buildTool(v, part, withOut) {
    const det = el('details', 'tool'); const sum = el('summary');
    sum.append(el('span', 'tn', part.name || 'araç'), el('span', 'ts', part.summary || ''));
    det.appendChild(sum); v.content.appendChild(det);
    if (withOut && part.out) { const pre = el('pre'); pre.appendChild(el('code', '', part.out)); det.appendChild(pre); }
    return det;
  }
  function addTool(v, d) {
    v.curText = null;
    const part = { k: 'tool', name: d.name || 'araç', summary: toolSummary(d.name, d.input), out: '' };
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
    if (v.rec.meta) v.meta.appendChild(el('span', '', v.rec.meta));
    if (fullText(v.rec)) { const b = el('button', '', 'Kopyala'); b.type = 'button'; b.onclick = () => copyText(fullText(v.rec), b); v.meta.appendChild(b); }
  }
  function retryRow(v) {
    const others = st.cfg.engines.filter((e) => e.id !== v.rec.engine && e.installed && !e.limitedUntil);
    if (!others.length || !v.rec.prompt) return;
    const row = el('div', 'retry'); row.appendChild(el('span', '', 'Başka motorla dene:'));
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
    if (kind === 'failed') notice = { text: friendlyError(d || {}) };
    else if (kind === 'cancelled') notice = { text: 'Görev iptal edildi.', warn: true };
    else if (kind === 'completed' && !fullText(v.rec)) notice = { warn: true, text: 'Motor yanıt metni üretmedi' + (v.tools.size ? ' (yalnızca araç çalıştırdı; araç kartlarını aç).' : '.') + ' Çok büyük bir klasörde çalışıyorsan daha küçük bir proje seç.' };
    if (notice) { v.rec.notice = notice; v.content.appendChild(el('div', 'notice' + (notice.warn ? ' warn' : ''), notice.text)); }
    if (kind === 'failed') retryRow(v);
    const sec = Math.round((Date.now() - v.t0) / 1000);
    v.rec.meta = [sec + ' sn', v.tin ? 'giriş ' + fmtTok(v.tin) : '', v.tout ? 'çıkış ' + fmtTok(v.tout) : ''].filter(Boolean).join(' · ');
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
    es.onerror = () => { $('#foot').textContent = 'Bağlantı koptu, yeniden deneniyor...'; };
  }

  // ---------- gönderme ----------
  async function runPrompt(text, o = {}) {
    if (st.running || !text.trim()) return;
    ensureChat(text);
    const e = engineById(st.engine); const m = e.models.find((x) => x.id === st.model);
    if (o.bubble !== false) { chat.messages.push({ r: 'u', text }); addUserDom(text); }
    const rec = { r: 'b', engine: e.id, model: m.id, label: m.label, color: e.color, parts: [], notice: null, meta: '', prompt: text, cwd: st.cwd, taskId: null, effort: e.efforts.length ? st.effort : '' };
    chat.messages.push(rec);
    const view = createBot(rec, true);
    const resume = chat.session && chat.session.engine === e.id && chat.session.cwd === st.cwd ? chat.session.id : undefined;
    st.running = 'pending'; stick = true; refreshSend(); persist();
    try {
      const r = await api('/api/run', { engine: e.id, model: m.id, effort: e.efforts.length ? st.effort : undefined, prompt: text, mode: e.write ? st.mode : 'read', cwd: st.cwd, sessionId: resume });
      rec.taskId = r.taskId; views.set(r.taskId, view); st.running = r.taskId;
      const buffered = early.filter((x) => x.taskId === r.taskId); early = early.filter((x) => x.taskId !== r.taskId);
      buffered.forEach(onEvent); refreshSend();
    } catch (err) {
      view.dots.remove(); view.done = true; st.running = null;
      rec.notice = { text: err.message }; view.content.appendChild(el('div', 'notice', err.message));
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
    b.setAttribute('aria-label', running ? 'Durdur' : 'Gönder');
    b.disabled = running ? st.running === 'pending' : !$('#prompt').value.trim();
    $('#newChat').disabled = running;
  }
  const shortModel = (m) => m.label.replace(/^Claude /, '');
  function refreshControls() {
    const e = engineById(st.engine); const m = e.models.find((x) => x.id === st.model);
    $('#modelDot').style.setProperty('--c', e.color);
    $('#modelLabel').textContent = shortModel(m) + (e.efforts.length ? ' · ' + (EFFORT[st.effort] || st.effort) : '');
    $('#projectIco').innerHTML = ICON.folder;
    $('#projectLabel').textContent = st.cwd.split(/[\\/]/).filter(Boolean).pop() || 'Klasör';
    $('#projectBtn').title = st.cwd;
    document.querySelectorAll('.chev').forEach((c) => { c.innerHTML = ICON.chev; });
    const mb = $('#modeBtn'); const write = st.mode === 'write' && e.write;
    mb.disabled = !e.write; mb.classList.toggle('on', write);
    $('#modeIco').innerHTML = write ? ICON.pen : ICON.lock;
    $('#modeLabel').textContent = write ? 'Yazabilir' : 'Salt okunur';
    mb.title = !e.write ? e.label + ': yazma kipi yok' : write ? 'Ajan seçili klasörde dosya değiştirebilir' : 'Dosyalar değiştirilmez';
    refreshFoot();
  }
  function refreshFoot() { const e = engineById(st.engine); $('#foot').textContent = (e.note ? e.note + ' ' : '') + (st.mode === 'write' && e.write ? 'Yazma açık.' : ''); }
  function renderEngineStatus() {
    const box = $('#engineStatus'); box.replaceChildren();
    st.cfg.engines.forEach((e) => {
      const c = el('span', 'eng' + (!e.installed || e.limitedUntil ? ' off' : '')); c.style.setProperty('--c', e.color);
      const label = e.limitedUntil ? `${e.label} · limit ${new Date(e.limitedUntil).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'e kadar` : !e.installed ? `${e.label} · kurulu değil` : e.label;
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
    $('#projectMenu').hidden = true; hideSlash(); menu.replaceChildren();
    st.cfg.engines.forEach((e) => e.models.forEach((m) => {
      const blocked = !e.installed ? 'kurulu değil' : e.limitedUntil ? 'kota dolu' : '';
      const b = el('button', 'item'); b.type = 'button'; b.disabled = !!blocked; b.setAttribute('role', 'option');
      const dot = el('span', 'dot'); dot.style.setProperty('--c', e.color);
      const txt = el('span'); txt.append(el('div', 't', m.label), el('div', 's', `${e.label} · ${m.sub}`));
      if (blocked) txt.appendChild(el('div', 'b', blocked));
      const ck = el('span', 'check'); if (e.id === st.engine && m.id === st.model) ck.innerHTML = ICON.check;
      b.append(dot, txt, ck); b.onclick = () => pick(e.id, m.id); menu.appendChild(b);
    }));
    const e = engineById(st.engine); const box = el('div', 'effort');
    const row = el('div', 'row'); row.append(el('span', '', 'Düşünme çabası'), el('span', '', e.efforts.length ? EFFORT[st.effort] || '' : 'bu motorda yok')); box.appendChild(row);
    const seg = el('div', 'seg');
    (e.efforts.length ? e.efforts : ['—']).forEach((x) => {
      const b = el('button', x === st.effort ? 'on' : '', EFFORT[x] || x); b.type = 'button'; b.disabled = !e.efforts.length;
      b.onclick = () => { st.effort = x; saveSettings(); refreshControls(); openModelMenu(true); }; seg.appendChild(b);
    });
    box.appendChild(seg); menu.appendChild(box); menu.hidden = false; placeMenu(menu);
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
      b.append(ic, txt, ck); b.onclick = () => { st.cwd = p.path; saveSettings(); refreshControls(); closeMenus(); }; menu.appendChild(b);
    });
    menu.hidden = false; placeMenu(menu);
  }
  function toggleMode() { if (engineById(st.engine).write) { st.mode = st.mode === 'write' ? 'read' : 'write'; refreshControls(); } }

  // ---------- / komutları ----------
  const COMMANDS = [
    { name: '/model', desc: 'Modeli ve düşünme çabasını seç', run: () => openModelMenu() },
    { name: '/yeni', desc: 'Yeni sohbet başlat', run: () => newChat() },
    { name: '/klasor', desc: 'Çalışma klasörünü seç', run: () => openProjectMenu() },
    { name: '/yaz', desc: 'Yazma kipini aç veya kapat', run: () => toggleMode() },
    { name: '/gecmis', desc: 'Sohbet geçmişini aç veya kapat', run: () => toggleNav() },
    { name: '/kopyala', desc: 'Son yanıtı panoya kopyala', run: () => { const b = [...(chat ? chat.messages : [])].reverse().find((m) => m.r === 'b'); if (b) copyText(fullText(b)); } }
  ];
  let slashIdx = 0, slashList = [];
  function hideSlash() { $('#slashMenu').hidden = true; slashList = []; }
  function updateSlash() {
    const v = $('#prompt').value;
    if (!/^\/[^\s]*$/.test(v)) { hideSlash(); return; }
    slashList = COMMANDS.filter((c) => c.name.startsWith(v.toLowerCase()));
    if (!slashList.length) { hideSlash(); return; }
    slashIdx = Math.min(slashIdx, slashList.length - 1);
    const menu = $('#slashMenu'); menu.replaceChildren();
    slashList.forEach((c, i) => {
      const b = el('button', 'item' + (i === slashIdx ? ' sel' : '')); b.type = 'button';
      b.append(el('span', 't', c.name), el('span', 's', c.desc)); b.onclick = () => runSlash(c); menu.appendChild(b);
    });
    $('#modelMenu').hidden = true; $('#projectMenu').hidden = true; menu.hidden = false; placeMenu(menu);
  }
  function runSlash(c) { $('#prompt').value = ''; autosize(); hideSlash(); c.run(); }

  // ---------- kenar çubuğu ----------
  const narrow = () => window.matchMedia('(max-width: 860px)').matches;
  function toggleNav() {
    const l = $('#layout');
    if (narrow()) l.classList.toggle('nav-open');
    else { l.classList.toggle('nav-closed'); lsSet('obs-nav', l.classList.contains('nav-closed') ? 'closed' : 'open'); }
  }
  function closeNavOnMobile() { $('#layout').classList.remove('nav-open'); }

  async function refreshConfig() { try { st.cfg = await api('/api/config'); renderEngineStatus(); } catch { /* sunucu yok */ } }

  async function init() {
    st.cfg = await api('/api/config');
    let saved = {}; try { saved = JSON.parse(lsGet('obs-web') || '{}'); } catch { /* yoksay */ }
    const e0 = st.cfg.engines.find((e) => e.id === saved.engine && e.installed && !e.limitedUntil) || st.cfg.engines.find((e) => e.installed && !e.limitedUntil) || st.cfg.engines[0];
    st.engine = e0.id;
    st.model = e0.models.some((m) => m.id === saved.model) ? saved.model : e0.models[0].id;
    st.effort = e0.efforts.includes(saved.effort) ? saved.effort : e0.efforts.includes('medium') ? 'medium' : e0.efforts[0] || '';
    st.cwd = st.cfg.projects.some((p) => p.path === saved.cwd) ? saved.cwd : st.cfg.defaultCwd;
    if (!narrow() && lsGet('obs-nav') === 'closed') $('#layout').classList.add('nav-closed');
    $('#newIco').innerHTML = ICON.plus; $('#sideIco').innerHTML = ICON.panel;
    renderEngineStatus(); refreshControls(); refreshSend(); renderHistory();
    const chips = $('#chips'); SUGGEST.forEach((s) => { const b = el('button', 'chip', s); b.type = 'button'; b.onclick = () => { $('#prompt').value = s; autosize(); $('#prompt').focus(); }; chips.appendChild(b); });
    $('#send').onclick = send; $('#newChat').onclick = newChat;
    $('#sideToggle').onclick = toggleNav; $('#scrim').onclick = closeNavOnMobile;
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
    connect(); $('#prompt').focus();
  }
  init().catch((err) => { $('#foot').textContent = 'Başlatılamadı: ' + err.message; });
})();
