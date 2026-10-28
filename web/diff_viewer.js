// Diff Viewer: görev bittiğinde veya onay aşamasında çok dosyalı `git diff` çıktısını dosya başına sekmelerle gösterir.
// Satır çizimini web/diff.js (ObsDiff) yapar. Tarayıcıda window.ObsDiffViewer, Node.js altında module.exports.
(function (root) {
  'use strict';

  function getDiff() {
    if (root.ObsDiff) return root.ObsDiff;
    if (typeof require === 'function') return require('./diff.js');
    throw new Error('ObsDiff yüklenmedi');
  }

  /** Çok dosyalı unified diff'i dosya başına ayrıştırır: [{ file, add, del, lines, status }]. */
  function parseGitDiff(text) {
    var D = getDiff();
    var raw = String(text || '').replace(/\r/g, '');
    if (!raw.trim()) return [];
    var chunks = raw.split(/^(?=diff --git )/m).filter(function (c) { return c.trim(); });
    return chunks.map(function (chunk) {
      var p = D.parseUnifiedDiff(chunk);
      var status = 'modified';
      if (/^new file mode/m.test(chunk) || /^--- \/dev\/null/m.test(chunk)) status = 'added';
      else if (/^deleted file mode/m.test(chunk) || /^\+\+\+ \/dev\/null/m.test(chunk)) status = 'deleted';
      else if (/^rename from /m.test(chunk)) status = 'renamed';
      if (status === 'deleted') {
        var m = /^diff --git a\/(.*) b\//.exec(chunk);
        if (m) p.file = m[1];
      }
      p.status = status;
      return p;
    });
  }

  function totals(files) {
    return files.reduce(function (t, f) { t.add += f.add; t.del += f.del; return t; }, { files: files.length, add: 0, del: 0 });
  }

  /**
   * Sekmeli görüntüleyiciyi çizer. opts: { approval: bool, onApprove(), onReject() }.
   * approval=true ise Onayla / Reddet düğmeleri eklenir.
   * Döner: { el, select(i), files }.
   */
  function render(doc, parent, diffText, opts) {
    opts = opts || {};
    var D = getDiff();
    var files = parseGitDiff(diffText);
    var wrap = doc.createElement('div');
    wrap.className = 'dv';

    if (!files.length) {
      var empty = doc.createElement('div');
      empty.className = 'dv-empty';
      empty.textContent = 'Değişiklik yok';
      wrap.appendChild(empty);
      parent.appendChild(wrap);
      return { el: wrap, select: function () {}, files: files };
    }

    var t = totals(files);
    var summary = doc.createElement('div');
    summary.className = 'dv-summary';
    summary.textContent = t.files + ' dosya · +' + t.add + ' −' + t.del;

    var tabs = doc.createElement('div');
    tabs.className = 'dv-tabs';
    var panel = doc.createElement('div');
    panel.className = 'dv-panel';
    var tabEls = [];

    function select(i) {
      tabEls.forEach(function (el, j) { el.classList.toggle('is-active', j === i); });
      if (panel.replaceChildren) panel.replaceChildren(); else panel.textContent = '';
      var f = files[i];
      D.renderDiff(doc, panel, {
        action: f.status === 'added' ? 'Added' : f.status === 'deleted' ? 'Deleted' : f.status === 'renamed' ? 'Renamed' : 'Updated',
        file: D.shortPath(f.file), fullPath: f.file, add: f.add, del: f.del, lines: f.lines
      }, { maxLines: 200 });
    }

    files.forEach(function (f, i) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'dv-tab dv-' + f.status;
      b.title = f.file;
      b.textContent = D.shortPath(f.file).split('/').pop() + ' +' + f.add + ' −' + f.del;
      b.onclick = function () { select(i); };
      tabEls.push(b);
      tabs.appendChild(b);
    });

    wrap.append(summary, tabs, panel);

    if (opts.approval) {
      var bar = doc.createElement('div');
      bar.className = 'dv-actions';
      var ok = doc.createElement('button'); ok.type = 'button'; ok.className = 'dv-approve'; ok.textContent = 'Onayla';
      var no = doc.createElement('button'); no.type = 'button'; no.className = 'dv-reject'; no.textContent = 'Reddet';
      ok.onclick = function () { if (opts.onApprove) opts.onApprove(); };
      no.onclick = function () { if (opts.onReject) opts.onReject(); };
      bar.append(ok, no);
      wrap.appendChild(bar);
    }

    parent.appendChild(wrap);
    select(0);
    return { el: wrap, select: select, files: files };
  }

  root.ObsDiffViewer = { parseGitDiff: parseGitDiff, totals: totals, render: render };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ObsDiffViewer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
