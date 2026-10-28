// Sade Markdown: başlık, liste, tablo, alıntı, kod bloğu, bağlantı, kalın, italik, satır içi kod.
// Güvenlik: HTML üretilmez; her şey DOM düğümü olarak kurulur, bağlantılar yalnızca http(s).
(function (root) {
  'use strict';

  var INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))|(\*[^*\s][^*\n]*\*)/g;

  function parseInline(s) {
    // her çağrıya taze düzenli ifade: özyinelemeli çağrılar ortak lastIndex'i bozup sonsuz döngüye sokardı
    var out = [], last = 0, m, re = new RegExp(INLINE.source, 'g');
    while ((m = re.exec(s))) {
      if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) });
      var tok = m[0];
      if (m[1]) out.push({ t: 'code', v: tok.slice(1, -1) });
      else if (m[2]) out.push({ t: 'strong', c: parseInline(tok.slice(2, -2)) });
      else if (m[3]) { var k = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(tok); out.push({ t: 'link', href: k[2], c: parseInline(k[1]) }); }
      else out.push({ t: 'em', c: parseInline(tok.slice(1, -1)) });
      last = m.index + tok.length;
    }
    if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
    return out;
  }

  var isTableSep = function (l) { return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.indexOf('-') >= 0; };
  var cells = function (l) { return l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); }); };
  var LIST = /^\s*([-*]|\d+\.)\s+/;

  function parse(text) {
    var lines = String(text).replace(/\r/g, '').split('\n'), blocks = [], i = 0;
    while (i < lines.length) {
      var l = lines[i];
      if (/^\s*$/.test(l)) { i++; continue; }
      if (/^\s*```/.test(l)) {
        var mTag = /^\s*```\s*([\w-]+)?/.exec(l);
        var tag = mTag && mTag[1] ? mTag[1].toLowerCase() : '';
        var buf = []; i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
        i++; blocks.push({ t: 'code', lang: tag, v: buf.join('\n') }); continue;
      }
      var h = /^(#{1,4})\s+(.*)$/.exec(l);
      if (h) { blocks.push({ t: 'h', level: h[1].length, c: parseInline(h[2]) }); i++; continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { blocks.push({ t: 'hr' }); i++; continue; }
      if (/^\s*>/.test(l)) {
        var q = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
        blocks.push({ t: 'quote', c: parseInline(q.join('\n')) }); continue;
      }
      if (l.indexOf('|') >= 0 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        var head = cells(l); i += 2; var rows = [];
        while (i < lines.length && lines[i].indexOf('|') >= 0 && !/^\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
        blocks.push({ t: 'table', head: head.map(parseInline), rows: rows.map(function (r) { return r.map(parseInline); }) }); continue;
      }
      if (LIST.test(l)) {
        var ordered = /^\s*\d+\./.test(l), items = [];
        while (i < lines.length && LIST.test(lines[i])) items.push(parseInline(lines[i++].replace(LIST, '')));
        blocks.push({ t: ordered ? 'ol' : 'ul', items: items }); continue;
      }
      var p = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*```/.test(lines[i]) && !/^(#{1,4})\s+/.test(lines[i]) && !LIST.test(lines[i]) && !/^\s*>/.test(lines[i])) p.push(lines[i++]);
      blocks.push({ t: 'p', c: parseInline(p.join('\n')) });
    }
    return blocks;
  }

  function inlineDom(doc, parent, nodes) {
    nodes.forEach(function (n) {
      var e;
      if (n.t === 'text') parent.appendChild(doc.createTextNode(n.v));
      else if (n.t === 'code') { e = doc.createElement('code'); e.textContent = n.v; parent.appendChild(e); }
      else if (n.t === 'link') { e = doc.createElement('a'); e.href = n.href; e.target = '_blank'; e.rel = 'noopener noreferrer'; inlineDom(doc, e, n.c); parent.appendChild(e); }
      else { e = doc.createElement(n.t); inlineDom(doc, e, n.c); parent.appendChild(e); }
    });
  }

  /** opts.onCopy(text, btn): verilirse kod bloklarına kopyala düğmesi eklenir (opts.copyLabel: düğme metni) */
  function render(doc, box, text, opts) {
    opts = opts || {};
    box.replaceChildren();
    parse(text).forEach(function (b) {
      var e;
      if (b.t === 'code') {
        if ((b.lang === 'diff' || b.lang === 'patch') && typeof root.ObsDiff !== 'undefined') {
          var parsed = root.ObsDiff.parseUnifiedDiff(b.v);
          if (parsed && parsed.lines && parsed.lines.length) {
            root.ObsDiff.renderDiff(doc, box, {
              action: 'Diff',
              file: parsed.file || 'patch',
              add: parsed.add,
              del: parsed.del,
              lines: parsed.lines
            }, {
              maxLines: 40,
              moreLabel: opts.moreLabel || 'lines'
            });
            return;
          }
        }
        e = doc.createElement('div'); e.className = 'codebox';
        var pre = doc.createElement('pre'), code = doc.createElement('code'); code.textContent = b.v; pre.appendChild(code); e.appendChild(pre);
        if (opts.onCopy) { var btn = doc.createElement('button'); btn.type = 'button'; btn.className = 'copy'; btn.textContent = opts.copyLabel || 'Copy'; btn.onclick = function () { opts.onCopy(b.v, btn); }; e.appendChild(btn); }
      } else if (b.t === 'h') { e = doc.createElement('h' + Math.min(b.level + 2, 5)); inlineDom(doc, e, b.c); }
      else if (b.t === 'hr') e = doc.createElement('hr');
      else if (b.t === 'quote') { e = doc.createElement('blockquote'); inlineDom(doc, e, b.c); }
      else if (b.t === 'ul' || b.t === 'ol') { e = doc.createElement(b.t); b.items.forEach(function (it) { var li = doc.createElement('li'); inlineDom(doc, li, it); e.appendChild(li); }); }
      else if (b.t === 'table') {
        e = doc.createElement('div'); e.className = 'tablewrap';
        var tb = doc.createElement('table'), thead = doc.createElement('thead'), tr = doc.createElement('tr');
        b.head.forEach(function (c) { var th = doc.createElement('th'); inlineDom(doc, th, c); tr.appendChild(th); });
        thead.appendChild(tr); tb.appendChild(thead);
        var tbody = doc.createElement('tbody');
        b.rows.forEach(function (r) { var row = doc.createElement('tr'); r.forEach(function (c) { var td = doc.createElement('td'); inlineDom(doc, td, c); row.appendChild(td); }); tbody.appendChild(row); });
        tb.appendChild(tbody); e.appendChild(tb);
      } else { e = doc.createElement('p'); inlineDom(doc, e, b.c); }
      box.appendChild(e);
    });
  }

  root.ObsMd = { parse: parse, parseInline: parseInline, render: render };
})(typeof window !== 'undefined' ? window : globalThis);
