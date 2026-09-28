// ─────────────────────────────────────────────────────────────
// BODYCAM de HOUSTON RP — WebRTC + señalización por
// Supabase Realtime Broadcast (reemplaza a PeerJS).
//
// · La librería de Supabase se resuelve SOLO en este archivo:
//   1) window.__HRPBC_SB (si la página ya lo cargó)
//   2) assets/supabase-js.umd.js  → window.supabase  (local, sin CDN)
//   3) import() dinámico desde CDNs (último recurso)
//   Por eso el botón de bodycam nunca debería volver a decir
//   "la librería aún no cargó".
//
// · Un oficial puede ser visto por VARIOS visores al mismo tiempo
//   (panel de Dispatch + otra pestaña), hasta MAX_VIEWERS.
//
// · Codificación limitada a 15 fps / ~450 kbps para no meter lag
//   en el juego (Roblox) del oficial que transmite.
// ─────────────────────────────────────────────────────────────
(function () {
  'use strict';

  var SB_URL = (typeof supabaseUrl !== 'undefined') ? supabaseUrl
    : 'https://qqgtroxrkccftlrpqwsk.supabase.co';
  var SB_KEY = (typeof supabaseKey !== 'undefined') ? supabaseKey
    : 'sb_publishable_ZTcgdobN4BxLtxo59UUCuA_raeLls6H';

  // Último recurso si el archivo local no estuviera publicado.
  var ESM_FALLBACKS = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
    'https://esm.sh/@supabase/supabase-js@2'
  ];

  // Estrategia ICE: STUN públicos + TURN libre de Open Relay.
  var ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
  ];

  // Límites de recursos (menos CPU para Roblox / para Dispatch).
  var SEND_MAX_BITRATE = 450000;   // 450 kbps
  var SEND_MAX_FPS = 15;
  var MAX_VIEWERS = 3;             // visores simultáneos por bodycam

  var client = null;
  var bootState = 0;               // 0 = idle, 1 = cargando, 2 = ok, 3 = falló
  var bootWaiters = [];

  // import() dinámico construido en runtime: así un navegador viejo que no
  // soporta `import()` no rompe la carga de TODO el archivo.
  var dynImport = (function () {
    try { return new Function('u', 'return import(u);'); } catch (_) { return null; }
  })();

  function makeClient(fn, url, key) {
    try { return fn(url, key); } catch (_) { return null; }
  }

  function pickSource() {
    if (window.__HRPBC_SB && typeof window.__HRPBC_SB.createClient === 'function') {
      return {
        fn: window.__HRPBC_SB.createClient,
        url: window.__HRPBC_SB.url || SB_URL,
        key: window.__HRPBC_SB.key || SB_KEY
      };
    }
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      return { fn: window.supabase.createClient, url: SB_URL, key: SB_KEY };
    }
    return null;
  }

  function resolveNow() {
    var s = pickSource();
    if (!s) return false;
    client = makeClient(s.fn, s.url, s.key);
    return !!client;
  }

  function resolveAsync(done) {
    if (!dynImport) { done(false); return; }
    var i = 0;
    function next() {
      if (resolveNow()) { done(true); return; }
      if (i >= ESM_FALLBACKS.length) { done(false); return; }
      var url = ESM_FALLBACKS[i++];
      var p;
      try { p = dynImport(url); } catch (_) { next(); return; }
      if (!p || !p.then) { next(); return; }
      p.then(function (mod) {
        var fn = mod && (mod.createClient || (mod.default && mod.default.createClient));
        if (typeof fn === 'function' && !window.__HRPBC_SB) {
          window.__HRPBC_SB = { createClient: fn, url: SB_URL, key: SB_KEY };
        }
        next();
      }).catch(next);
    }
    next();
  }

  function finishBoot(ok) {
    bootState = ok ? 2 : 3;
    var q = bootWaiters.slice();
    bootWaiters.length = 0;
    for (var i = 0; i < q.length; i++) {
      try { q[i](ok); } catch (_) {}
    }
  }

  // cb(ok). Se llama en cuanto el cliente esté disponible (o falla).
  function boot(cb) {
    if (client) { cb(true); return; }
    bootWaiters.push(cb);
    if (bootState === 1) return;          // ya se está cargando
    if (bootState === 2) { finishBoot(true); return; }
    // bootState 3 (falló antes) o 0 → reintentamos.
    bootState = 1;
    if (resolveNow()) { finishBoot(true); return; }
    resolveAsync(function (ok) { finishBoot(ok); });
  }

  function channelName(peerId) {
    return 'hrpbc:' + String(peerId || '');
  }

  function toCandidate(c) {
    return (c && typeof c.toJSON === 'function') ? c.toJSON() : c;
  }

  function msgPayload(raw) {
    return (raw && raw.payload && typeof raw.payload === 'object') ? raw.payload : (raw || {});
  }

  // Limita bitrate/fps del encoder (menos uso de CPU en el emisor).
  function applySendLimits(pc) {
    setTimeout(function () {
      try {
        var sender = (pc.getSenders() || []).find(function (s) {
          return s.track && s.track.kind === 'video';
        });
        if (!sender || !sender.getParameters) return;
        var params = sender.getParameters();
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        params.encodings[0] = Object.assign({}, params.encodings[0], {
          maxBitrate: SEND_MAX_BITRATE,
          maxFramerate: SEND_MAX_FPS,
          scaleResolutionDownBy: 2
        });
        sender.setParameters(params).catch(function () {});
      } catch (_) {}
    }, 300);
  }

  // ──────────────────────────────────────────────
  // LADO EMISOR (oficial en el MDT)
  // opts: { stream, userId, userName, maxViewers,
  //         onStart(peerId, link), onConnect(), onError(msg), onStop() }
  // Devuelve { peerId, link, stop() }
  // ──────────────────────────────────────────────
  function startServer(opts) {
    var stream = opts.stream;
    var userId = opts.userId;
    var userName = opts.userName || 'Oficial';
    var maxViewers = Number(opts.maxViewers) > 0 ? Number(opts.maxViewers) : MAX_VIEWERS;

    var safeId = String(userId || Date.now()).replace(/\W/g, '');
    var peerId = 'hrpbc-' + safeId + '-' + Math.random().toString(36).slice(2, 6);
    var chan = null;
    var chanReady = false;
    var stopped = false;

    var pcs = {};       // vid → RTCPeerConnection
    var remoteCands = {}; // vid → candidatos ICE en cola
    var dropTimers = {};  // vid → timer de desconexión

    function dropViewer(vid) {
      clearTimeout(dropTimers[vid]);
      delete dropTimers[vid];
      var pc = pcs[vid];
      delete pcs[vid];
      delete remoteCands[vid];
      if (pc) {
        try { pc.onconnectionstatechange = null; } catch (_) {}
        try { pc.close(); } catch (_) {}
      }
    }

    // Un PeerConnection por visor: así varios pueden mirar a la vez
    // sin pisarse la negociación.
    function newViewer(vid) {
      if (stopped) return null;
      var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      remoteCands[vid] = [];

      pc.onicecandidate = function (ev) {
        if (stopped || !ev.candidate || !chan || !chanReady) return;
        try {
          chan.send({ type: 'broadcast', event: 'ice', payload: { v: vid, c: toCandidate(ev.candidate) } });
        } catch (_) {}
      };

      pc.onconnectionstatechange = function () {
        if (stopped || pcs[vid] !== pc) return;
        var st = pc.connectionState;
        if (st === 'connected') {
          clearTimeout(dropTimers[vid]);
          delete dropTimers[vid];
          if (opts.onConnect) opts.onConnect();
        } else if (st === 'failed' || st === 'closed') {
          dropViewer(vid);
        } else if (st === 'disconnected') {
          clearTimeout(dropTimers[vid]);
          dropTimers[vid] = setTimeout(function () {
            if (!stopped && pcs[vid] === pc && pc.connectionState === 'disconnected') dropViewer(vid);
          }, 12000);
        }
      };

      applySendLimits(pc);

      // Si el visor nunca llega a conectarse, liberamos el lugar a los 25 s
      // (sino quedaría un asiento ocupado para siempre).
      dropTimers[vid] = setTimeout(function () {
        if (!stopped && pcs[vid] === pc && pc.connectionState !== 'connected') dropViewer(vid);
      }, 25000);

      (stream.getVideoTracks() || []).forEach(function (t) {
        try { pc.addTrack(t, stream); } catch (_) {}
      });

      return pc;
    }

    function fail(msg) {
      if (stopped) return;
      stop0(false);
      if (opts.onError) opts.onError(msg || 'Error de bodycam');
    }

    boot(function (ok) {
      if (stopped) return;
      if (!ok || !client) {
        if (opts.onError) opts.onError('No se pudo conectar con el servicio de señalización.');
        return;
      }

      chan = client.channel(channelName(peerId), { broadcast: { self: false } });

      chan.on('broadcast', { event: 'viewer-join' }, function (raw) {
        if (stopped) return;
        var p = msgPayload(raw);
        var vid = p.v || '';
        if (!vid) return;
        if (pcs[vid]) dropViewer(vid);         // reintento del mismo visor
        if (Object.keys(pcs).length >= maxViewers) {
          try { chan.send({ type: 'broadcast', event: 'busy', payload: { v: vid } }); } catch (_) {}
          return;
        }
        var pc = newViewer(vid);
        if (!pc) return;
        pcs[vid] = pc;
        handleOffer(vid, pc);
      });

      chan.on('broadcast', { event: 'viewer-leave' }, function (raw) {
        var p = msgPayload(raw);
        if (p.v) dropViewer(p.v);
      });

      chan.on('broadcast', { event: 'answer' }, async function (raw) {
        if (stopped) return;
        var p = msgPayload(raw);
        if (!p.sdp) return;
        var vid = p.v || '';
        var pc = pcs[vid];
        if (!pc) return;
        try {
          await pc.setRemoteDescription({ type: 'answer', sdp: p.sdp });
          (remoteCands[vid] || []).forEach(function (c) {
            try { pc.addIceCandidate(c); } catch (_) {}
          });
          remoteCands[vid] = [];
        } catch (_) {}
      });

      chan.on('broadcast', { event: 'ice' }, async function (raw) {
        if (stopped) return;
        var p = msgPayload(raw);
        if (!p.c) return;
        var vid = p.v || '';
        var pc = pcs[vid];
        if (!pc) return;
        try {
          if (pc.remoteDescription) await pc.addIceCandidate(p.c);
          else (remoteCands[vid] = remoteCands[vid] || []).push(p.c);
        } catch (_) {}
      });

      chan.subscribe(function (status) {
        if (stopped) return;
        if (status === 'SUBSCRIBED') {
          chanReady = true;
          if (opts.onStart) opts.onStart(peerId, linkUrl(peerId, userName));
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          fail('El canal de señalización no está disponible. Reintentá.');
        }
      });
    });

    async function handleOffer(vid, pc) {
      if (stopped || pcs[vid] !== pc) return;
      try {
        var offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (stopped || pcs[vid] !== pc) return;
        chan.send({ type: 'broadcast', event: 'offer', payload: { v: vid, sdp: pc.localDescription.sdp } });
      } catch (err) {
        console.warn('bodycam offer:', err);
        dropViewer(vid);
      }
    }

    function stop0(sendStop) {
      if (stopped) return;
      stopped = true;
      Object.keys(dropTimers).forEach(function (k) { clearTimeout(dropTimers[k]); });
      dropTimers = {};
      if (sendStop && chan && chanReady) {
        try { chan.send({ type: 'broadcast', event: 'stop', payload: {} }); } catch (_) {}
      }
      Object.keys(pcs).forEach(function (k) {
        try { pcs[k].close(); } catch (_) {}
      });
      pcs = {};
      remoteCands = {};
      try { if (chan) chan.unsubscribe(); } catch (_) {}
      try { (stream.getTracks() || []).forEach(function (t) { t.stop(); }); } catch (_) {}
    }

    return {
      peerId: peerId,
      link: linkUrl(peerId, userName),
      stop: function () {
        stop0(true);
        if (opts.onStop) opts.onStop();
      }
    };
  }

  function linkUrl(peerId, userName) {
    return window.location.origin + '/bodycam-watch.html?bc=' +
      encodeURIComponent(peerId) + '&o=' + encodeURIComponent(userName || 'Oficial');
  }

  // ──────────────────────────────────────────────
  // LADO VISOR (despacho / MDT / panel)
  // opts: { peerId, officerName, viewerId,
  //         onStream(stream), onDone({ ok, msg, retry }) }
  // Devuelve { stop() }
  // ──────────────────────────────────────────────
  function startViewer(opts) {
    var peerId = opts.peerId;
    // Identificador único por visor: el emisor responde SOLO a este visor
    // aunque los mensajes se difundan por todo el canal.
    var vid = 'v' + Math.random().toString(36).slice(2, 10);

    var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    var chan = null;
    var chanReady = false;
    var stopped = false;
    var remoteStream = null;
    var gotMedia = false;
    var gotOffer = false;
    var pendingRemoteCands = [];
    var liveTimer = null;
    var joinTimers = [];

    function sendJoin() {
      if (stopped || !chan || !chanReady) return;
      try {
        chan.send({ type: 'broadcast', event: 'viewer-join', payload: { v: vid, i: opts.viewerId || '' } });
      } catch (_) {}
    }

    pc.ontrack = function (ev) {
      if (stopped) return;
      if (ev.streams && ev.streams[0]) remoteStream = ev.streams[0];
      else {
        remoteStream = remoteStream || new MediaStream();
        remoteStream.addTrack(ev.track);
      }
      gotMedia = true;
      if (opts.onStream) opts.onStream(remoteStream);
    };

    pc.onicecandidate = function (ev) {
      if (stopped || !ev.candidate || !chan || !chanReady) return;
      try {
        chan.send({ type: 'broadcast', event: 'ice', payload: { v: vid, c: toCandidate(ev.candidate) } });
      } catch (_) {}
    };

    pc.onconnectionstatechange = function () {
      if (stopped) return;
      if (pc.connectionState === 'failed') {
        finish(false, 'No se pudo establecer la transmisión. Revisá la conexión y reintentá.', true);
      } else if (pc.connectionState === 'disconnected') {
        finish(false, 'Se perdió la señal de la bodycam.', true);
      } else if (pc.connectionState === 'closed') {
        finish(false, 'La transmisión terminó.', false);
      }
    };

    boot(function (ok) {
      if (stopped) return;
      if (!ok || !client) {
        finish(false, 'No se pudo conectar con el servicio de señalización.', true);
        return;
      }

      chan = client.channel(channelName(peerId), { broadcast: { self: false } });

      chan.on('broadcast', { event: 'offer' }, function (raw) {
        var p = msgPayload(raw);
        if (!p.sdp || p.v !== vid || stopped) return;
        gotOffer = true;
        startTimeout();
        handleOffer(p.sdp);
      });

      chan.on('broadcast', { event: 'ice' }, function (raw) {
        var p = msgPayload(raw);
        if (!p.c || stopped) return;
        if (p.v && p.v !== vid) return;
        try {
          if (pc.remoteDescription) pc.addIceCandidate(p.c);
          else pendingRemoteCands.push(p.c);
        } catch (_) {}
      });

      chan.on('broadcast', { event: 'busy' }, function (raw) {
        var p = msgPayload(raw);
        if (p.v !== vid || stopped) return;
        finish(false, 'Esta bodycam ya tiene 3 visores abiertos. Cerrá uno e intentá de nuevo.', true);
      });

      chan.on('broadcast', { event: 'stop' }, function () {
        if (stopped) return;
        finish(false, 'El oficial detuvo la bodycam.', false);
      });

      chan.subscribe(function (status) {
        if (stopped) return;
        if (status === 'SUBSCRIBED') {
          chanReady = true;
          sendJoin();
          // Si el oficial se suscribe DESPUÉS que nosotros (o el primer
          // mensaje se perdió), volvemos a pedir la oferta un par de veces.
          [2500, 6000].forEach(function (ms) {
            joinTimers.push(setTimeout(function () {
              if (!stopped && !gotOffer) sendJoin();
            }, ms));
          });
          startTimeout();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          finish(false, 'No se pudo abrir el canal de la bodycam. Reintentá.', true);
        }
      });
    });

    async function handleOffer(sdp) {
      if (stopped) return;
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: sdp });
        (pendingRemoteCands || []).forEach(function (c) {
          try { pc.addIceCandidate(c); } catch (_) {}
        });
        pendingRemoteCands = [];
        var answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (stopped) return;
        chan.send({ type: 'broadcast', event: 'answer', payload: { v: vid, sdp: pc.localDescription.sdp } });
      } catch (err) {
        finish(false, 'No se pudo negociar la transmisión: ' + (err && err.message ? err.message : 'desconocido'), true);
      }
    }

    function startTimeout() {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(function () {
        if (stopped || gotMedia) return;
        finish(false, 'El oficial no está transmitiendo en este momento.', true);
      }, 20000);
    }

    function finish(ok, msg, retry) {
      if (stopped) return;
      stopped = true;
      clearTimeout(liveTimer);
      joinTimers.forEach(function (t) { clearTimeout(t); });
      joinTimers = [];
      try {
        if (chan && chanReady) chan.send({ type: 'broadcast', event: 'viewer-leave', payload: { v: vid } });
      } catch (_) {}
      try { if (chan) chan.unsubscribe(); } catch (_) {}
      try { pc.close(); } catch (_) {}
      if (opts.onDone) opts.onDone({ ok: !!ok, msg: msg || '', retry: !!retry });
    }

    return {
      stop: function () {
        finish(false, 'Se cortó la visualización.', false);
      }
    };
  }

  // API pública
  var HRPBC = {
    startServer: startServer,
    startViewer: startViewer,
    // HRPBC.ready([ms]) → Promise: resuelve cuando la librería de señalización
    // está lista. Se usa desde el MDT para no mostrar "aún no cargó".
    ready: function (timeoutMs) {
      return new Promise(function (resolve, reject) {
        var done = false;
        var t = setTimeout(function () {
          if (done) return;
          done = true;
          reject(new Error('timeout'));
        }, timeoutMs > 0 ? timeoutMs : 15000);
        boot(function (ok) {
          if (done) return;
          done = true;
          clearTimeout(t);
          if (ok && client) resolve(client);
          else reject(new Error('sin señalización'));
        });
      });
    },
    isReady: function () { return !!client; }
  };

  window.HRPBC = HRPBC;
})();
