// ============================================================
// HRPRADIO — Radio táctica del MDT (1 a 5 canales)
// ------------------------------------------------------------
// TRANSPORTE: WebRTC audio P2P + señalización por Supabase
// Realtime Broadcast (mismo esquema que la bodycam).
//
// Correcciones respecto a la v1:
//  1) MICRÓFONO TEMPRANO: se pide al abrir la radio y al entrar
//     al canal (hay gesto del usuario). Si el permiso llega DESPUÉS
//     de crear las conexiones, se añade la pista a todas ellas y se
//     renegocia — era por eso que otros no te oían.
//  2) onnegotiationneeded: renegocia cuando aparece una pista nueva.
//  3) Roster con nombres reales (quién está conectado).
//  4) Sonido también al SOLTAR el PTT (bajada de micro).
//
// La pista nace silenciada: no transmitimos nada sin PTT.
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
  var DEFAULT_PTT = 'KeyR';

  var ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  ];

  var ME = Math.random().toString(36).slice(2, 10);

  var state = {
    // Nunca arranca conectada: hay que pulsar el botón de la radio.
    visible: false,
    connected: false,
    channel: parseInt(localStorage.getItem(LS.channel) || '1', 10) || 1,
    pttKey:  localStorage.getItem(LS.ptt) || DEFAULT_PTT,
    volume:  Number(localStorage.getItem(LS.vol) || '1'),
    talking: false,
    pendingKey: false,
    micError: '',
  };

  var chan = null;
  var localStream = null;
  var peers = {};        // peer -> RTCPeerConnection
  var roster = {};       // peer -> nombre
  var rosterTalking = {}; // peer -> está con el micro abierto
  var rosterReplyAt = {}; // peer -> timestamp del último "hello" que le mandamos
  var helloTimer = null;  // anuncio periódico de presencia
  var remoteAudios = {}; // peer -> HTMLAudioElement
  var started = false;
  var micPromise = null;

  function $(id) { return document.getElementById(id); }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  function myName() {
    try {
      var s = (typeof hrpGetSession === 'function') ? hrpGetSession() : null;
      var n = s && (s.username || s.global_name);
      if (n) return String(n);
      // Respaldo: el nombre que ya muestra la cabecera del MDT.
      var el = document.getElementById('user-name');
      if (el && el.textContent) {
        var t = el.textContent.trim();
        if (t && t !== 'Cargando…' && t !== '...') return t;
      }
      if (s && s.id) return String(s.id);
    } catch (_) {}
    return 'Unidad';
  }

  function status(txt, cls) {
    var el = $('radio-status');
    if (el) { el.textContent = txt; el.className = 'radio-status ' + (cls || ''); }
  }

  function renderRoster() {
    var box = document.getElementById('radio-roster');
    var cnt = document.getElementById('radio-roster-count');
    var names = Object.keys(roster).map(function (k) { return { id: k, name: roster[k] }; });
    if (cnt) cnt.textContent = String(names.length + 1);   // + yo
    if (!box) return;
    var mine = '<div class="roster-row me' + (state.talking ? ' talking' : '') + '">' +
      '<span class="roster-dot"></span><span class="roster-name">' +
      escTxt(myName()) + '<em> (vos)</em></span></div>';
    var others = names.map(function (n) {
      var talking = !!rosterTalking[n.id];
      return '<div class="roster-row' + (talking ? ' talking' : '') + '">' +
        '<span class="roster-dot"></span><span class="roster-name">' + escTxt(n.name || n.id) + '</span>' +
        (talking ? '<span class="roster-live">● al aire</span>' : '') + '</div>';
    }).join('');
    box.innerHTML = mine + others;
  }

  function escTxt(s) {
    var d = document.createElement('div');
    d.textContent = (s === undefined || s === null) ? '' : String(s);
    return d.innerHTML;
  }

  // ---------- Sonidos ----------
  function playSound(id) {
    var a = document.getElementById(id);
    if (!a) return;
    try {
      a.volume = Math.max(0, Math.min(1, state.volume));
      a.currentTime = 0;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (_) {}
  }

  // ---------- Visibilidad ----------
  function showGate() {
    var g = document.getElementById('radio-gate');
    if (g) g.classList.remove('hidden');
    var i = document.getElementById('radio-gate-input');
    if (i) { i.value = ''; setTimeout(function () { try { i.focus(); } catch (_) {} }, 60); }
  }
  function hideGate() {
    var g = document.getElementById('radio-gate');
    if (g) g.classList.add('hidden');
  }

  /** Entrar a la radio: pide el canal (1 al 5) y recién ahí conecta. */
  function join(raw) {
    var n = parseInt(String(raw).trim(), 10);
    if (!(n >= 1 && n <= 5)) {
      var st = document.getElementById('radio-gate-err');
      if (st) st.textContent = 'Ingresá un número del 1 al 5';
      return;
    }
    var err = document.getElementById('radio-gate-err');
    if (err) err.textContent = '';
    state.connected = true;
    hideGate();
    armMic();                       // gesto del usuario → permiso de micrófono
    setChannel(n);
    logEvent('SISTEMA', 'Conectado a la red táctica HPD.', 'sys');
    logEvent('SISTEMA', channelLabel(n) + ' en escucha.', 'sys');
  }

  function applyVisibility() {
    var panel = $('radio-panel');
    var btn = $('radio-toggle');
    if (panel) panel.classList.toggle('hidden', !state.visible);
    if (btn) btn.classList.toggle('active', state.visible);
    save(LS.visible, state.visible ? '1' : '0');

    if (state.visible) {
      if (state.connected && chan) {
        hideGate();
        status('Escuchando · CH ' + state.channel, '');
      } else {
        // Todavía no eligió canal → nada de conexión, solo el selector.
        showGate();
        status('Elegí un canal (1 al 5)', 'warn');
      }
    } else {
      releasePTT();
      if (chan) { teardown(); }     // cerrar la radio = desconectar
      state.connected = false;
      showGate();
    }
  }

  function toggleRadio() {
    state.visible = !state.visible;
    applyVisibility();
  }

  // ---------- Canales ----------
  function channelName() { return 'hrpradio-ch' + state.channel; }

  function setChannel(n) {
    n = CHANNELS.indexOf(Number(n)) >= 0 ? Number(n) : 1;
    if (n === state.channel && chan) return;
    state.channel = n;
    save(LS.channel, String(n));
    var sel = $('radio-channel'); if (sel) sel.value = String(n);
    var lab = $('radio-channel-label'); if (lab) lab.textContent = 'CH ' + n;
    teardown();
    if (state.visible && state.connected) connect();
  }

  // ---------- Micrófono ----------
  function ensureMic() {
    if (localStream) return Promise.resolve(localStream);
    if (micPromise) return micPromise;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('navegador sin micrófono'));
    }
    micPromise = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    }).then(function (s) {
      localStream = s;
      micPromise = null;
      s.getAudioTracks().forEach(function (t) { t.enabled = false; });
      return s;
    }, function (e) {
      micPromise = null;
      state.micError = (e && e.message) || 'permiso denegado';
      throw e;
    });
    return micPromise;
  }

  /** Pide el micrófono y, cuando llega, lo engancha a TODAS las conexiones. */
  function armMic() {
    ensureMic().then(function () {
      Object.keys(peers).forEach(function (p) { attachLocal(peers[p], p); });
      var b = document.getElementById('radio-mic');
      if (b) b.classList.add('hidden');      // ya está concedido → se oculta
      state.micError = '';
    }).catch(function () {
      var b = document.getElementById('radio-mic');
      if (b) b.classList.remove('hidden');   // hace falta pulsarlo (gesto del usuario)
      status('Sin micrófono: tocá "Activar mic"', 'err');
    });
  }

  function hasLocalTrack(pc) {
    try {
      return pc.getSenders().some(function (s) { return s.track && s.track.kind === 'audio'; });
    } catch (_) { return false; }
  }

  function addLocalTrack(pc) {
    if (!localStream || !pc) return;
    var senders;
    try { senders = pc.getSenders(); } catch (_) { senders = []; }
    localStream.getAudioTracks().forEach(function (t) {
      var already = senders.some(function (s) { return s.track === t; });
      if (already) return;
      try { pc.addTrack(t, localStream); } catch (_) {}
    });
  }

  function attachLocal(pc, peer) {
    if (!pc || !localStream) return;
    if (hasLocalTrack(pc)) return;
    addLocalTrack(pc);
    negotiate(peer, pc);
  }

  function negotiate(peer, pc) {
    if (!pc || pc.signalingState !== 'stable') return;   // ya hay una negociación
    try {
      pc.createOffer().then(function (offer) {
        return pc.setLocalDescription(offer).then(function () {
          send('signal', { to: peer, from: ME, data: { t: 'offer', sdp: pc.localDescription } });
        });
      }).catch(function () {});
    } catch (_) {}
  }

  // ---------- PTT ----------
  function setTalking(on) {
    state.talking = on;
    if (localStream) localStream.getAudioTracks().forEach(function (t) { t.enabled = on; });
    var dot = $('radio-ptt-dot'); if (dot) dot.classList.toggle('on', on);
    var wrap = $('radio-ptt'); if (wrap) wrap.classList.toggle('talking', on);
    var lbl = $('radio-ptt-label');
    if (lbl) lbl.textContent = on ? 'Transmitiendo…' : 'Mantener para hablar';
    renderRoster();
    status(on ? 'Transmitiendo · CH ' + state.channel
              : ('Escuchando · CH ' + state.channel), on ? 'live' : '');
  }

  function pressPTT() {
    if (state.talking) return;
    if (!state.visible) return;
    armMic();
    ensureMic().then(function () {
      playSound('radio-ptt-sound');
      setTalking(true);
      // Todos los del canal oyen el "click" de quien abre el micro.
      send('ptt', { from: ME, on: true });
    }).catch(function () {
      status('Sin micrófono: tocá "Activar mic"', 'err');
    });
  }

  function releasePTT() {
    if (!state.talking) { return; }
    setTalking(false);
    playSound('radio-ptt-off');
    send('ptt', { from: ME, on: false });   // cierre de micro para todos
  }

  // ---------- Tecla PTT ----------
  function keyLabel(code) {
    if (!code) return '';
    if (code.indexOf('Key') === 0) return code.slice(3);
    if (code.indexOf('Digit') === 0) return code.slice(5);
    if (code === 'Space') return 'ESPACIO';
    if (/^Shift/.test(code)) return 'SHIFT';
    if (/^Control/.test(code)) return 'CTRL';
    if (/^Alt/.test(code)) return 'ALT';
    return code.replace(/Left|Right/, '').toUpperCase();
  }
  function renderPttKey() {
    var el = $('radio-ptt-key');
    if (el) el.textContent = keyLabel(state.pttKey);
  }
  function bindKey() {
    state.pendingKey = true;
    var el = $('radio-ptt-key'); if (el) el.textContent = '…';
    status('Pulsá la tecla a usar (Esc cancela)', 'warn');
  }

  document.addEventListener('keydown', function (e) {
    if (state.pendingKey) {
      e.preventDefault();
      state.pendingKey = false;
      if (e.code === 'Escape') { renderPttKey(); status('Re-asignación cancelada', ''); return; }
      state.pttKey = e.code;
      save(LS.ptt, e.code);
      renderPttKey();
      status('Tecla PTT: ' + keyLabel(e.code), '');
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

  // Seguridad: el PTT nunca puede quedarse trabado transmitiendo.
  window.addEventListener('pointerup', function () { releasePTT(); });
  window.addEventListener('pointercancel', function () { releasePTT(); });
  window.addEventListener('blur', function () { releasePTT(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) releasePTT();
  });

  // ---------- WebRTC ----------
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

    // Si aparece una pista nueva (micrófono concedido tarde), renegociamos.
    pc.onnegotiationneeded = function () {
      if (!peers[peer]) return;
      if (pc.signalingState !== 'stable') return;
      negotiate(peer, pc);
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
      if (pc.connectionState === 'failed') dropPeer(peer);
    };
    return pc;
  }

  function dropPeer(peer) {
    var pc = peers[peer];
    if (pc) { try { pc.close(); } catch (_) {} delete peers[peer]; }
    var a = remoteAudios[peer];
    if (a) { try { a.pause(); } catch (_) {} if (a.parentNode) a.parentNode.removeChild(a); delete remoteAudios[peer]; }
    delete roster[peer];
    delete rosterTalking[peer];
    send('bye', { from: ME, to: peer });
    renderRoster();
  }

  function connectTo(peer) {
    if (peers[peer]) return;
    // El micrófono se pide aparte (armMic); acá creamos la conexión igual
    // para poder RECIBIR aunque el permiso aún no llegó.
    var pc = pcFor(peer);
    addLocalTrack(pc);
    if (pc.signalingState === 'stable') negotiate(peer, pc);
    armMic();
  }

  function handleSignal(p) {
    if (!p || p.to !== ME || !p.data) return;
    var from = p.from, d = p.data;
    if (d.t === 'offer') {
      var pc = pcFor(from);
      // Esperamos hasta 3 s al micrófono para que la RESPUESTA ya traiga
      // nuestra pista de audio. Si no llega, contestamos igual (se puede
      // escuchar) y armMic() se encarga de renegociar después.
      Promise.race([
        ensureMic().catch(function () { return null; }),
        new Promise(function (r) { setTimeout(function () { r(null); }, 3000); }),
      ]).then(function () {
        addLocalTrack(pc);
        return pc.setRemoteDescription(new RTCSessionDescription(d.sdp))
          .then(function () { return pc.createAnswer(); })
          .then(function (ans) { return pc.setLocalDescription(ans).then(function () {
            send('signal', { to: from, from: ME, data: { t: 'answer', sdp: pc.localDescription } });
          }); });
      }).catch(function () {});
      armMic();
    } else if (d.t === 'answer') {
      var pc2 = peers[from];
      if (pc2) pc2.setRemoteDescription(new RTCSessionDescription(d.sdp)).catch(function () {});
    } else if (d.t === 'ice') {
      var pc3 = peers[from];
      if (pc3 && pc3.remoteDescription) pc3.addIceCandidate(new RTCIceCandidate(d.c)).catch(function () {});
    }
  }

  // ---------- Canal Realtime + roster ----------
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
      var p = msg && msg.payload;
      if (!p || !p.from || p.from === ME) return;
      var now = Date.now();
      var first = !roster[p.from];
      var lastReply = rosterReplyAt[p.from] || 0;
      roster[p.from] = p.name || p.from;
      renderRoster();
      // Respondemos la primera vez y después con una pausa de 9 s:
      // si el primer mensaje se perdió, el siguiente lo recupera.
      if (first || (now - lastReply) > 9000) {
        rosterReplyAt[p.from] = now;
        send('hello', { from: ME, name: myName() });
      }
      if (ME < p.from) connectTo(p.from);
    });

    chan.on('broadcast', { event: 'bye' }, function (msg) {
      var from = msg && msg.payload && msg.payload.from;
      if (from) dropPeer(from);
    });

    chan.on('broadcast', { event: 'signal' }, function (msg) {
      handleSignal(msg && msg.payload);
    });

    // Click de PTT de OTROS: suena acá (como una radio de verdad) y se
    // marca quién está hablando en el sidebar.
    chan.on('broadcast', { event: 'ptt' }, function (msg) {
      var p = msg && msg.payload;
      if (!p || !p.from || p.from === ME) return;
      rosterTalking[p.from] = !!p.on;
      playSound(p.on ? 'radio-ptt-sound' : 'radio-ptt-off');
      renderRoster();
    });

    chan.subscribe(function (st) {
      if (st === 'SUBSCRIBED') {
        started = true;
        renderRoster();
        send('hello', { from: ME, name: myName() });
        armMic();
        status('Escuchando · CH ' + state.channel, '');
        // Anuncio periódico: si entraste tarde o se perdió un mensaje,
        // en menos de 8 s ves a todos los conectados.
        if (helloTimer) clearInterval(helloTimer);
        helloTimer = setInterval(function () {
          if (chan && started) send('hello', { from: ME, name: myName() });
        }, 8000);
      } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') {
        status('Reconectando…', 'err');
        setTimeout(function () { if (state.visible) connect(); }, 4000);
      }
    });
  }

  function teardown() {
    if (helloTimer) { clearInterval(helloTimer); helloTimer = null; }
    Object.keys(peers).forEach(dropPeer);
    roster = {};
    rosterTalking = {};
    rosterReplyAt = {};
    renderRoster();
    if (chan) { try { chan.unsubscribe(); } catch (_) {} chan = null; }
    started = false;
  }

  // ---------- API ----------
  window.HRPRadio = {
    toggle: toggleRadio,
    join: join,
    setChannel: setChannel,
    bindKey: bindKey,
    press: pressPTT,
    release: releasePTT,
    enableMic: armMic,
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
    renderRoster();
    applyVisibility();

    var vol = $('radio-volume');
    if (vol) {
      vol.value = String(Math.round(state.volume * 100));
      vol.addEventListener('input', function () { window.HRPRadio.setVolume(Number(vol.value) / 100); });
    }
    var lbl = $('radio-channel-label');
    if (lbl) lbl.textContent = 'CH ' + state.channel;
    status(state.visible ? 'Escuchando · CH ' + state.channel : 'CH ' + state.channel + ' · oculta', '');

    // Red de seguridad: cada 5 s comprobamos que NUESTRA pista esté en todas
    // las conexiones. Si el micrófono llegó tarde o una renegociación falló,
    // la volvemos a enganchar — era el caso de "no me dejan hablar".
    setInterval(function () {
      if (!state.visible) return;
      var list = Object.keys(peers);
      if (!list.length) return;
      if (!localStream) { armMic(); return; }
      list.forEach(function (p) { attachLocal(peers[p], p); });
    }, 5000);
  });
  // ═══════════ CONSOLA TÁCTICA (LCD + log) ═══════════
  // Se sincroniza LEYENDO el estado cada 400 ms: no toca la lógica de
  // la radio, así que si algo falla acá, la radio sigue funcionando.
  var tacLog = [];
  var tacLast = { talking: false, channel: -1, peers: '' };
  // Canales con nombre real de operación (sin siglas TAC)
  var CHANNEL_NAMES = {
    1: 'PATRULLA', 2: 'DESPACHO', 3: 'TRÁFICO', 4: 'INVESTIGACIONES', 5: 'EMERGENCIAS'
  };
  function channelLabel(n) { return 'CANAL ' + n + ' · ' + (CHANNEL_NAMES[n] || 'RADIO'); }

  // Medidor de nivel REAL: mide el volumen del micrófono del usuario.
  var vuAnalyser = null, vuData = null, vuTimer = null;
  function ensureVU() {
    if (vuAnalyser || !localStream) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = new AC();
      var src = ctx.createMediaStreamSource(localStream);
      var an = ctx.createAnalyser();
      an.fftSize = 256;
      an.smoothingTimeConstant = 0.55;
      src.connect(an);
      vuAnalyser = an;
      vuData = new Uint8Array(an.frequencyBinCount);
      if (vuTimer) clearInterval(vuTimer);
      vuTimer = setInterval(vuTick, 60);
    } catch (_) {}
  }
  function vuTick() {
    if (!vuAnalyser || !vuData) return;
    var bars = document.querySelectorAll('.tac-wave i');
    if (!bars.length) return;
    vuAnalyser.getByteTimeDomainData(vuData);
    var sum = 0;
    for (var i = 0; i < vuData.length; i++) { var v = (vuData[i] - 128) / 128; sum += v * v; }
    var level = Math.min(1, Math.sqrt(sum / vuData.length) * 5);
    for (var b = 0; b < bars.length; b++) {
      var h = state.talking ? Math.max(3, Math.round(level * 17 * (0.5 + Math.random() * 0.8))) : 3;
      bars[b].style.height = h + 'px';
    }
  }

  function tacNow() {
    return new Date().toLocaleTimeString('es-ES', { hour12: false });
  }

  function logEvent(who, msg, cls) {
    tacLog.push({ t: tacNow(), who: who, msg: msg, cls: cls || 'sys' });
    if (tacLog.length > 60) tacLog.shift();
    var box = document.getElementById('radio-log');
    if (!box) return;
    if (!tacLog.length) { box.innerHTML = '<div class="empty">Sin comunicaciones</div>'; return; }
    box.innerHTML = tacLog.map(function (e) {
      return '<div><span class="t">[' + e.t + ']</span> <span class="' + e.cls + '">' +
        escTxt(e.who) + ':</span> ' + escTxt(e.msg) + '</div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function tacTick() {
    // Reloj real del LCD
    var clock = document.getElementById('screen-clock');
    if (clock) clock.textContent = tacNow();

    // Canal (estado real)
    var title = document.getElementById('screen-channel-title');
    if (title) title.textContent = channelLabel(state.channel);
    if (localStream) ensureVU();

    // Unidades en frecuencia (roster real)
    var online = document.getElementById('tac-online');
    var total = Object.keys(roster).length + 1;
    if (online) online.textContent = String(total);

    // Estado del PTT
    var box = document.getElementById('screen-status-box');
    var main = document.getElementById('status-text-main');
    var sub = document.getElementById('status-text-sub');
    if (box && main && sub) {
      if (state.talking) {
        box.classList.add('tx');
        main.textContent = 'TRANSMITIENDO EN VIVO';
        sub.textContent = 'CANAL ' + state.channel + ' · ' + myName();
      } else {
        box.classList.remove('tx');
        main.textContent = chan ? 'CANAL A ESCUCHA' : 'SIN CONECTAR';
        sub.textContent = chan ? 'LISTO PARA TRANSMITIR' : 'ELEGÍ UN CANAL';
      }
    }

    // LED de encendido
    var led = document.getElementById('tac-led');
    if (led) {
      led.style.background = chan ? '#22c55e' : '#f59e0b';
      led.style.boxShadow = '0 0 8px ' + (chan ? '#22c55e' : '#f59e0b');
    }

    // Log por CAMBIOS de estado (no spamea)
    if (state.talking !== tacLast.talking) {
      logEvent(myName(), state.talking ? 'abrió el micro' : 'cerró el micro', state.talking ? 'tx' : 'sys');
      tacLast.talking = state.talking;
    }
    if (state.channel !== tacLast.channel) {
      if (tacLast.channel !== -1) logEvent('SISTEMA', 'Frecuencia cambiada a ' + channelLabel(state.channel), 'sys');
      tacLast.channel = state.channel;
    }
    var peersKey = Object.keys(roster).sort().join(',');
    if (peersKey !== tacLast.peers) {
      var prev = tacLast.peers === '' ? [] : tacLast.peers.split(',');
      var actual = peersKey === '' ? [] : peersKey.split(',');
      actual.forEach(function (p) { if (p && prev.indexOf(p) < 0) logEvent(roster[p] || p, 'entra a la frecuencia', 'sys'); });
      prev.forEach(function (p) { if (p && actual.indexOf(p) < 0) logEvent(p, 'sale de la frecuencia', 'sys'); });
      tacLast.peers = peersKey;
    }
  }

  function initTacticalDisplay() {
    logEvent('SISTEMA', 'Conectado a la red de radio HPD.', 'sys');
    logEvent('SISTEMA', channelLabel(n) + ' en escucha.', 'sys');
    setInterval(tacTick, 400);
    tacTick();
  }

  if (window.HRPRadio) {
    window.HRPRadio.clearLog = function () {
      tacLog = [];
      var box = document.getElementById('radio-log');
      if (box) box.innerHTML = '<div class="empty">Sin comunicaciones</div>';
      logEvent('SISTEMA', 'Historial reiniciado.', 'sys');
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTacticalDisplay);
  } else {
    initTacticalDisplay();
  }
})();