// Küçük i18n katmanı (i18next ile aynı kullanım biçimi): t(key, params), changeLanguage, on('languageChanged'),
// "{{ad}}" ara değer koyma, çoğul (key_one / key_other, Intl.PluralRules), yedek dil, [data-i18n] bağlama.
// Bağımlılık yok: Observatory'nin kendi CSP'si (script-src 'self') dış kitaplık yüklemeye izin vermez.
(function (root) {
  'use strict';
  var STORAGE_KEY = 'obs-lang';
  var resources = {}, listeners = [];
  var state = { lng: 'tr', fallback: 'tr' };

  function lookup(lng, key) {
    var o = resources[lng];
    var parts = key.split('.');
    for (var i = 0; o && i < parts.length; i++) o = o[parts[i]];
    return typeof o === 'string' ? o : undefined;
  }
  function interpolate(s, params) {
    return s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (m, name) { return params[name] === undefined ? m : String(params[name]); });
  }
  function readSaved() { try { return root.localStorage.getItem(STORAGE_KEY); } catch (e) { return null; } }

  var i18n = {
    languages: ['tr', 'en'],
    get language() { return state.lng; },
    addResources: function (lng, bundle) { resources[lng] = Object.assign(resources[lng] || {}, bundle); },
    /** kayıtlı seçim, yoksa tarayıcı dili (tr ise Türkçe, değilse İngilizce) */
    detect: function () {
      var saved = readSaved();
      if (saved && i18n.languages.indexOf(saved) >= 0) return saved;
      var nav = (root.navigator && root.navigator.language) || 'en';
      return /^tr/i.test(nav) ? 'tr' : 'en';
    },
    init: function (opts) {
      opts = opts || {};
      state.fallback = opts.fallbackLng || 'tr';
      state.lng = opts.lng || i18n.detect();
      if (root.document) root.document.documentElement.lang = state.lng;
    },
    t: function (key, params) {
      params = params || {};
      var keys = [key];
      if (typeof params.count === 'number') keys = [key + '_' + new Intl.PluralRules(state.lng).select(params.count), key + '_other', key];
      var langs = state.lng === state.fallback ? [state.lng] : [state.lng, state.fallback];
      for (var a = 0; a < langs.length; a++) for (var b = 0; b < keys.length; b++) {
        var s = lookup(langs[a], keys[b]);
        if (s !== undefined) return interpolate(s, params);
      }
      return key;
    },
    changeLanguage: function (lng) {
      if (i18n.languages.indexOf(lng) < 0 || lng === state.lng) return;
      state.lng = lng;
      try { root.localStorage.setItem(STORAGE_KEY, lng); } catch (e) { /* depolama kapalı */ }
      if (root.document) root.document.documentElement.lang = lng;
      listeners.slice().forEach(function (fn) { fn(lng); });
    },
    on: function (event, fn) { if (event === 'languageChanged') listeners.push(fn); },
    /** [data-i18n]="anahtar" (metin) ve data-i18n-attr="öznitelik:anahtar;..." (öznitelikler) */
    applyDom: function (scope) {
      var doc = scope || root.document;
      Array.prototype.forEach.call(doc.querySelectorAll('[data-i18n]'), function (el) { el.textContent = i18n.t(el.getAttribute('data-i18n')); });
      Array.prototype.forEach.call(doc.querySelectorAll('[data-i18n-attr]'), function (el) {
        el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
          var p = pair.split(':'); if (p.length === 2) el.setAttribute(p[0].trim(), i18n.t(p[1].trim()));
        });
      });
    },
    /** testler için: bir dilin tüm anahtarları ("a.b.c") */
    keys: function (lng) {
      var out = [];
      (function walk(o, prefix) { Object.keys(o || {}).forEach(function (k) { var v = o[k]; if (typeof v === 'string') out.push(prefix + k); else walk(v, prefix + k + '.'); }); })(resources[lng], '');
      return out;
    }
  };
  root.ObsI18n = i18n;
})(typeof window !== 'undefined' ? window : globalThis);
