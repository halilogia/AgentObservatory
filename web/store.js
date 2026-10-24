// Sohbet geçmişi: tarayıcıda (localStorage) saklanır; sunucuya gönderilmez. Depolama kapalıysa bellekte çalışır.
(function (root) {
  'use strict';
  var KEY = 'obs-chats-v1', MAX_CHATS = 40, MAX_OUT = 2000, MAX_BYTES = 300000;
  var memory = [];

  function read() {
    try { var v = JSON.parse(root.localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return memory.slice(); }
  }
  function write(chats) {
    memory = chats.slice();
    try { root.localStorage.setItem(KEY, JSON.stringify(chats)); } catch (e) { /* kota doldu ya da kapalı: bellekte kalır */ }
  }
  /** araç çıktıları ve toplam boyut sınırlanır */
  function slim(chat) {
    var c = JSON.parse(JSON.stringify(chat));
    c.messages.forEach(function (m) { (m.parts || []).forEach(function (p) { if (p.k === 'tool' && p.out && p.out.length > MAX_OUT) p.out = p.out.slice(0, MAX_OUT); }); });
    while (JSON.stringify(c).length > MAX_BYTES && c.messages.length > 2) c.messages.shift();
    return c;
  }

  root.ObsStore = {
    newId: function () { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    list: function () { return read().sort(function (a, b) { return b.updated - a.updated; }); },
    get: function (id) { return read().filter(function (c) { return c.id === id; })[0] || null; },
    save: function (chat) {
      var chats = read().filter(function (c) { return c.id !== chat.id; });
      chat.updated = Date.now();
      chats.push(slim(chat));
      chats.sort(function (a, b) { return b.updated - a.updated; });
      write(chats.slice(0, MAX_CHATS));
    },
    remove: function (id) { write(read().filter(function (c) { return c.id !== id; })); }
  };
})(window);
