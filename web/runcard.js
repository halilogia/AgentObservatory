// Çalışan ajanın durum kartı: kapalıyken tek satır ("12 dosya okunuyor · 0:07"), açıkken adım listesi ve komut çıktısı.
// Bu dosya yalnızca saf mantık içerir (DOM yok); çizim app.js'te.
(function (root) {
  'use strict';

  /** milisaniye → "m:ss" */
  function clock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  /** adım süresi: 0.4s / 12s / 1:05 */
  function dur(ms) {
    if (ms < 10000) return (Math.max(0, ms) / 1000).toFixed(1) + 's';
    return ms < 60000 ? Math.round(ms / 1000) + 's' : clock(ms);
  }

  /** Son adımların aynı türden kaç tanesi art arda geldiği (ör. 12 okuma). steps: [{kind}] */
  function trailing(steps) {
    if (!steps.length) return { kind: null, count: 0 };
    var kind = steps[steps.length - 1].kind, n = 0;
    for (var i = steps.length - 1; i >= 0 && steps[i].kind === kind; i--) n++;
    return { kind: kind, count: n };
  }

  /** Komut çıktısından ilk `max` dolu satır + kalan sayısı (TUI'deki "… +N satır" ile aynı mantık) */
  function outLines(out, max) {
    var all = String(out || '').split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).filter(function (l) { return l.trim(); });
    return { lines: all.slice(0, max).map(function (l) { return l.length > 160 ? l.slice(0, 159) + '…' : l; }), more: Math.max(0, all.length - max) };
  }

  /** Adım çubuğu: en çok `max` parça; her parça 'done' | 'run'. Son adım sürüyorsa 'run'. */
  function segments(steps, max) {
    var shown = steps.slice(-max);
    return shown.map(function (s) { return s.t1 ? 'done' : 'run'; });
  }

  root.ObsRunCard = { clock: clock, dur: dur, trailing: trailing, outLines: outLines, segments: segments };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ObsRunCard;
})(typeof globalThis !== 'undefined' ? globalThis : this);
