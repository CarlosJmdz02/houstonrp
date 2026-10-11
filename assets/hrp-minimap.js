/* ============================================================
   HRP · MINI-MAPA ESTÁTICO DE LIBERTY COUNTY
   ------------------------------------------------------------
   Versión independiente de js/map.js para usarla dentro del MDT
   (dispatch usa MapController.renderMiniMap, que respeta la
   calibración en vivo). Usa la imagen HD de 2560px para que el
   recorte salga nítido aunque hagamos zoom.
   ============================================================ */
(function () {
  'use strict';

  var IMG_SRC = 'images/erlcmap-hd2560.webp?v=1';
  var WORLD = { minX: 138.2, maxX: 5091.0, minZ: -150.7, maxZ: 4934.2 };

  var img = new Image();
  var ready = false;
  var failed = false;
  var contentRect = null;
  var pending = [];

  img.onload = function () {
    contentRect = detectContentRect(img);
    ready = true;
    var q = pending.slice();
    pending.length = 0;
    q.forEach(function (fn) { try { fn(); } catch (_) {} });
  };
  img.onerror = function () { failed = true; ready = false; };
  img.src = IMG_SRC;

  // Busca el recuadro real del mapa dentro de la imagen, ignorando los
  // bordes transparentes (mismo algoritmo que MapController).
  function detectContentRect(im) {
    var w = im.naturalWidth, h = im.naturalHeight;
    if (!w || !h) return null;
    try {
      var off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      var octx = off.getContext('2d');
      octx.drawImage(im, 0, 0, w, h);
      var data = octx.getImageData(0, 0, w, h).data;
      var step = Math.max(1, Math.floor(w / 800));
      var minX = w, minY = h, maxX = -1, maxY = -1;
      for (var y = 0; y < h; y += step) {
        var rowBase = y * w * 4;
        for (var x = 0; x < w; x += step) {
          if (data[rowBase + x * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return null;
      minX = Math.max(0, minX - step);
      minY = Math.max(0, minY - step);
      maxX = Math.min(w - 1, maxX + step);
      maxY = Math.min(h - 1, maxY + step);
      return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    } catch (_) {
      return null;
    }
  }

  function whenReady(fn) {
    if (ready) { fn(); return; }
    if (failed) return;
    pending.push(fn);
  }

  function render(canvas, worldX, worldZ, opts) {
    if (!canvas || !isFinite(worldX) || !isFinite(worldZ)) return false;
    var o = opts || {};
    var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    var cssW = Math.round(canvas.clientWidth || o.width || 260);
    var cssH = Math.round(canvas.clientHeight || o.height || 128);
    if (canvas.width !== cssW * dpr) canvas.width = cssW * dpr;
    if (canvas.height !== cssH * dpr) canvas.height = cssH * dpr;
    var ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    var bg = ctx.createLinearGradient(0, 0, 0, cssH);
    bg.addColorStop(0, '#101a2c');
    bg.addColorStop(1, '#0a1428');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    var cr = contentRect || { x: 0, y: 0, w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
    var fullW = img.naturalWidth || cr.w;
    var fullH = img.naturalHeight || cr.h;
    var u = (worldX - WORLD.minX) / (WORLD.maxX - WORLD.minX);
    var v = (worldZ - WORLD.minZ) / (WORLD.maxZ - WORLD.minZ);
    var cxImg = cr.x + u * cr.w;
    var cyImg = cr.y + v * cr.h;

    if (ready) {
      var sw = Math.max(120, Math.round(cr.w / (o.zoomDiv || 22)));
      var sh = Math.max(90, Math.round(sw * (cssH / cssW)));
      var sx = Math.max(0, Math.min(Math.max(0, fullW - sw), cxImg - sw / 2));
      var sy = Math.max(0, Math.min(Math.max(0, fullH - sh), cyImg - sh / 2));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      try { ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cssW, cssH); } catch (_) {}
    }

    var vg = ctx.createRadialGradient(cssW / 2, cssH / 2, cssH * 0.12, cssW / 2, cssH / 2, cssH * 0.9);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(4,9,20,.62)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cssW, cssH);

    var mx = Math.round(cssW / 2) + 0.5;
    var my = Math.round(cssH / 2) + 0.5;
    var color = o.color || '#e54850';

    ctx.save();
    ctx.strokeStyle = 'rgba(56,189,248,.40)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(mx, 8); ctx.lineTo(mx, cssH - 8);
    ctx.moveTo(8, my); ctx.lineTo(cssW - 8, my);
    ctx.stroke();
    ctx.restore();

    for (var i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(mx, my, 9 + i * 9, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.34 - i * 0.15;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(mx, my, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(mx, my, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,.09)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cssW - 1, cssH - 1);
    return true;
  }

  window.HRP_MINIMAP_STATIC = {
    render: render,
    whenReady: whenReady,
    isReady: function () { return ready; },
    hasFailed: function () { return failed; },
  };
})();
