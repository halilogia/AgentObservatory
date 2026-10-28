// Mission Composer: görev tanımlama formu ve mod seçimi (Direct / Planned / Verified).
// Saf mantık (doğrulama, yük üretimi) + DOM oluşturucu. Tarayıcıda window.ObsMissionComposer, Node.js altında module.exports.
(function (root) {
  'use strict';

  var MODES = [
    { id: 'direct', label: 'Direct', hint: 'Tek ajan, tek deneme, plan yok' },
    { id: 'planned', label: 'Planned', hint: 'Görev ağacına bölünür, ajanlara dağıtılır' },
    { id: 'verified', label: 'Verified', hint: 'Plan + test kapısı + kırmızı takım denetimi' }
  ];

  function lines(s) {
    return String(s == null ? '' : s).split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function modeIds() { return MODES.map(function (m) { return m.id; }); }

  /** Form değerlerini doğrular; hata mesajı dizisi döner (boşsa geçerli). */
  function validateForm(f) {
    var errors = [];
    f = f || {};
    if (!String(f.objective || '').trim()) errors.push('Hedef boş olamaz');
    if (!String(f.repoPath || '').trim()) errors.push('Proje yolu zorunlu');
    if (modeIds().indexOf(f.mode) < 0) errors.push('Geçersiz mod');
    if (f.mode === 'verified' && lines(f.testCommands).length === 0) errors.push('Verified modda en az bir test komutu gerekli');
    var mt = f.timeoutMinutes;
    if (mt !== undefined && mt !== '' && !(Number(mt) > 0)) errors.push("Süre sınırı 0'dan büyük olmalı");
    return errors;
  }

  /** Form → sunucuya gönderilecek MissionContractInput. */
  function buildPayload(f) {
    var out = {
      objective: String(f.objective || '').trim(),
      mode: f.mode || 'direct',
      repoPath: String(f.repoPath || '').trim()
    };
    if (String(f.title || '').trim()) out.title = String(f.title).trim();
    var inc = lines(f.includePaths), exc = lines(f.excludePaths), tests = lines(f.testCommands);
    if (inc.length) out.includePaths = inc;
    if (exc.length) out.excludePaths = exc;
    if (tests.length) out.testCommands = tests;
    if (f.timeoutMinutes !== undefined && f.timeoutMinutes !== '') out.timeoutMinutes = Number(f.timeoutMinutes);
    return out;
  }

  function field(doc, labelText, control) {
    var wrap = doc.createElement('label');
    wrap.className = 'mc-field';
    var span = doc.createElement('span');
    span.className = 'mc-label';
    span.textContent = labelText;
    wrap.append(span, control);
    return wrap;
  }

  /**
   * Formu parent içine çizer. opts: { repoPath, mode, onSubmit(payload) }.
   * Döner: { el, getValues(), setMode(id) }.
   */
  function render(doc, parent, opts) {
    opts = opts || {};
    var state = { mode: opts.mode || 'direct' };
    var form = doc.createElement('form');
    form.className = 'mc-form';

    var modeBar = doc.createElement('div');
    modeBar.className = 'mc-modes';
    var modeBtns = {};
    var hint = doc.createElement('div');
    hint.className = 'mc-hint';

    function setMode(id) {
      state.mode = id;
      MODES.forEach(function (m) {
        var on = m.id === id;
        modeBtns[m.id].classList.toggle('is-active', on);
        modeBtns[m.id].setAttribute('aria-pressed', on ? 'true' : 'false');
        if (on) hint.textContent = m.hint;
      });
    }
    MODES.forEach(function (m) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'mc-mode';
      b.dataset.mode = m.id;
      b.textContent = m.label;
      b.onclick = function () { setMode(m.id); };
      modeBtns[m.id] = b;
      modeBar.appendChild(b);
    });

    var title = doc.createElement('input'); title.type = 'text'; title.className = 'mc-title';
    var objective = doc.createElement('textarea'); objective.className = 'mc-objective'; objective.rows = 4;
    var repo = doc.createElement('input'); repo.type = 'text'; repo.className = 'mc-repo'; repo.value = opts.repoPath || '';
    var tests = doc.createElement('textarea'); tests.className = 'mc-tests'; tests.rows = 2;
    var inc = doc.createElement('textarea'); inc.className = 'mc-include'; inc.rows = 2;
    var exc = doc.createElement('textarea'); exc.className = 'mc-exclude'; exc.rows = 2;
    var timeout = doc.createElement('input'); timeout.type = 'number'; timeout.className = 'mc-timeout'; timeout.value = '30'; timeout.min = '1';

    var errBox = doc.createElement('div');
    errBox.className = 'mc-errors';
    var submit = doc.createElement('button');
    submit.type = 'submit';
    submit.className = 'mc-submit';
    submit.textContent = 'Başlat';

    function getValues() {
      return {
        title: title.value, objective: objective.value, mode: state.mode, repoPath: repo.value,
        testCommands: tests.value, includePaths: inc.value, excludePaths: exc.value, timeoutMinutes: timeout.value
      };
    }

    form.append(
      modeBar, hint,
      field(doc, 'Başlık (isteğe bağlı)', title),
      field(doc, 'Hedef', objective),
      field(doc, 'Proje yolu', repo),
      field(doc, 'Test komutları (satır başına bir)', tests),
      field(doc, 'Dahil yollar', inc),
      field(doc, 'Hariç yollar', exc),
      field(doc, 'Süre sınırı (dk)', timeout),
      errBox, submit
    );
    form.onsubmit = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      var values = getValues();
      var errors = validateForm(values);
      errBox.textContent = errors.join(' · ');
      if (errors.length) return false;
      if (opts.onSubmit) opts.onSubmit(buildPayload(values));
      return false;
    };

    setMode(state.mode);
    parent.appendChild(form);
    return { el: form, getValues: getValues, setMode: setMode };
  }

  root.ObsMissionComposer = { MODES: MODES, validateForm: validateForm, buildPayload: buildPayload, render: render };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ObsMissionComposer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
