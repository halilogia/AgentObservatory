// Otomatik yönlendirme: isteme bakıp en uygun takımın motorunu seçer. Saf modül: DOM, ağ ve saat yok (now dışarıdan verilir).
// Kurallar (öncelik sırasıyla): Gemini istenirse mavi; denetim/inceleme/test yazma kırmızı (codex);
// toplu veri, çeviri, özetleme, uzun okuma siyah (opencode); kod yazma/refactor turuncu (claude). Hiçbiri uymazsa mevcut seçim.
// Güvenlik: yönlendirme yazma iznini ASLA genişletmez. Dönen mode yalnızca kullanıcı yazmayı seçtiyse VE seçilen motor destekliyorsa 'write' olur.
(function (root) {
  'use strict';
  var RULES = [
    { team: 'mavi', reason: 'router.gemini', re: /\b(gemini|antigravity|agy)\b/i },
    { team: 'kirmizi', reason: 'router.review', re: /(denetle|denetim|incele|gözden geçir|code review|review|audit|red.?team|test yaz|birim test|unit test|write (the |some )?tests?|testlerini yaz|güvenlik açı)/i },
    { team: 'siyah', reason: 'router.bulk', re: /(toplu|batch|bulk|çevir|tercüme|translate|özetle|özet çıkar|summari[sz]e|uzun .*oku|tüm dosyaları oku|read (all|every)|extract|dönüştür|classify|sınıflandır)/i },
    { team: 'turuncu', reason: 'router.code', re: /(refactor|yeniden yapılandır|implement|uygula|geliştir|\bkod\b|\bcode\b|\bfix\b|\bbug\b|düzelt|hata.{0,12}çöz|\bekle\b|\byaz\b|\bwrite\b|\bbuild\b|\bcreate\b|oluştur|fonksiyon|function|class|sınıf)/i }
  ];

  function usable(e, now) { return !!e && e.installed !== false && !(e.limitedUntil && e.limitedUntil > now); }
  function modelFor(e, current) {
    var models = e.models || [];
    if (current && current.engine === e.id && models.some(function (m) { return m.id === current.model; })) return current.model;
    return models.length ? models[0].id : '';
  }

  /**
   * prompt: kullanıcı istemi; engines: /api/config motor listesi ({id, team, installed, limitedUntil, write, models});
   * opts: { write: kullanıcı yazma modunu seçti mi, current: {engine, model} mevcut seçim, now }.
   * Dönüş: { engine, model, reason, mode, routed }. routed=false -> mevcut seçime düşüldü.
   */
  function pick(prompt, engines, opts) {
    opts = opts || {};
    var now = opts.now === undefined ? Date.now() : opts.now, text = String(prompt || ''), list = engines || [];
    var cur = opts.current || null, wantsWrite = !!opts.write;
    var finish = function (e, reason, routed) { return { engine: e.id, model: modelFor(e, cur), reason: reason, mode: wantsWrite && e.write ? 'write' : 'read', routed: routed }; };
    for (var i = 0; i < RULES.length; i++) {
      if (!RULES[i].re.test(text)) continue;
      var e = list.filter(function (x) { return x.team === RULES[i].team; }).filter(function (x) { return usable(x, now); })[0];
      if (e) return finish(e, RULES[i].reason, true); // kurulu olmayan / kotası dolu motor atlanır, sonraki kurala bakılır
    }
    var back = (cur && list.filter(function (x) { return x.id === cur.engine; })[0]) || list.filter(function (x) { return usable(x, now); })[0] || list[0];
    return back ? finish(back, 'router.fallback', false) : { engine: '', model: '', reason: 'router.fallback', mode: 'read', routed: false };
  }

  root.ObsRouter = { pick: pick, RULES: RULES };
})(typeof window !== 'undefined' ? window : globalThis);
