// Diff görüntüleyici: Claude Code / terminal benzeri satır numaralı, ekleme (+ yeşil), silme (- kırmızı) ve dosya başlık kartı.
// Saf mantık + DOM oluşturucu (ObsDiff). Tarayıcıda window.ObsDiff, Node.js altında module.exports olarak çalışır.
(function (root) {
  'use strict';

  var DEFAULT_MAX_LINES = 35;

  function shortPath(p) {
    var s = String(p || '').replace(/\\/g, '/');
    var parts = s.split('/');
    return parts.length > 4 ? '…/' + parts.slice(-3).join('/') : s;
  }

  function clip(s, n) {
    var one = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return one.length > n ? one.slice(0, n - 1) + '…' : one;
  }

  /**
   * İki metin (oldStr, newStr) arasındaki satır farklarını LCS ile hesaplar.
   * Çıktı: { add: number, del: number, lines: Array<{ type: 'add'|'del'|'same', text: string, oldLine?: number, newLine?: number }> }
   */
  function computeDiff(oldStr, newStr, baseLine) {
    var oldLines = String(oldStr == null ? '' : oldStr).split('\n');
    var newLines = String(newStr == null ? '' : newStr).split('\n');
    var base = typeof baseLine === 'number' && !isNaN(baseLine) && baseLine > 0 ? baseLine : 1;

    // Ortak önek (baştaki değişmeyen satırlar)
    var start = 0;
    while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
      start++;
    }

    // Ortak sonek (sondaki değişmeyen satırlar)
    var oldEnd = oldLines.length - 1;
    var newEnd = newLines.length - 1;
    while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
      oldEnd--;
      newEnd--;
    }

    var result = [];
    var curOld = base;
    var curNew = base;

    // Baştaki ortak satırlar
    for (var i = 0; i < start; i++) {
      result.push({ type: 'same', text: oldLines[i], oldLine: curOld++, newLine: curNew++ });
    }

    // Orta kısım: LCS
    var midOld = oldLines.slice(start, oldEnd + 1);
    var midNew = newLines.slice(start, newEnd + 1);
    var addCount = 0;
    var delCount = 0;

    if (midOld.length > 0 && midNew.length > 0 && midOld.length * midNew.length <= 160000) {
      // DP LCS tablosu
      var m = midOld.length, n = midNew.length;
      var dp = [];
      for (var r = 0; r <= m; r++) {
        dp[r] = new Uint16Array(n + 1);
      }
      for (var r = 1; r <= m; r++) {
        for (var c = 1; c <= n; c++) {
          if (midOld[r - 1] === midNew[c - 1]) {
            dp[r][c] = dp[r - 1][c - 1] + 1;
          } else {
            dp[r][c] = Math.max(dp[r - 1][c], dp[r][c - 1]);
          }
        }
      }

      // Geriye doğru yol bulma
      var ops = [];
      var rIdx = m, cIdx = n;
      while (rIdx > 0 || cIdx > 0) {
        if (rIdx > 0 && cIdx > 0 && midOld[rIdx - 1] === midNew[cIdx - 1]) {
          ops.push({ type: 'same', text: midOld[rIdx - 1] });
          rIdx--;
          cIdx--;
        } else if (cIdx > 0 && (rIdx === 0 || dp[rIdx][cIdx - 1] >= dp[rIdx - 1][cIdx])) {
          ops.push({ type: 'add', text: midNew[cIdx - 1] });
          cIdx--;
        } else if (rIdx > 0) {
          ops.push({ type: 'del', text: midOld[rIdx - 1] });
          rIdx--;
        }
      }
      ops.reverse();

      ops.forEach(function (op) {
        if (op.type === 'same') {
          result.push({ type: 'same', text: op.text, oldLine: curOld++, newLine: curNew++ });
        } else if (op.type === 'del') {
          delCount++;
          result.push({ type: 'del', text: op.text, oldLine: curOld++ });
        } else if (op.type === 'add') {
          addCount++;
          result.push({ type: 'add', text: op.text, newLine: curNew++ });
        }
      });
    } else {
      // Çok büyük veya basit blok: doğrudan silinenler sonra eklenenler
      for (var d = 0; d < midOld.length; d++) {
        delCount++;
        result.push({ type: 'del', text: midOld[d], oldLine: curOld++ });
      }
      for (var a = 0; a < midNew.length; a++) {
        addCount++;
        result.push({ type: 'add', text: midNew[a], newLine: curNew++ });
      }
    }

    // Sondaki ortak satırlar
    for (var s = oldEnd + 1; s < oldLines.length; s++) {
      result.push({ type: 'same', text: oldLines[s], oldLine: curOld++, newLine: curNew++ });
    }

    return { add: addCount, del: delCount, lines: result };
  }

  /**
   * Sadece ekleme/silme sayılarını hızlıca hesaplar.
   */
  function computeStats(oldStr, newStr) {
    var diff = computeDiff(oldStr, newStr);
    return { add: diff.add, del: diff.del };
  }

  /**
   * Standart unified diff (git diff / patch) çıktısını ayrıştırır.
   */
  function parseUnifiedDiff(diffText) {
    var rawLines = String(diffText || '').replace(/\r/g, '').split('\n');
    var lines = [];
    var addCount = 0;
    var delCount = 0;
    var fileName = '';
    var oldCur = 1;
    var newCur = 1;

    for (var i = 0; i < rawLines.length; i++) {
      var l = rawLines[i];
      if (/^--- (?:a\/)?(.*)$/.test(l)) {
        if (!fileName) fileName = l.replace(/^--- (?:a\/)?/, '').trim();
        continue;
      }
      if (/^\+\+\+ (?:b\/)?(.*)$/.test(l)) {
        fileName = l.replace(/^\+\+\+ (?:b\/)?/, '').trim();
        continue;
      }
      if (/^diff --git (?:a\/)?(.*) (?:b\/)?(.*)$/.test(l)) {
        var m = /^diff --git (?:a\/)?(.*) (?:b\/)?(.*)$/.exec(l);
        if (m && m[2]) fileName = m[2];
        continue;
      }
      var hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(l);
      if (hunk) {
        oldCur = parseInt(hunk[1], 10);
        newCur = parseInt(hunk[2], 10);
        var heading = hunk[3] ? hunk[3].trim() : '';
        if (heading) {
          lines.push({ type: 'hunk', text: l, heading: heading });
        }
        continue;
      }
      if (l.startsWith('+')) {
        addCount++;
        lines.push({ type: 'add', text: l.slice(1), newLine: newCur++ });
      } else if (l.startsWith('-')) {
        delCount++;
        lines.push({ type: 'del', text: l.slice(1), oldLine: oldCur++ });
      } else if (l.startsWith(' ') || l === '') {
        lines.push({ type: 'same', text: l.startsWith(' ') ? l.slice(1) : l, oldLine: oldCur++, newLine: newCur++ });
      }
    }

    return { file: fileName, add: addCount, del: delCount, lines: lines };
  }

  /**
   * Satır numaraları içeren metin çıktısını ayrıştırır (ör: Claude "123\tsatır" veya "402 + const x = 1").
   */
  function parseNumberedText(text) {
    var rawLines = String(text || '').replace(/\r/g, '').split('\n');
    var lines = [];
    var addCount = 0;
    var delCount = 0;

    rawLines.forEach(function (l) {
      if (!l.trim()) return;
      // Format 1: "8514 +    kod..." veya "402 + const ..." veya "8511   kod..."
      var m1 = /^\s*(\d+)[\t\s]+([+-])?\s*(.*)$/.exec(l);
      if (m1) {
        var num = parseInt(m1[1], 10);
        var sign = m1[2];
        var code = m1[3];
        if (sign === '+') {
          addCount++;
          lines.push({ type: 'add', text: code, newLine: num });
        } else if (sign === '-') {
          delCount++;
          lines.push({ type: 'del', text: code, oldLine: num });
        } else {
          lines.push({ type: 'same', text: code, oldLine: num, newLine: num });
        }
        return;
      }

      // Format 2: "+ 8514 kod..." veya "- 8511 kod..."
      var m2 = /^\s*([+-])\s*(\d+)[\t\s]+(.*)$/.exec(l);
      if (m2) {
        var s2 = m2[1], n2 = parseInt(m2[2], 10), c2 = m2[3];
        if (s2 === '+') {
          addCount++;
          lines.push({ type: 'add', text: c2, newLine: n2 });
        } else {
          delCount++;
          lines.push({ type: 'del', text: c2, oldLine: n2 });
        }
        return;
      }

      // Format 3: Düz "+ kod..." veya "- kod..."
      if (l.startsWith('+') && !l.startsWith('+++')) {
        addCount++;
        lines.push({ type: 'add', text: l.slice(1) });
      } else if (l.startsWith('-') && !l.startsWith('---')) {
        delCount++;
        lines.push({ type: 'del', text: l.slice(1) });
      } else {
        lines.push({ type: 'same', text: l });
      }
    });

    return { add: addCount, del: delCount, lines: lines };
  }

  /**
   * Bir araç çağrısının diff/kod değişikliği olup olmadığını anlar.
   */
  function isDiffLike(part) {
    if (!part) return false;
    var n = String(part.name || '').toLowerCase();
    var k = String(part.kind || '').toLowerCase();
    if (['diff', 'edit', 'write'].indexOf(k) >= 0) return true;
    if (['edit', 'write', 'patch', 'multiedit', 'notebookedit', 'str_replace_editor', 'replace_file_content'].indexOf(n) >= 0) return true;
    var inp = part.input;
    if (inp && typeof inp === 'object') {
      if (inp.old_string != null || inp.new_string != null || inp.old_str != null || inp.new_str != null) return true;
      if (inp.patch != null) return true;
    }
    var out = String(part.out || '');
    if (out.indexOf('@@ ') >= 0 || /^diff --git/m.test(out) || (/^[+-][^+-]/m.test(out) && out.indexOf('\n') >= 0)) return true;
    return false;
  }

  /**
   * Çıktı metninden Claude'un döndürdüğü tab tabanlı satır numarasını bulur ("8511\t...").
   */
  function extractBaseLine(outText) {
    var m = /^\s*(\d+)[\t\s]+/m.exec(String(outText || ''));
    return m ? parseInt(m[1], 10) : 1;
  }

  /**
   * Araç parçasından (part) tam diff veri modeli çıkarır.
   */
  function fromToolPart(part) {
    if (!part) return null;
    var inp = part.input && typeof part.input === 'object' ? part.input : {};
    var out = String(part.out || '');
    var name = String(part.name || '').toLowerCase();

    var rawFile = inp.file_path || inp.filePath || inp.path || inp.TargetFile || inp.target_file || part.summary || '';
    var file = shortPath(rawFile);

    // Durum 1: Edit aracı (old_string ve new_string mevcut)
    var oldStr = inp.old_string != null ? inp.old_string : inp.old_str;
    var newStr = inp.new_string != null ? inp.new_string : inp.new_str;
    if (oldStr != null || newStr != null) {
      var baseLine = extractBaseLine(out);
      var diff = computeDiff(oldStr || '', newStr || '', baseLine);
      return {
        action: 'Updated',
        file: file || 'file',
        fullPath: rawFile,
        add: diff.add,
        del: diff.del,
        lines: diff.lines,
        isDiff: true
      };
    }

    // Durum 2: Write aracı (yeni dosya oluşturma / yazma)
    if (inp.content != null && (name === 'write' || name === 'create')) {
      var lines = String(inp.content).split('\n').map(function (txt, idx) {
        return { type: 'add', text: txt, newLine: idx + 1 };
      });
      return {
        action: 'Created',
        file: file || 'file',
        fullPath: rawFile,
        add: lines.length,
        del: 0,
        lines: lines,
        isDiff: true
      };
    }

    // Durum 3: Çıktıda unified diff (@@ -... +... @@ veya diff --git)
    if (out.indexOf('@@ ') >= 0 || /^diff --git/m.test(out) || out.indexOf('--- a/') >= 0) {
      var parsedUni = parseUnifiedDiff(out);
      return {
        action: 'Updated',
        file: parsedUni.file ? shortPath(parsedUni.file) : (file || 'diff'),
        fullPath: parsedUni.file || rawFile,
        add: parsedUni.add,
        del: parsedUni.del,
        lines: parsedUni.lines,
        isDiff: true
      };
    }

    // Durum 4: Çıktıda satır numaralı veya +/- işaretli blok
    if (out.trim()) {
      var parsedNum = parseNumberedText(out);
      if (parsedNum.lines.length > 0) {
        return {
          action: 'Updated',
          file: file || 'file',
          fullPath: rawFile,
          add: parsedNum.add,
          del: parsedNum.del,
          lines: parsedNum.lines,
          isDiff: true
        };
      }
    }

    return null;
  }

  /**
   * DOM diff kartını oluşturur ve parent öğesine ekler.
   */
  function renderDiff(doc, parent, diffData, opts) {
    opts = opts || {};
    var maxLines = typeof opts.maxLines === 'number' ? opts.maxLines : DEFAULT_MAX_LINES;
    var moreWord = opts.moreLabel || 'lines';

    var card = doc.createElement('div');
    card.className = 'diff-card';

    // 1) Başlık Barı: "Updated <file> (+4 -0)"
    var head = doc.createElement('div');
    head.className = 'diff-header';

    var title = doc.createElement('div');
    title.className = 'diff-title';

    var action = doc.createElement('span');
    action.className = 'diff-action';
    action.textContent = diffData.action || 'Updated';

    var fileSpan = doc.createElement('span');
    fileSpan.className = 'diff-file';
    fileSpan.textContent = diffData.file || 'file';
    if (diffData.fullPath) fileSpan.title = diffData.fullPath;

    title.append(action, doc.createTextNode(' '), fileSpan);

    var badge = doc.createElement('div');
    badge.className = 'diff-badge';

    var addBadge = doc.createElement('span');
    addBadge.className = 'diff-stat diff-stat-add';
    addBadge.textContent = '+' + (diffData.add || 0);

    var delBadge = doc.createElement('span');
    delBadge.className = 'diff-stat diff-stat-del' + ((diffData.del || 0) === 0 ? ' diff-zero' : '');
    delBadge.textContent = '-' + (diffData.del || 0);

    badge.append(doc.createTextNode('('), addBadge, doc.createTextNode(' '), delBadge, doc.createTextNode(')'));
    head.append(title, badge);
    card.appendChild(head);

    // 2) Gövde: Satır satır diff görünümü
    var body = doc.createElement('div');
    body.className = 'diff-body';

    var allLines = diffData.lines || [];
    var visibleLines = allLines.slice(0, maxLines);

    function createRow(item) {
      if (item.type === 'hunk') {
        var hRow = doc.createElement('div');
        hRow.className = 'diff-hunk';
        hRow.textContent = item.text;
        return hRow;
      }

      var row = doc.createElement('div');
      var cls = 'diff-row diff-' + (item.type || 'same');
      row.className = cls;

      // Satır numarası sütunu
      var numCol = doc.createElement('span');
      numCol.className = 'diff-num';
      var lineNo = item.newLine != null ? item.newLine : (item.oldLine != null ? item.oldLine : '');
      numCol.textContent = lineNo ? String(lineNo) : '';

      // İşaretçi (+ / - / boşluk)
      var markCol = doc.createElement('span');
      markCol.className = 'diff-sign';
      markCol.textContent = item.type === 'add' ? '+' : item.type === 'del' ? '-' : ' ';

      // Kod metni
      var textCol = doc.createElement('span');
      textCol.className = 'diff-text';
      textCol.textContent = item.text || '';

      row.append(numCol, markCol, textCol);
      return row;
    }

    visibleLines.forEach(function (it) {
      body.appendChild(createRow(it));
    });
    card.appendChild(body);

    // 3) Kalan satırlar için katlanabilir buton (_ X more lines)
    var remaining = allLines.length - visibleLines.length;
    if (remaining > 0) {
      var moreBtn = doc.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'diff-more';
      moreBtn.textContent = '_ ' + remaining + ' more ' + moreWord;

      var expanded = false;
      moreBtn.onclick = function () {
        if (!expanded) {
          expanded = true;
          for (var k = maxLines; k < allLines.length; k++) {
            body.appendChild(createRow(allLines[k]));
          }
          moreBtn.textContent = '▲ ' + (opts.collapseLabel || 'Collapse');
          moreBtn.classList.add('is-expanded');
        } else {
          expanded = false;
          while (body.children.length > maxLines) {
            body.removeChild(body.lastChild);
          }
          moreBtn.textContent = '_ ' + remaining + ' more ' + moreWord;
          moreBtn.classList.remove('is-expanded');
        }
      };
      card.appendChild(moreBtn);
    }

    parent.appendChild(card);
    return card;
  }

  root.ObsDiff = {
    shortPath: shortPath,
    computeDiff: computeDiff,
    computeStats: computeStats,
    parseUnifiedDiff: parseUnifiedDiff,
    parseNumberedText: parseNumberedText,
    isDiffLike: isDiffLike,
    fromToolPart: fromToolPart,
    renderDiff: renderDiff
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.ObsDiff;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
