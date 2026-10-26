// Telefon eşleştirme sayfası: bilgisayardaki sayfanın gösterdiği tek kullanımlık kodu girince bu cihaza çerez verilir.
(function () {
  'use strict';
  var L = (navigator.language || 'en').slice(0, 2) === 'tr' ? 'tr' : 'en';
  var T = {
    tr: { title: 'Telefonu eşleştir', hint: 'Bilgisayardaki Agent Observatory sayfasında "Telefon" bölümündeki kodu gir.', go: 'Eşleştir', ph: 'KOD-1234', pair_bad: 'Kod yanlış.', pair_expired: 'Kodun süresi doldu. Bilgisayarda yeni kod üret.', pair_locked: 'Çok fazla yanlış deneme. 10 dakika bekle.', wrong_account: 'Bu Tailscale hesabı eşleştirilmiş hesap değil.', net: 'Bağlantı hatası.' },
    en: { title: 'Pair this phone', hint: 'Enter the code shown in the "Phone" section of the Agent Observatory page on your computer.', go: 'Pair', ph: 'CODE-1234', pair_bad: 'Wrong code.', pair_expired: 'The code expired. Create a new one on your computer.', pair_locked: 'Too many wrong attempts. Wait 10 minutes.', wrong_account: 'This Tailscale account is not the paired account.', net: 'Connection error.' }
  }[L];
  var $ = function (id) { return document.getElementById(id); };
  document.documentElement.lang = L;
  $('t').textContent = T.title; $('hint').textContent = T.hint; $('go').textContent = T.go; $('code').placeholder = T.ph;
  var qCode = new URLSearchParams(location.search).get('code');
  if (qCode) $('code').value = qCode.toUpperCase();
  else if (location.hash.length > 1) $('code').value = decodeURIComponent(location.hash.slice(1)).toUpperCase();

  var ua = navigator.userAgent || '';
  var name = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : 'Telefon';
  async function go() {
    $('err').textContent = ''; $('go').disabled = true; $('go').textContent = L === 'tr' ? 'Eşleştiriliyor...' : 'Pairing...';
    try {
      var r = await fetch('/api/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: $('code').value, name: name }) });
      var j = {}; try { j = await r.json(); } catch (e) { /* gövde yok */ }
      if (r.ok) { location.replace('/'); return; }
      $('err').textContent = T[j.code] || T.net;
    } catch (e) { $('err').textContent = T.net; }
    $('go').disabled = false; $('go').textContent = T.go;
  }
  $('go').onclick = go;
  $('code').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
  $('code').focus();

  // Otomatik eşleşme: URL'de kod varsa kullanıcı hiçbir şeye basmadan doğrudan bağlanır
  if ($('code').value.trim()) {
    go();
  }
})();
