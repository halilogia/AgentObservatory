// Tema: varsayılan aydınlık. Kayıtlı seçim varsa o (ilk boyamadan önce uygulanır, yanıp sönme olmaz).
(function () {
  'use strict';
  var theme = 'light';
  try { var saved = localStorage.getItem('obs-theme'); if (saved === 'dark' || saved === 'light') theme = saved; } catch (e) { /* depolama kapalı */ }
  document.documentElement.setAttribute('data-theme', theme);
  window.ObsTheme = {
    get: function () { return document.documentElement.getAttribute('data-theme'); },
    set: function (t) {
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('obs-theme', t); } catch (e) { /* yoksay */ }
    }
  };
})();
