// Kahve fincanı: Claude Code "cache-clock" modundaki 14x10 piksel-art'ın birebir aynısı (renkler ve duman dahil).
// Anlamı: Claude'un istem önbelleği (prompt cache) ne kadar sıcak? Duman sürdükçe önbellek taze, fincan griyse soğudu.
(function (root) {
  'use strict';
  var COLS = 14, ROWS = 10;
  var hex = function (n) { return '#' + ('000000' + n.toString(16)).slice(-6); };

  /** state: empty | hot | warm | low | cold */
  function pixels(state, frame) {
    var px = [], y, x;
    for (y = 0; y < ROWS; y++) { px.push([]); for (x = 0; x < COLS; x++) px[y].push(null); }
    var set = function (X, Y, c) { px[Y][X] = c; };
    var row = function (Y, x0, x1, c) { for (var X = x0; X <= x1; X++) set(X, Y, c); };
    var cold = state === 'cold' || state === 'empty';
    var china = cold ? 0x9a968e : 0xf1ede4;
    var chinaShade = cold ? 0x7d7a73 : 0xcfc8ba;
    var saucer = cold ? 0x77736c : 0xb9b2a6;
    var coffee = cold ? 0x7a6a5c : 0x3b2314;

    var wisps = state === 'hot' ? 3 : state === 'warm' ? 2 : state === 'low' ? 1 : 0;
    var shades = state === 'hot' ? [0xf4f4f4, 0xd2d2d2, 0xa9a9a9, 0x7e7e7e]
      : state === 'warm' ? [0xe8d9a8, 0xcbbd8e, 0xa09672, 0x766f58]
      : [0xc99a9a, 0xa87c7c, 0x866262, 0x634848];
    var bases = wisps === 1 ? [7] : wisps === 2 ? [5, 8] : [4, 7, 10];
    for (var k = 0; k < wisps; k++) {
      for (var h = 0; h < 4; h++) {
        var bx = bases[k] + Math.round(Math.sin(frame / 2 + h * 1.1 + k * 2.1) * 1.3);
        set(Math.min(12, Math.max(1, bx)), 3 - h, shades[h]);
      }
    }

    set(2, 4, chinaShade);
    row(4, 3, 10, coffee);
    if (state === 'hot' || state === 'warm') set(4, 4, 0x6b4428);
    set(11, 4, chinaShade);
    row(5, 2, 11, china); row(6, 2, 11, china); row(7, 3, 10, china);
    set(3, 5, cold ? 0xb4b0a8 : 0xffffff);
    set(10, 5, chinaShade); set(11, 5, chinaShade); set(10, 6, chinaShade); set(11, 6, chinaShade);
    set(9, 7, chinaShade); set(10, 7, chinaShade);
    set(12, 5, china); set(13, 5, china); set(13, 6, china);
    set(11, 7, china); set(12, 7, china); set(13, 7, chinaShade);
    row(8, 1, 12, saucer);
    row(9, 3, 10, chinaShade);
    return px;
  }

  /** süre oranına göre durum (modla aynı eşikler) */
  function stateOf(lastAt, now, ttlMs, busy) {
    if (lastAt === null) return 'empty';
    if (busy) return 'hot';
    var left = lastAt + ttlMs - now, ratio = left / ttlMs;
    return left <= 0 ? 'cold' : left <= 60000 || ratio < 0.2 ? 'low' : ratio < 0.5 ? 'warm' : 'hot';
  }

  function draw(canvas, state, frame) {
    var ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, COLS, ROWS);
    var px = pixels(state, frame);
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (px[y][x] !== null) { ctx.fillStyle = hex(px[y][x]); ctx.fillRect(x, y, 1, 1); }
  }

  root.ObsCup = { COLS: COLS, ROWS: ROWS, pixels: pixels, stateOf: stateOf, draw: draw };
})(typeof window !== 'undefined' ? window : globalThis);
