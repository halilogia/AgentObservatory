// CLI görünümü (skin): bot mesajındaki araç satırlarını ve sonuçları, mesajın geldiği CLI'ın TUI görünümüne yakın gösterir.
// Saf mantık: DOM yok. Mantık src/ui/skins.ts ile uyumludur (birebir kopya değil, web'e uyarlanmıştır).
(function (root) {
  'use strict';
  var IDS = ['claude', 'codex', 'agy', 'opencode', 'generic'];
  var RESULT_LINES = 3, RESULT_WIDTH = 140;

  /** motor kimliği -> skin kimliği */
  function skinFor(engine) {
    var a = String(engine || '').toLowerCase();
    return IDS.indexOf(a) >= 0 && a !== 'generic' ? a : 'generic';
  }

  function clip(s, n) {
    var one = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return one.length > n ? one.slice(0, n - 1) + '…' : one;
  }

  function shortPath(p) {
    var s = String(p || '').replace(/\\/g, '/');
    var parts = s.split('/');
    return parts.length > 4 ? '…/' + parts.slice(-3).join('/') : s;
  }

  function str(o) { try { return JSON.stringify(o); } catch (e) { return ''; } }

  /** araç adı + girdi -> { kind, name, summary }. kind: exec | read | write | edit | search | other */
  function describe(name, input, fallback) {
    var n = String(name || 'tool'), k = n.toLowerCase();
    var o = input && typeof input === 'object' ? input : null;
    var fb = String(fallback || '').replace(/^(\$\s|[^\x00-\x7F]+\s)/, '');
    var p = o ? (o.file_path || o.filePath || o.path || o.AbsolutePath || o.TargetFile || o.absolute_path) : '';
    var pathSum = p ? shortPath(p) : (o ? clip(str(o), 80) : clip(fb, 80));
    if (/^(bash|shell|powershell|exec|run_command|execute|terminal|command_execution)/.test(k)) {
      return { kind: 'exec', name: n, summary: o ? clip(o.command || o.CommandLine || o.cmd || str(o), 110) : clip(fb, 110) };
    }
    if (/^(read|view_file|cat|open|list_dir|ls|dir|list)/.test(k)) return { kind: 'read', name: n, summary: pathSum };
    if (/^(write|write_to_file|create)/.test(k)) return { kind: 'write', name: n, summary: pathSum };
    if (/(edit|replace|patch)/.test(k)) return { kind: 'edit', name: n, summary: pathSum };
    if (/^(grep|glob|find|search|grep_search|find_by_name|websearch)/.test(k)) {
      return { kind: 'search', name: n, summary: o ? clip(o.pattern || o.query || o.Query || o.Pattern || str(o), 90) : clip(fb, 90) };
    }
    return { kind: 'other', name: n, summary: o ? clip(str(o), 90) : clip(fb, 90) };
  }

  var VERB = { exec: 'Ran', read: 'Explored', write: 'Wrote', edit: 'Edited', search: 'Searched' };
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /** görünen etiket: { name, rest }; tam metin = name + rest */
  function label(skinId, view) {
    var v = view;
    switch (skinId) {
      case 'claude': return { name: v.name, rest: '(' + v.summary + ')' };
      case 'codex': return { name: VERB[v.kind] || 'Used', rest: ' ' + (v.kind === 'other' ? v.name + ' ' : '') + v.summary };
      case 'agy': return { name: v.name, rest: ' ' + v.summary };
      case 'opencode': return { name: '← ' + (v.kind === 'exec' ? 'Bash' : cap(v.name)), rest: ' ' + v.summary };
      default: return { name: '[' + v.name + ']', rest: ' ' + v.summary };
    }
  }

  /** sonuç: ilk 3 dolu satır (140 karaktere kısaltılmış) + kalan satır sayısı */
  function result(out, max) {
    var lim = max || RESULT_LINES;
    var text = typeof out === 'string' ? out : out == null ? '' : str(out);
    var all = text.split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).filter(function (l) { return l.trim(); });
    var lines = all.slice(0, lim).map(function (l) { return l.length > RESULT_WIDTH ? l.slice(0, RESULT_WIDTH - 1) + '…' : l; });
    return { lines: lines, more: Math.max(0, all.length - lines.length) };
  }

  /** "… +N satır" (word çeviriden gelir) */
  function moreText(n, word) { return '… +' + n + ' ' + (word || 'lines'); }

  var ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M4.5 6.5 6.5 8l-2 1.5M8 10h3"/></svg>';

  root.ObsSkins = { IDS: IDS, skinFor: skinFor, describe: describe, label: label, result: result, moreText: moreText, ICON: ICON };
})(typeof window !== 'undefined' ? window : globalThis);
