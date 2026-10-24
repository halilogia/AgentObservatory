// Bağlam taşıma: motor, model ya da klasör değişince yeni oturum açılır ve yeni model eski konuşmayı bilmez.
// Bu modül önceki konuşmayı kısa bir özete çevirip yeni isteme ekler (Antigravity'nin <CONTEXT_SUMMARY> düzenine benzer).
// Özet yapay zekâyla değil kuralla üretilir: ek maliyet ve gecikme yok; en yeni turlar tam, eskiler kısaltılmış girer.
(function (root) {
  'use strict';
  var BUDGET = 9000;         // özetin en çok karakteri (sunucu istemi 20000 ile sınırlar)
  var USER_MAX = 700, BOT_MAX = 1800, OLD_MAX = 300, TOOLS_MAX = 6;

  function clip(s, n) { s = String(s || '').replace(/\s+\n/g, '\n').trim(); return s.length > n ? s.slice(0, n).trimEnd() + ' …' : s; }
  function botText(rec) { return (rec.parts || []).filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.v; }).join('\n\n'); }
  function botTools(rec) { return (rec.parts || []).filter(function (p) { return p.k === 'tool'; }).map(function (p) { return String(p.summary || p.name || ''); }).filter(Boolean); }

  /** mesaj listesini tur tur (kullanıcı istemi + yanıtlar) gruplar; yanıtsız / hatalı botlar atlanır */
  function turns(messages) {
    var out = [], cur = null;
    (messages || []).forEach(function (m) {
      if (m.r === 'u') { cur = { user: m.text, bots: [] }; out.push(cur); }
      else if (m.r === 'b' && cur && !m.notice) { var t = botText(m); if (t || botTools(m).length) cur.bots.push(m); }
    });
    return out.filter(function (t) { return t.bots.length; });
  }

  function fmtTurn(t, i, full) {
    var lines = ['## ' + (i + 1) + '. ' + clip(t.user, full ? USER_MAX : OLD_MAX)];
    t.bots.forEach(function (b) {
      var tools = botTools(b), text = botText(b);
      if (text) lines.push((b.label || b.engine || 'AI') + ': ' + clip(text, full ? BOT_MAX : OLD_MAX));
      if (tools.length) lines.push('Tools: ' + tools.slice(0, TOOLS_MAX).map(function (s) { return clip(s, 90); }).join('; ') + (tools.length > TOOLS_MAX ? ' (+' + (tools.length - TOOLS_MAX) + ')' : ''));
    });
    return lines.join('\n');
  }

  /**
   * prior: bu istemden ÖNCEKİ mesajlar. Özet yoksa (ilk mesaj) null döner; istem olduğu gibi gider.
   * Dönen metin: <CONTEXT_SUMMARY> + <USER_REQUEST>.
   */
  function build(prior, text, opts) {
    var budget = (opts && opts.budget) || BUDGET;
    var list = turns(prior);
    // aynı istem yeniden denenirken (başka motorla dene) son tur zaten bu istemin kendisidir
    if (list.length && list[list.length - 1].user === text) list.pop();
    if (!list.length) return null;
    var picked = [], used = 0, omitted = 0;
    for (var i = list.length - 1; i >= 0; i--) {
      var recent = list.length - i <= 2;               // en yeni iki tur tam, eskiler kısa
      var block = fmtTurn(list[i], i, recent);
      if (used + block.length > budget) { omitted = i + 1; break; }
      picked.unshift(block); used += block.length;
    }
    var head = 'The conversation below happened earlier in this same chat, possibly with a different model or engine. Use it only as background; do not repeat it. Answer only the USER_REQUEST.';
    var body = (omitted ? '(' + omitted + ' earlier turn' + (omitted > 1 ? 's' : '') + ' omitted)\n\n' : '') + picked.join('\n\n');
    return '<CONTEXT_SUMMARY>\n' + head + '\n\n# Previous turns\n' + body + '\n</CONTEXT_SUMMARY>\n\n<USER_REQUEST>\n' + text + '\n</USER_REQUEST>';
  }

  root.ObsCtx = { build: build, turns: turns, BUDGET: BUDGET };
})(typeof window !== 'undefined' ? window : globalThis);
