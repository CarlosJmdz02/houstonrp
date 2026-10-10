// ============================================================
// HRPRADIO — Radio táctica dentro del MDT (1 a 5 canales)
// ------------------------------------------------------------
// TRANSPORTE: WebRTC (audio P2P) + señalización por Supabase
// Realtime Broadcast. Es el MISMO esquema que ya usa la bodycam
// (assets/bodycam-app.js), así que no depende de nada nuevo.
//
// • 5 canales, la elección queda guardada
// • Push-to-talk con tecla rebindable + botón táctil (tocar y sostener)
// • Sonido al pulsar (audios/radio-ptt.wav)
// • Se puede ocultar/mostrar; el estado persiste en localStorage
//
// La radio NO transmite nada hasta que el usuario pulsa el PTT:
// la pista de audio nace silenciada (track.enabled = false).
// ============================================================
(function () {
  'use strict';
  if (window.__HRP_RADIO) return;
  window.__HRP_RADIO = true;

  var LS = {
    visible: 'hrp_radio_visible',
    channel: 'hrp_radio_channel',
    ptt:     'hrp_radio_ptt',
    vol:     'hrp_radio_vol',
  };
  var CHANNELS = [1, 2, 3, 4, 5];
  var DEFAULT_PTT = 'KeyR';   // mantener R pulsado para hablar

  var ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  ];

  var ME = Math.random().toString(36).slice(2, 10);

  var state = {
    visible:  localStorage.getItem(LS.visible) !== '0',
    channel:  parseInt(localStorage.getItem(LS.channel) || '1', 10) || 1,
    pttKey:   localStorage.getItem(LS.ptt) || DEFAULT_PTT,
    volume:   Number(localStorage.getItem(LS.vol) || '1'),
    online:   0,
    talking:  false,
    pendingKey: false,   // esperando una tecla para re-asignar el PTT
  };

  var chan = null;
  var localStream = null;
  var peers = {};        // peerId -> RTCPeerConnection
  var remoteAudios = {}; // peerId -> HTMLAudioElement
  var started = false;

  // ---------- DOM ----------
  function $(id) { return document.getElementById(id); }

  function save(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  function status(txt, cls) {
    var el = $('radio-status');
    if (el) { el.textContent = txt; el.className = 'radio-status ' + (cls || ''); }
  }

  function onlineCount(n) {
    state.online = n;
    var el = $('radio-online');
    if (el) el.textContent = n + (n === 1 ? ' en línea' : ' en línea');
  }

  // ---------- Sonido de PTT ----------
  function playClick() {
    var a = $('radio-ptt-sound');
    if (!a) return;
    try {
      a.volume = Math.max(0, Math.min(1, state.volume));
      a.currentTime = 0;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (_) {}
  }

  // ---------- UI: mostrar / ocultar ----------
  function applyVisibility() {
    var panel = $('radio-panel');
    var btn = $('radio-toggle');
    if (panel) panel.classList.toggle('hidden', !state.visible);
    if (btn) btn.classList.toggle('active', state.visible);
    save(LS.visible, state.visible ? '1' : '0');
    // Al ocultar dejamos de escuchar el PTT para no dejar la clave colgada.
    if (!state.visible) releasePTT();
  }

  function toggleRadio() {
    state.visible = !state.visible;
    applyVisibility();
    if (state.visible) {
      if (started) status('Canal ' + state.channel + ' · listo', '');
      else status('Elegí un canal para conectar', '');
    }
  }

  // ---------- Canales ----------
  function channelName() { return 'hrpradio-ch' + state.channel; }

  function setChannel(n) {
    n = CHANNELS.indexOf(Number(n)) >= 0 ? Number(n) : 1;
    if (n === state.channel && chan) return;
    state.channel = n;
    save(LS.channel, String(n));
    var sel = $('radio-channel');
    if (sel) sel.value = String(n);
    var lab = $('radio-channel-label');
    if (lab) lab.textContent = 'CH ' + n;
    teardown();
    connect();
  }

  // ---------- Audio local (solo existe tras un gesto del usuario) ----------
  function ensureMic() {
    if (localStream) return Promise.resolve(localStream);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('El navegador no permite micrófono'));
    }
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    }).then(function (s) {
      localStream = s;
      // Nace silenciada: no transmitimos nada sin PTT.
      s.getAudioTracks().forEach(function (t) { t.enabled = false; });
      return s;
    });
  }

  function setTalking(on) {
    state.talking = on;
    if (localStream) localStream.getAudioTracks().forEach(function (t) { t.enabled = on; });
    var dot = $('radio-ptt-dot');
    if (dot) dot.classList.toggle('on', on);
    var lbl = $('radio-ptt-label');
    if (lbl) lbl.textContent = on ? 'TRANSMITIENDO…' : 'Mantener para hablar';
    var wrap = $('radio-ptt');
    if (wrap) wrap.classList.toggle('talking', on);
  }

  function pressPTT() {
    if (state.talking) return;
    if (!state.visible) return;
    ensureMic().then(function () {
      playClick();
      setTalking(true);
      status('Transmitiendo en CH ' + state.channel, 'live');
    }).catch(function (e) {
      status('Sin micrófono: ' + (e && e.message ? e.message : 'error'), 'err');
    });
  }

  function releasePTT() {
    if (!state.talking) return;
    setTalking(false);
    status(state.online > 0 ? ('CH ' + state.channel + ' · ' + state.online + ' en línea') : 'CH ' + state.channel + ' · solo vos', '');
  }

  // ---------- Tecla PTT ----------
  function keyLabel(code) {
    if (!code) return '';
    if (code.indexOf('Key') === 0) return code.slice(3);
    if (code.indexOf('Digit') === 0) return code.slice(5);
    if (code === 'Space') return 'ESPACIO';
    if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
    if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL';
    if (code === 'AltLeft' || code === 'AltRight') return 'ALT';
    return code.replace(/Left|Right/, '').toUpperCase();
  }

  function renderPttKey() {
    var el = $('radio-ptt-key');
    if (el) el.textContent = keyLabel(state.pttKey);
  }

  function bindKey() {
    state.pendingKey = true;
    var el = $('radio-ptt-key');
    if (el) el.textContent = '…';
    status('Pulsá la tecla que quieras usar', 'warn');
  }

  document.addEventListener('keydown', function (e) {
    if (state.pendingKey) {
      e.preventDefault();
      state.pendingKey = false;
      if (e.code === 'Escape') { renderPttKey(); status('Re-asignación cancelada', ''); return; }
      state.pttKey = e.code;
      save(LS.ptt, e.code);
      renderPttKey();
      status('Tecla asignada: ' + keyLabel(e.code), '');
      return;
    }
    if (!state.visible) return;
    if (e.code !== state.pttKey || e.repeat) return;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();
    pressPTT();
  });

  document.addEventListener('keyup', function (e) {
    if (e.code !== state.pttKey) return;
    if (!state.visible) return;
    e.preventDefault();
    releasePTT();
  });

  // ---------- WebRTC (mismo esquema que la bodycam) ----------
  function send(event, payload) {
    if (!chan) return;
    try { chan.send({ type: 'broadcast', event: event, payload: payload }); } catch (_) {}
  }

  function pcFor(peer) {
    if (peers[peer]) return peers[peer];
    var pc = new RTCPeerConnection({ iceServers: ICE });
    peers[peer] = pc;

    pc.onicecandidate = function (ev) {
      if (ev.candidate) send('signal', { to: peer, from: ME, data: { t: 'ice', c: ev.candidate } });
    };
    pc.ontrack = function (ev) {
      var a = remoteAudios[peer];
      if (!a) {
        a = document.createElement('audio');
        a.autoplay = true;
        a.setAttribute('data-peer', peer);
        var host = document.getElementById('radio-voices');
        if (host) host.appendChild(a);
        remoteAudios[peer] = a;
      }
      a.srcObject = ev.streams && ev.streams[0] ? ev.streams[0] : new MediaStream([ev.track]);
      a.volume = state.volume;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') dropPeer(peer);
    };
    return pc;
  }

  function dropPeer(peer) {
    var pc = peers[peer];
    if (pc) { try { pc.close(); } catch (_) {} delete peers[peer]; }
    var a = remoteAudios[peer];
    if (a) { try { a.pause(); } catch (_) {} if (a.parentNode) a.parentNode.removeChild(a); delete remoteAudios[peer]; }
    send('bye', { from: ME, to: peer });
    updateCount();
  }

  function addLocalTrack(pc) {
    if (!localStream) return;
    localStream.getTracks().forEach(function (t) { try { pc.addTrack(t, localStream); } catch (_) {} });
  }

  function connectTo(peer) {
    if (peers[peer]) return;
    ensureMic().then(function () {
      var pc = pcFor(peer);
      addLocalTrack(pc);
      return pc.createOffer().then(function (offer) {
        return pc.setLocalDescription(offer).then(function () {
          send('signal', { to: peer, from: ME, data: { t: 'offer', sdp: pc.localDescription } });
        });
      });
    }).catch(function () { /* sin micrófono igual podemos escuchar */ });
  }

  function handleSignal(p) {
    if (!p || p.to !== ME || !p.data) return;
    var from = p.from, d = p.data;
    if (d.t === 'offer') {
      var pc = pcFor(from);
      addLocalTrack(pc);
      pc.setRemoteDescription(new RTCSessionDescription(d.sdp))
        .then(function () { return pc.createAnswer(); })
        .then(function (ans) { return pc.setLocalDescription(ans).then(function () {
          send('signal', { to: from, from: ME, data: { t: 'answer', sdp: pc.localDescription } });
        }); })
        .catch(function () {});
    } else if (d.t === 'answer') {
      var pc2 = peers[from];
      if (pc2) pc2.setRemoteDescription(new RTCSessionDescription(d.sdp)).catch(function () {});
    } else if (d.t === 'ice') {
      var pc3 = peers[from];
      if (pc3 && pc3.remoteDescription) pc3.addIceCandidate(new RTCIceCandidate(d.c)).catch(function () {});
    }
  }

  function updateCount() {
    onlineCount(Object.keys(peers).length + (chan ? 1 : 0));
  }

  // ---------- Canal Realtime ----------
  function connect() {
    var sb = null;
    if (window.__HRP_RADIO_SB) sb = window.__HRP_RADIO_SB;
    else if (window.supabase && window.supabase.createClient && typeof supabaseUrl !== 'undefined') {
      sb = window.supabase.createClient(supabaseUrl, typeof supabaseKey !== 'undefined' ? supabaseKey : '');
      window.__HRP_RADIO_SB = sb;
    }
    if (!sb) { status('Sin conexión con Supabase', 'err'); return; }

    status('Conectando…', 'warn');
    chan = sb.channel(channelName(), { broadcast: { self: false } });

    chan.on('broadcast', { event: 'hello' }, function (msg) {
      var from = msg && msg.payload && msg.payload.from;
      if (!from || from === ME) return;
      if (ME < from) connectTo(from);          // sólo uno inicia → sin dobles ofertas
      updateCount();
    });

    chan.on('broadcast', { event: 'bye' }, function (msg) {
      var from = msg && msg.payload && msg.payload.from;
      if (from) dropPeer(from);
      updateCount();
    });

    chan.on('broadcast', { event: 'signal' }, function (msg) {
      handleSignal(msg && msg.payload);
    });

    chan.subscribe(function (st) {
      if (st === 'SUBSCRIBED') {
        started = true;
        onlineCount(1);
        send('hello', { from: ME });
        status('CH ' + state.channel + ' · listo', '');
      } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') {
        status('Error de conexión, reintentando…', 'err');
        setTimeout(function () { if (state.visible) connect(); }, 4000);
      }
    });
  }

  function teardown() {
    Object.keys(peers).forEach(dropPeer);
    if (chan) { try { chan.unsubscribe(); } catch (_) {} chan = null; }
    started = false;
    onlineCount(0);
  }

  // ---------- API pública ----------
  window.HRPRadio = {
    toggle: toggleRadio,
    setChannel: setChannel,
    bindKey: bindKey,
    press: pressPTT,
    release: releasePTT,
    setVolume: function (v) {
      state.volume = Math.max(0, Math.min(1, Number(v)));
      save(LS.vol, String(state.volume));
      Object.keys(remoteAudios).forEach(function (k) { remoteAudios[k].volume = state.volume; });
    },
    isVisible: function () { return state.visible; },
    state: state,
  };

  // ---------- Arranque ----------
  document.addEventListener('DOMContentLoaded', function () {
    var sel = $('radio-channel');
    if (sel) {
      sel.value = String(state.channel);
      sel.addEventListener('change', function () { setChannel(Number(sel.value)); });
    }
    renderPttKey();
    applyVisibility();

    var vol = $('radio-volume');
    if (vol) {
      vol.value = String(Math.round(state.volume * 100));
      vol.addEventListener('input', function () { window.HRPRadio.setVolume(Number(vol.value) / 100); });
    }
    var lbl = $('radio-channel-label');
    if (lbl) lbl.textContent = 'CH ' + state.channel;
    status('CH ' + state.channel + ' · sin conectar', '');
  });
})();
