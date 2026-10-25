// Projeler: bir ad, bir klasör ve talimatlar (her yeni oturumun başında modele verilir). Sohbetler `chat.project` ile bağlanır.
// Sohbet geçmişi gibi tarayıcıda (localStorage) saklanır; sunucuya gitmez. Depolama kapalıysa bellekte çalışır.
(function (root) {
  'use strict';
  var KEY = 'obs-projects-v1', MAX = 30, NAME_MAX = 40, INSTR_MAX = 4000;
  var memory = [];

  function read() {
    try { var v = JSON.parse(root.localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return memory.slice(); }
  }
  function write(list) {
    memory = list.slice();
    try { root.localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* kota doldu ya da kapalı: bellekte kalır */ }
  }
  function clean(p) {
    return {
      id: String(p.id), name: String(p.name || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX),
      cwd: String(p.cwd || ''), instructions: String(p.instructions || '').trim().slice(0, INSTR_MAX),
      created: Number(p.created) || Date.now(), touched: Number(p.touched) || Date.now()
    };
  }

  root.ObsProjects = {
    NAME_MAX: NAME_MAX, INSTR_MAX: INSTR_MAX,
    newId: function () { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    /** en son kullanılan önce */
    list: function () { return read().map(clean).sort(function (a, b) { return b.touched - a.touched; }); },
    get: function (id) { return id ? read().map(clean).filter(function (p) { return p.id === id; })[0] || null : null; },
    /** adı boş olan kaydedilmez (null döner) */
    save: function (p) {
      var c = clean(p); if (!c.name) return null;
      var list = read().filter(function (x) { return x.id !== c.id; });
      list.push(c); list.sort(function (a, b) { return b.touched - a.touched; });
      write(list.slice(0, MAX));
      return c;
    },
    touch: function (id) { var p = this.get(id); if (p) { p.touched = Date.now(); this.save(p); } },
    remove: function (id) { write(read().filter(function (p) { return p.id !== id; })); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
