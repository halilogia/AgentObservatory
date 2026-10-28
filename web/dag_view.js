// DAG görünümü: görev ağacı düğümleri ve canlı durum renkleri (sarı=çalışıyor, yeşil=bitti, kırmızı=hata, mavi=hazır/doğrulama).
// Saf yerleşim hesabı + SVG oluşturucu. Tarayıcıda window.ObsDagView, Node.js altında module.exports.
(function (root) {
  'use strict';

  var COLORS = { yellow: '#eab308', green: '#22c55e', red: '#ef4444', blue: '#3b82f6', gray: '#9ca3af' };
  var STATUS_COLOR = {
    pending: 'gray', interrupted: 'gray',
    ready: 'blue', verifying: 'blue', waiting_approval: 'blue',
    running: 'yellow',
    completed: 'green',
    failed: 'red', blocked: 'red'
  };

  function statusColor(status) {
    return STATUS_COLOR[status] || 'gray';
  }

  /**
   * Görevleri bağımlılık derinliğine göre katmanlara yerleştirir (döngüye dayanıklı).
   * Döner: { nodes: [{id,title,status,color,level,col,x,y,w,h}], edges: [{from,to}], width, height }
   */
  function layout(tasks, opts) {
    opts = opts || {};
    var nw = opts.nodeWidth || 150, nh = opts.nodeHeight || 44, gx = opts.gapX || 50, gy = opts.gapY || 24;
    var byId = {};
    tasks.forEach(function (t) { byId[t.id] = t; });

    var level = {};
    function depth(id, stack) {
      if (level[id] !== undefined) return level[id];
      if (stack[id]) return 0; // döngü: kırıp 0 say
      stack[id] = true;
      var d = 0;
      (byId[id].dependencies || []).forEach(function (dep) {
        if (byId[dep]) d = Math.max(d, depth(dep, stack) + 1);
      });
      delete stack[id];
      level[id] = d;
      return d;
    }
    tasks.forEach(function (t) { depth(t.id, {}); });

    var colCount = {};
    var maxLevel = 0, maxCol = 0;
    var nodes = tasks.map(function (t) {
      var lv = level[t.id];
      var col = colCount[lv] || 0;
      colCount[lv] = col + 1;
      maxLevel = Math.max(maxLevel, lv);
      maxCol = Math.max(maxCol, col);
      return {
        id: t.id, title: t.title || t.id, status: t.status, color: statusColor(t.status),
        agent: t.assignedAgent, level: lv, col: col,
        x: lv * (nw + gx), y: col * (nh + gy), w: nw, h: nh
      };
    });
    var edges = [];
    tasks.forEach(function (t) {
      (t.dependencies || []).forEach(function (dep) {
        if (byId[dep]) edges.push({ from: dep, to: t.id });
      });
    });
    return { nodes: nodes, edges: edges, width: (maxLevel + 1) * (nw + gx) - gx, height: (maxCol + 1) * (nh + gy) - gy };
  }

  function counts(tasks) {
    var c = { yellow: 0, green: 0, red: 0, blue: 0, gray: 0 };
    tasks.forEach(function (t) { c[statusColor(t.status)]++; });
    return c;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function clip(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  /** SVG'yi parent içine çizer; aynı parent'a tekrar çağrılırsa içeriği tazeler (canlı güncelleme). */
  function render(doc, parent, tasks, opts) {
    var lay = layout(tasks || [], opts);
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'dag-svg');
    svg.setAttribute('viewBox', '0 0 ' + Math.max(lay.width, 1) + ' ' + Math.max(lay.height, 1));
    var pos = {};
    lay.nodes.forEach(function (n) { pos[n.id] = n; });

    lay.edges.forEach(function (e) {
      var a = pos[e.from], b = pos[e.to];
      var path = doc.createElementNS(SVG_NS, 'path');
      var x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
      path.setAttribute('d', 'M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2);
      path.setAttribute('class', 'dag-edge');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', COLORS.gray);
      svg.appendChild(path);
    });
    lay.nodes.forEach(function (n) {
      var g = doc.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'dag-node dag-' + n.color);
      g.setAttribute('data-id', n.id);
      g.setAttribute('data-status', n.status);
      var rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', n.x); rect.setAttribute('y', n.y);
      rect.setAttribute('width', n.w); rect.setAttribute('height', n.h);
      rect.setAttribute('rx', 8);
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', COLORS[n.color]);
      rect.setAttribute('stroke-width', 2);
      var label = doc.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', n.x + 10); label.setAttribute('y', n.y + 19);
      label.setAttribute('class', 'dag-label');
      label.textContent = clip(n.title, 20);
      var sub = doc.createElementNS(SVG_NS, 'text');
      sub.setAttribute('x', n.x + 10); sub.setAttribute('y', n.y + 35);
      sub.setAttribute('class', 'dag-sub');
      sub.textContent = n.agent ? n.agent + ' · ' + n.status : n.status;
      g.append(rect, label, sub);
      svg.appendChild(g);
    });
    if (parent.replaceChildren) parent.replaceChildren(svg); else parent.appendChild(svg);
    return svg;
  }

  root.ObsDagView = { COLORS: COLORS, statusColor: statusColor, layout: layout, counts: counts, render: render };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ObsDagView;
})(typeof globalThis !== 'undefined' ? globalThis : this);
