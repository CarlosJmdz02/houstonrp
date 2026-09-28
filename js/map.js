// ── Estabilidad visual de los marcadores ─────────────────────────────
// El marcador es SIEMPRE la última posición reportada por el API: queda fijo
// exactamente donde está el oficial y solo se mueve cuando él se mueve. No se
// conserva la muestra anterior (eso hacía que el punto se quedara atrás en una
// posición vieja y luego saltara al otro lado del mapa).
const MARKER_REST_EPS = 1.5;     // cerca del objetivo, el marcador se asienta y se fija
const MARKER_TELEPORT_DIST = 220; // saltos grandes (spawn/teleport): se coloca directo, sin animar por todo el mapa
const MARKER_GRACE_MS = 10000; // cuánto se conserva un marcador ausente para no parpadear
const CALL_GRACE_MS = 5000;    // mismo criterio pero más corto para llamadas 911
const MARKER_SMOOTH_TAU = 110; // constante de suavizado (ms): más bajo = el punto llega antes a la posición real

export class MapController {
  constructor(canvasId, containerId, tooltipId) {
    this.canvas = document.getElementById(canvasId);
    this.container = document.getElementById(containerId);
    this.tooltipEl = document.getElementById(tooltipId);

    if (!this.canvas || !this.container) return;

    this.ctx = this.canvas.getContext('2d');

    // Límites del mundo (calibrables). Se pueden preconfigurar vía window.HRP_MAP_CONFIG
    // o ajustarse en vivo desde el panel de calibración.
    // Derivados empíricamente (v2): posición de los oficiales en vivo (1754 muestras,
    // 68 códigos postales) contrastadas con las etiquetas postales del mapa
    // (erlc.one) y con la calibración lat/lng → píxel (residuo < 1 px en 26 etiquetas).
    //   px_img(1024) = 0.20675*X - 28.58 ; py_img = 0.20138*Z + 30.35
    //   → bounds = [138..5091] x [-151..4934]  (Z positivo hacia abajo, sin flip)
    const cfg = (typeof window !== 'undefined' && window.HRP_MAP_CONFIG) || {};
    this.worldMinX = cfg.minX ?? 138.2;
    this.worldMaxX = cfg.maxX ?? 5091.0;
    this.worldMinZ = cfg.minZ ?? -150.7;
    this.worldMaxZ = cfg.maxZ ?? 4934.2;
    this.worldFlipZ = cfg.flipZ !== undefined ? !!cfg.flipZ : false;

    this.offsetX = 0;
    this.offsetY = 0;
    this.zoom = 1;
    this.minZoom = 0.3;
    this.maxZoom = 5;

    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;

    this.markers = [];
    this.calls = [];
    this.hoveredMarker = null;

    this.mapImage = new Image();
    this.imageLoaded = false;
    this.imageLoadAttempted = false;
    this.mapImageWidth = 0;
    this.mapImageHeight = 0;
    this.contentRect = null;    // recuadro real del mapa dentro de la imagen (sin bordes transparentes)
    this.useContentRect = false; // mapear las coordenadas al recuadro real, no a los bordes vacíos

    this.onMarkerClick = null;
    this.onCallClick = null;
    this.onCoordsUpdate = null;
    this.onCenterRequest = null;
    this.onCalibrationUpdate = null;
    this.onCalibrationPickPixel = null;

    // Estado de calibración / mejoras
    this.calibrationMode = false;
    this.calibrationAnchors = [];
    this.pendingAnchor = null;   // { wx, wz, label } oficial a fijar
    this.lastCalibrationRms = null;
    this.gridOverlay = false;
    this.selectedMarker = null;
    this.focusTime = 0;
    this.followName = null;

    this.animFrameId = null;
    this.lastTime = 0;

    this.loadCalibration();
    this.setupCanvas();
    this.loadMapImage();
    this.setupEvents();
    this.startLoop();
  }

  setupCanvas() {
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.width = rect.width;
    this.height = rect.height;
  }

  loadMapImage() {
    if (this.imageLoadAttempted) return;
    this.imageLoadAttempted = true;

    this.mapImage.onload = () => {
      this.imageLoaded = true;
      this.mapImageWidth = this.mapImage.naturalWidth || this.mapImage.width;
      this.mapImageHeight = this.mapImage.naturalHeight || this.mapImage.height;
      this.draw();
    };
    this.mapImage.onerror = () => {
      this.imageLoaded = false;
      this.draw();
      console.info('Mapa no encontrado. Usando cuadricula.');
    };
    this.mapImage.src = 'images/erlcmap2.webp?v=1';
  }

  // Detecta el recuadro real del mapa dentro de la imagen, ignorando los bordes transparentes.
  // Sin esto, las coordenadas se mapean a los márgenes vacíos y los puntos salen fuera de las calles.
  detectContentRect() {
    const w = this.mapImageWidth;
    const h = this.mapImageHeight;
    const full = { x: 0, y: 0, w: w || 1, h: h || 1 };
    if (!w || !h || !this.mapImage) { this.contentRect = full; return; }
    try {
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const octx = off.getContext('2d');
      octx.drawImage(this.mapImage, 0, 0, w, h);
      const data = octx.getImageData(0, 0, w, h).data;
      const step = Math.max(1, Math.floor(w / 800));
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y += step) {
        const rowBase = y * w * 4;
        for (let x = 0; x < w; x += step) {
          if (data[rowBase + x * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) { this.contentRect = full; return; }
      minX = Math.max(0, minX - step);
      minY = Math.max(0, minY - step);
      maxX = Math.min(w - 1, maxX + step);
      maxY = Math.min(h - 1, maxY + step);
      this.contentRect = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    } catch (e) {
      console.info('No se pudo detectar el recuadro del mapa:', e && e.message);
      this.contentRect = full;
    }
  }

  setUseContentRect(on) {
    this.useContentRect = !!on;
    this.draw();
  }

  getContentRect() {
    if (this.useContentRect && this.contentRect) return this.contentRect;
    return { x: 0, y: 0, w: this.mapImageWidth || 1, h: this.mapImageHeight || 1 };
  }

  resize() {
    this.setupCanvas();
    this.draw();
  }

  startLoop() {
    const loop = (time) => {
      const dt = this.lastTime ? (time - this.lastTime) : 16.7;
      this.lastTime = time;
      this.updateSmoothed(dt);
      this.followPan();
      this.draw();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  // Suavizado continuo por frame: el marcador sigue la ÚLTIMA posición conocida del
  // oficial con un blend exponencial estable (independiente del framerate).
  // No se interpola hacia tramos viejos: el objetivo es siempre la muestra más
  // reciente, de modo que el punto nunca "vuelve" a una posición anterior antes de
  // corregirse. Si la muestra no cambió, el punto queda fijo; y al quedar dentro de
  // MARKER_REST_EPS del objetivo se asienta exactamente (sin vibración residual).
  updateSmoothed(dt) {
    for (const m of this.markers) {
      if (m.worldX === undefined || m.worldZ === undefined) continue;

      if (m.cx === undefined) {
        m.cx = m.worldX;
        m.cz = m.worldZ;
        continue;
      }

      const dx = m.worldX - m.cx;
      const dz = m.worldZ - m.cz;
      const distSq = dx * dx + dz * dz;

      // Sin desplazamiento real → el marcador queda fijo en su posición.
      if (distSq <= MARKER_REST_EPS * MARKER_REST_EPS) {
        if (distSq > 0) { m.cx = m.worldX; m.cz = m.worldZ; }
        continue;
      }

      const k = 1 - Math.exp(-dt / MARKER_SMOOTH_TAU);
      m.cx += dx * k;
      m.cz += dz * k;
    }
  }

  // Cámara que sigue al oficial marcado en cada frame (pan suave, sin saltos).
  followPan() {
    if (!this.followName) return;
    const m = this.markers.find(mk => mk.playerName === this.followName);
    if (!m) return;
    const mapPos = this.worldToMap(m.cx ?? m.worldX, m.cz ?? m.worldZ);
    const mr = this.getMapRect();
    this.offsetX = mr.x !== undefined ? (mr.x + this.width / 2 - mapPos.x * this.zoom) : (this.width / 2 - mapPos.x * this.zoom);
    this.offsetY = mr.y !== undefined ? (mr.y + this.height / 2 - mapPos.y * this.zoom) : (this.height / 2 - mapPos.y * this.zoom);
  }

  stopLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  worldToMap(worldX, worldZ) {
    const mr = this.getMapRect();
    let px = ((worldX - this.worldMinX) / (this.worldMaxX - this.worldMinX)) * mr.w + mr.x;
    let tz = (worldZ - this.worldMinZ) / (this.worldMaxZ - this.worldMinZ);
    if (this.worldFlipZ) tz = 1 - tz;
    let py = tz * mr.h + mr.y;
    // Seguridad: el punto nunca se dibuja fuera de la imagen del mapa
    // (posiciones fuera de los límites calibrados quedan pegadas al borde).
    px = Math.min(mr.x + mr.w, Math.max(mr.x, px));
    py = Math.min(mr.y + mr.h, Math.max(mr.y, py));
    return { x: px, y: py };
  }

  worldToScreen(worldX, worldZ) {
    const map = this.worldToMap(worldX, worldZ);
    return {
      x: map.x * this.zoom + this.offsetX,
      y: map.y * this.zoom + this.offsetY
    };
  }

  screenToWorld(screenX, screenY) {
    const mr = this.getMapRect();
    const mapX = (screenX - this.offsetX) / this.zoom;
    const mapY = (screenY - this.offsetY) / this.zoom;
    const worldX = ((mapX - mr.x) / mr.w) * (this.worldMaxX - this.worldMinX) + this.worldMinX;
    let tz = (mapY - mr.y) / mr.h;
    if (this.worldFlipZ) tz = 1 - tz;
    const worldZ = this.worldMinZ + tz * (this.worldMaxZ - this.worldMinZ);
    return { x: worldX, z: worldZ };
  }

  getStatusColor(statusCode) {
    const colors = {
      '10-8': '#4acf8f',
      '10-7': '#e54850',
      '10-6': '#e6a868',
      '10-100': '#e54850',
      '10-97': '#e6a868',
      '10-98': '#3b6fb6',
      '10-23': '#3b6fb6',
      '10-5': '#4acf8f',
      '10-11': '#4acf8f',
      '10-15': '#e6a868',
      '10-50': '#ff8c42',
      '10-99': '#ff8c42',
    };
    return colors[statusCode] || '#3b6fb6';
  }

  // --- Ubicación robusta (v2: Location object / v1: Position array / descriptor) ---
  getPlayerLocation(p) {
    if (!p) return null;
    if (p.Location && (p.Location.LocationX !== undefined || p.Location.LocationZ !== undefined)) {
      const lx = Number(p.Location.LocationX);
      const lz = Number(p.Location.LocationZ);
      if (isFinite(lx) && isFinite(lz)) {
        return {
          x: lx,
          z: lz,
          postal: p.Location.PostalCode,
          street: p.Location.StreetName,
          building: p.Location.BuildingNumber,
        };
      }
    }
    if (Array.isArray(p.Position) && p.Position.length >= 2 && typeof p.Position[0] === 'number' && typeof p.Position[1] === 'number') {
      const px = Number(p.Position[0]);
      const pz = Number(p.Position[1]);
      if (isFinite(px) && isFinite(pz)) {
        return { x: px, z: pz, postal: null, street: null, building: null };
      }
    }
    if (typeof p.PositionDescriptor === 'string') {
      const parts = p.PositionDescriptor.split(',').map(s => parseFloat(String(s).trim()));
      if (parts.length >= 2 && isFinite(parts[0]) && isFinite(parts[1])) {
        return { x: parts[0], z: parts[1], postal: null, street: null, building: null };
      }
    }
    return null;
  }

  isLawEnforcementTeam(team) {
    return /poli|police|sheriff|patrol|highway|hcs|dps|state|lspd/i.test(team || '');
  }

  // Categorías de departamento para el mapa (todo menos civil).
  getTeamCategory(team) {
    const t = String(team || '').toLowerCase();
    if (/poli|lspd|state|hcs|patrol|police/i.test(t)) return 'police';
    if (/sheriff|hcso|dps/i.test(t)) return 'sheriff';
    if (/fire|bomber/i.test(t)) return 'fire';
    if (/ems|ambulance|ambulancia|paramedic|medic/i.test(t)) return 'ems';
    if (/tow|grua|auto/i.test(t)) return 'tow';
    return 'civil';
  }

  teamColor(cat) {
    const colors = {
      police: '#3b6fb6',
      sheriff: '#d4a017',
      fire: '#e54850',
      ems: '#9b72cf',
      tow: '#ffb020',
      civil: '#8a93a7',
    };
    return colors[cat] || '#8a93a7';
  }

  teamShort(cat) {
    const tags = { police: 'PD', sheriff: 'SO', fire: 'BF', ems: 'EMS', tow: 'GRÚA', civil: '' };
    return tags[cat] || '';
  }

  // Etiqueta corta del punto: SOLO el callsign. Si no hay callsign, usa un ID
  // corto (últimos dígitos del Roblox ID) o la primera palabra del nombre.
  markerShortLabel(marker) {
    if (marker.callsign && String(marker.callsign).trim()) return String(marker.callsign).trim();
    const name = String(marker.playerName || '');
    const i = name.lastIndexOf(':');
    const id = i >= 0 ? name.slice(i + 1) : '';
    if (/^\d{3,}$/.test(id)) return '#' + id.slice(-4);
    const plain = (i >= 0 ? name.slice(0, i) : name).trim();
    if (plain) return plain.split(/\s+/)[0];
    return '?';
  }

  setPlayers(players) {
    const now = performance.now();
    const newMarkers = [];
    const seen = new Set();

    // Marcadores vivos del frame anterior: de ahí se toma la posición suavizada
    // ACTUAL (ya avanzada por updateSmoothed) para que el punto no se reinicie a
    // una muestra vieja en cada poll.
    const prevByName = new Map();
    for (const m of this.markers) prevByName.set(m.playerName, m);

    for (const p of players) {
      const loc = this.getPlayerLocation(p);
      if (!loc) continue;
      const hasPlate = p._plate && typeof p._plate === 'object';
      const cat = this.getTeamCategory(p.Team);
      const isOfficer = hasPlate || cat !== 'civil';
      if (!isOfficer) continue;
      const statusCode = (p._plate && p._plate.status_code) || null;
      const key = p.Player || 'Desconocido';
      seen.add(key);
      const prev = prevByName.get(key);

      // La posición objetivo es SIEMPRE la última reportada por el API. El punto
      // queda fijo exactamente donde está el oficial y solo se mueve cuando él se
      // mueve; nunca se conserva la posición anterior.
      const worldX = loc.x;
      const worldZ = loc.z;

      const m = {
        playerName: key,
        callsign: p.Callsign || null,
        wanted: Number(p.WantedStars) || 0,
        alive: p.Alive !== false,
        team: p.Team || 'Civil',
        cat: cat,
        worldX: worldX,
        worldZ: worldZ,
        street: loc.street,
        postal: loc.postal,
        building: loc.building,
        isPolice: this.isLawEnforcementTeam(p.Team),
        hasPlate: hasPlate,
        statusCode: statusCode,
        bodycamActive: !!(p._plate && p._plate.bodycam_active),
        rankLabel: (p._plate && p._plate.rank_label) || null,
        discordUser: (p._plate && p._plate.username) || null,
        rawPlayer: p,
      };

      if (prev && prev.cx !== undefined && prev.cz !== undefined) {
        const jumpDist = Math.hypot(worldX - prev.cx, worldZ - prev.cz);
        if (jumpDist >= MARKER_TELEPORT_DIST) {
          // Salto grande (spawn / teletransporte): se coloca directo en la nueva
          // posición para no "volar" por todo el mapa. El punto queda en donde está.
          m.cx = worldX;
          m.cz = worldZ;
        } else {
          // Movimiento normal: se conserva la posición suavizada actual y
          // updateSmoothed() la lleva hasta la nueva muestra (objetivo fijo).
          m.cx = prev.cx;
          m.cz = prev.cz;
        }
      } else {
        m.cx = worldX;
        m.cz = worldZ;
      }

      m._lastSeen = now;
      newMarkers.push(m);
    }

    // Estabilidad: si un oficial falta en una muestra puntual del API se conserva su
    // marcador unos segundos (en su última posición) en vez de parpadear y reaparecer.
    for (const m of this.markers) {
      if (seen.has(m.playerName)) continue;
      if ((now - (m._lastSeen || 0)) <= MARKER_GRACE_MS) {
        newMarkers.push(m);
      }
    }

    this.markers = newMarkers;
  }

  setCalls(calls) {
    const now = performance.now();
    const nextCalls = [];
    const seen = new Set();
    for (const c of (Array.isArray(calls) ? calls : [])) {
      const pos = this.getPlayerLocation(c);
      if (!pos) continue;
      const name = 'Llamada #' + (c.id || c.CallNumber || c.CallId || '');
      seen.add(name);
      nextCalls.push({
        playerName: name,
        team: c.Team || '911',
        caller: c.Caller || '',
        description: c.Description || c.Reason || '',
        street: pos.street,
        postal: pos.postal,
        building: pos.building,
        worldX: pos.x,
        worldZ: pos.z,
        isCall: true,
        rawCall: c,
        _lastSeen: now,
      });
    }
    // Las llamadas tampoco deben parpadear si faltan en una muestra puntual.
    for (const c of this.calls) {
      if (seen.has(c.playerName)) continue;
      if ((now - (c._lastSeen || 0)) <= CALL_GRACE_MS) {
        nextCalls.push(c);
      }
    }
    this.calls = nextCalls;
  }

  clearMarkers() {
    this.markers = [];
    this.calls = [];
  }

  // --- Calibración foto ↔ coordenadas reales ---
  getWorldBounds() {
    return { minX: this.worldMinX, maxX: this.worldMaxX, minZ: this.worldMinZ, maxZ: this.worldMaxZ };
  }

  loadCalibration() {
    try {
      const raw = (typeof localStorage !== 'undefined' && localStorage.getItem('hrp_map_calibration')) || null;
      if (!raw) return;
      const b = JSON.parse(raw);
      // Solo se acepta calibración de la versión vigente: las guardadas con los
      // límites antiguos (v1) dejaban los puntos fuera del mapa y se descartan.
      if (b.v !== 2) return;
      if (isFinite(b.minX) && isFinite(b.maxX) && isFinite(b.minZ) && isFinite(b.maxZ) && b.maxX > b.minX && b.maxZ > b.minZ) {
        this.worldMinX = b.minX;
        this.worldMaxX = b.maxX;
        this.worldMinZ = b.minZ;
        this.worldMaxZ = b.maxZ;
        this.worldFlipZ = b.flipZ !== undefined ? !!b.flipZ : this.worldFlipZ;
      }
    } catch (e) { /* ignora calibración corrupta */ }
  }

  saveCalibration() {
    if (typeof localStorage === 'undefined') return;
    try {
      const b = this.getWorldBounds();
      localStorage.setItem('hrp_map_calibration', JSON.stringify({ ...b, flipZ: this.worldFlipZ, v: 2 }));
    } catch (e) { /* quota */ }
  }

  clearCalibration() {
    this.calibrationAnchors = [];
    this.pendingAnchor = null;
    this.worldMinX = 138.2;
    this.worldMaxX = 5091.0;
    this.worldMinZ = -150.7;
    this.worldMaxZ = 4934.2;
    this.worldFlipZ = false;
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem('hrp_map_calibration'); } catch (e) {}
    this.saveCalibration();
    this.emitCalibration();
    this.draw();
  }

  emitCalibration() {
    if (this.onCalibrationUpdate) this.onCalibrationUpdate(this.getCalibrationState());
  }

  getCalibrationState() {
    const b = this.getWorldBounds();
    const flip = this.worldFlipZ;
    const config = `window.HRP_MAP_CONFIG = ${JSON.stringify({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, flipZ: flip })};`;
    return {
      minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, flipZ: flip,
      anchorCount: this.calibrationAnchors.length,
      rms: this.lastCalibrationRms,
      pending: !!this.pendingAnchor,
      pendingLabel: this.pendingAnchor ? this.pendingAnchor.label : null,
      configJS: config,
      json: JSON.stringify({ ...b, flipZ: flip }),
    };
  }

  toggleCalibration() {
    this.calibrationMode = !this.calibrationMode;
    if (!this.calibrationMode) this.pendingAnchor = null;
    this.draw();
    return this.calibrationMode;
  }

  // Ancla lista: usa las coordenadas ERLC conocidas de un oficial (o coords manuales).
  setPendingAnchor(wx, wz, label) {
    this.pendingAnchor = { wx: Number(wx), wz: Number(wz), label: label || ('X' + Number(wx) + ',Z' + Number(wz)) };
    this.emitCalibration();
    this.draw();
  }

  // Clic en la foto: si hay ancla pendiente se fija (su u,v), luego se reajusta el mundo.
  addAnchorFromClick(u, v) {
    if (u < 0 || u > 1 || v < 0 || v > 1) {
      if (this.onCalibrationUpdate) this.onCalibrationUpdate(this.getCalibrationState());
      return;
    }
    if (this.pendingAnchor) {
      this.calibrationAnchors.push({
        wx: this.pendingAnchor.wx,
        wz: this.pendingAnchor.wz,
        u: u,
        v: v,
        label: this.pendingAnchor.label,
      });
      this.pendingAnchor = null;
      this.fitCalibration();
    } else if (this.onCalibrationPickPixel) {
      this.onCalibrationPickPixel(u, v);
    }
  }

  fitCalibration() {
    const a = this.calibrationAnchors;
    if (!a.length) return;
    if (a.length === 1) {
      // Desplazamiento: mueve los bounds para que ese punto caiga donde el usuario dijo.
      const p = a[0];
      const spanX = this.worldMaxX - this.worldMinX;
      const spanZ = this.worldMaxZ - this.worldMinZ;
      this.worldMinX = p.wx - spanX * p.u;
      this.worldMaxX = this.worldMinX + spanX;
      if (this.worldFlipZ) {
        // worldZ = maxZ - v*span
        this.worldMaxZ = p.wz + spanZ * p.v;
        this.worldMinZ = this.worldMaxZ - spanZ;
      } else {
        this.worldMinZ = p.wz - spanZ * p.v;
        this.worldMaxZ = this.worldMinZ + spanZ;
      }
    } else if (a.length >= 2) {
      // Ajuste por MÍNIMOS CUADRADOS con TODAS las anclas (escala + desplazamiento
      // por eje). Se prueban ambas orientaciones del eje Z y se elige la de menor
      // error, de modo que el punto quede exactamente en la calle donde está.
      const fitU = this.linearFit(a.map(p => ({ w: p.wx, t: p.u })));
      const fitVNormal = this.linearFit(a.map(p => ({ w: p.wz, t: p.v })));
      const fitVFlip = this.linearFit(a.map(p => ({ w: p.wz, t: 1 - p.v })));

      if (fitU && fitU.m > 1e-9) {
        this.worldMinX = -fitU.b / fitU.m;
        this.worldMaxX = this.worldMinX + 1 / fitU.m;
      }

      const errNormal = fitVNormal ? this.calibrationError(a, fitU, fitVNormal, false) : Infinity;
      const errFlip = fitVFlip ? this.calibrationError(a, fitU, fitVFlip, true) : Infinity;
      const useFlip = errFlip < errNormal;
      const fitV = useFlip ? fitVFlip : fitVNormal;

      if (fitV && fitV.m > 1e-9) {
        this.worldFlipZ = useFlip;
        this.worldMinZ = -fitV.b / fitV.m;
        this.worldMaxZ = this.worldMinZ + 1 / fitV.m;
      } else {
        const p0 = a[0];
        const spanZ = this.worldMaxZ - this.worldMinZ;
        if (this.worldFlipZ) {
          this.worldMaxZ = p0.wz + spanZ * p0.v;
          this.worldMinZ = this.worldMaxZ - spanZ;
        } else {
          this.worldMinZ = p0.wz - spanZ * p0.v;
          this.worldMaxZ = this.worldMinZ + spanZ;
        }
      }

      this.lastCalibrationRms = this.calibrationRms(a, fitU, fitV, useFlip);
    }
    // Evita bounds absurdos / rotos.
    if (!(this.worldMaxX > this.worldMinX) || !(this.worldMaxZ > this.worldMinZ)) {
      this.worldMaxX = this.worldMinX + 8000;
      this.worldMaxZ = this.worldMinZ + 8000;
    }
    this.worldMinX = Math.max(-20000, Math.min(20000, this.worldMinX));
    this.worldMaxX = Math.max(-20000, Math.min(20000, this.worldMaxX));
    this.worldMinZ = Math.max(-20000, Math.min(20000, this.worldMinZ));
    this.worldMaxZ = Math.max(-20000, Math.min(20000, this.worldMaxZ));
    this.saveCalibration();
    this.emitCalibration();
    this.draw();
  }

  // Regresión lineal simple t = m*w + b (mínimos cuadrados). Devuelve null si es degenerada.
  linearFit(pts) {
    const n = pts.length;
    if (n < 2) return null;
    let sw = 0, st = 0, swt = 0, sww = 0;
    for (const p of pts) { sw += p.w; st += p.t; swt += p.w * p.t; sww += p.w * p.w; }
    const denom = n * sww - sw * sw;
    if (Math.abs(denom) < 1e-9) return null;
    const m = (n * swt - sw * st) / denom;
    const b = (st - m * sw) / n;
    return { m, b };
  }

  calibrationError(anchors, fitU, fitV, flip) {
    let sum = 0;
    for (const p of anchors) {
      const pu = fitU ? fitU.m * p.wx + fitU.b : p.u;
      let pv = fitV ? fitV.m * p.wz + fitV.b : p.v;
      if (flip) pv = 1 - pv;
      const du = pu - p.u;
      const dv = pv - p.v;
      sum += du * du + dv * dv;
    }
    return sum;
  }

  calibrationRms(anchors, fitU, fitV, flip) {
    const n = anchors.length || 1;
    return Math.sqrt(this.calibrationError(anchors, fitU, fitV, flip) / n);
  }

  // --- Follow mode / selección ---
  selectMarker(marker) {
    this.selectedMarker = marker || null;
    this.draw();
  }

  // Marca el oficial por nombre en el mapa y lo centra (usado al cliquear su tarjeta).
  focusMarker(playerName) {
    if (playerName === undefined || playerName === null) return false;
    const m = this.markers.find(mk => mk.playerName === String(playerName));
    if (!m) return false;
    this.selectedMarker = m;
    this.focusTime = Date.now();
    if (m.worldX !== undefined && m.worldZ !== undefined) {
      this.centerOn(m.worldX, m.worldZ);
    }
    this.draw();
    return true;
  }

  toggleFollow(playerName) {
    if (this.followName === playerName) {
      this.stopFollow();
    } else {
      this.followName = playerName;
      this.selectedMarker = null;
    }
    this.draw();
  }

  stopFollow() {
    this.followName = null;
    this.draw();
  }

  ensureFollowCentered() {
    if (!this.followName) return false;
    const m = this.markers.find(mk => mk.playerName === this.followName);
    if (!m) return false;
    const mapPos = this.worldToMap(m.cx ?? m.worldX, m.cz ?? m.worldZ);
    const sx = mapPos.x * this.zoom + this.offsetX;
    const sy = mapPos.y * this.zoom + this.offsetY;
    if (sx < -20 || sx > this.width + 20 || sy < -20 || sy > this.height + 20) {
      this.centerOn(m.cx ?? m.worldX, m.cz ?? m.worldZ);
    }
    return true;
  }

  centerOn(worldX, worldZ) {
    const screen = this.worldToScreen(worldX, worldZ);
    this.offsetX += (this.width / 2 - screen.x);
    this.offsetY += (this.height / 2 - screen.y);
    this.draw();
  }

  getMapRect() {
    const w = this.width;
    const h = this.height;
    const cr = this.getContentRect();
    const imgW = cr.w || (this.worldMaxX - this.worldMinX);
    const imgH = cr.h || (this.worldMaxZ - this.worldMinZ);
    const imgAspect = imgW / imgH;

    let mapW, mapH, ox, oy;

    if (w / h > imgAspect) {
      mapH = h;
      mapW = h * imgAspect;
      ox = (w - mapW) / 2;
      oy = 0;
    } else {
      mapW = w;
      mapH = w / imgAspect;
      ox = 0;
      oy = (h - mapH) / 2;
    }

    return { x: ox, y: oy, w: mapW, h: mapH };
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.zoom, this.zoom);

    if (this.imageLoaded) {
      const mr = this.getMapRect();
      const cr = this.getContentRect();
      const scaleX = mr.w / (cr.w || 1);
      const scaleY = mr.h / (cr.h || 1);
      // Dibuja la imagen completa desplazada para que el recuadro real coincida con mr.
      ctx.drawImage(
        this.mapImage,
        mr.x - cr.x * scaleX,
        mr.y - cr.y * scaleY,
        (this.mapImageWidth || cr.w) * scaleX,
        (this.mapImageHeight || cr.h) * scaleY
      );
    } else {
      this.drawGrid(ctx, w, h);
    }

    this.drawMarkers(ctx);
    this.drawCallMarkers(ctx);

    if (this.gridOverlay) this.drawWorldGrid(ctx);
    if (this.calibrationMode) this.drawCalibrationOverlay(ctx);

    ctx.restore();
  }

  drawWorldGrid(ctx) {
    if (!this.imageLoaded) return;
    const mr = this.getMapRect();
    const step = 500;
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.10)';
    ctx.lineWidth = 1;
    for (let wx = Math.ceil(this.worldMinX / step) * step; wx <= this.worldMaxX; wx += step) {
      const p = this.worldToMap(wx, this.worldMinZ);
      ctx.beginPath();
      ctx.moveTo(p.x, mr.y);
      ctx.lineTo(p.x, mr.y + mr.h);
      ctx.stroke();
    }
    for (let wz = Math.ceil(this.worldMinZ / step) * step; wz <= this.worldMaxZ; wz += step) {
      const p = this.worldToMap(this.worldMinX, wz);
      ctx.beginPath();
      ctx.moveTo(mr.x, p.y);
      ctx.lineTo(mr.x + mr.w, p.y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0, 212, 255, 0.4)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let wx = Math.ceil(this.worldMinX / 1000) * 1000; wx <= this.worldMaxX; wx += 1000) {
      const p = this.worldToMap(wx, this.worldMinZ);
      ctx.fillText('X' + Math.round(wx), p.x + 3, mr.y + 3);
    }
    for (let wz = Math.ceil(this.worldMinZ / 1000) * 1000; wz <= this.worldMaxZ; wz += 1000) {
      const p = this.worldToMap(this.worldMinX, wz);
      ctx.fillText('Z' + Math.round(wz), mr.x + 3, p.y + 3);
    }
    ctx.restore();
  }

  drawCalibrationOverlay(ctx) {
    for (const a of this.calibrationAnchors) {
      const sp = this.worldToMap(a.wx, a.wz);
      const mr = this.getMapRect();
      ctx.save();
      ctx.strokeStyle = '#e6a868';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(sp.x - 8, sp.y); ctx.lineTo(sp.x + 8, sp.y);
      ctx.moveTo(sp.x, sp.y - 8); ctx.lineTo(sp.x, sp.y + 8);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#4acf8f';
      ctx.strokeRect(mr.x + a.u * mr.w - 5, mr.y + a.v * mr.h - 5, 10, 10);
      ctx.fillStyle = '#4acf8f';
      ctx.fillRect(mr.x + a.u * mr.w - 2, mr.y + a.v * mr.h - 2, 4, 4);
      ctx.fillStyle = '#e6a868';
      ctx.font = '10px sans-serif';
      ctx.fillText(a.label || '', sp.x + 10, sp.y + 4);
      ctx.restore();
    }
    if (this.pendingAnchor) {
      const p = this.worldToMap(this.pendingAnchor.wx, this.pendingAnchor.wz);
      ctx.save();
      ctx.strokeStyle = '#4acf8f';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#4acf8f';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(this.pendingAnchor.label + ' → clickea su posición en la foto', p.x, p.y - 18);
      ctx.restore();
    }
  }

  drawGrid(ctx, w, h) {
    const mr = this.getMapRect();
    const gridSize = 50;
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.06)';
    ctx.lineWidth = 1;

    for (let x = mr.x; x <= mr.x + mr.w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, mr.y);
      ctx.lineTo(x, mr.y + mr.h);
      ctx.stroke();
    }
    for (let y = mr.y; y <= mr.y + mr.h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(mr.x, y);
      ctx.lineTo(mr.x + mr.w, y);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(0, 212, 255, 0.15)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Mapa no disponible - Coloca images/erlcmap2.webp', mr.x + mr.w / 2, mr.y + mr.h / 2);
  }

  drawMarkers(ctx) {
    const now = Date.now();
    const pulsePhase = Math.sin(now / 300) * 0.3 + 0.7;
    const rapidFlash = Math.sin(now / 150) > 0 ? 1 : 0.3;

    for (const marker of this.markers) {
      const mapPos = this.worldToMap(marker.cx ?? marker.worldX, marker.cz ?? marker.worldZ);
      const sx = mapPos.x * this.zoom + this.offsetX;
      const sy = mapPos.y * this.zoom + this.offsetY;
      if (sx < -50 || sx > this.width + 50 || sy < -50 || sy > this.height + 50) continue;

      const x = mapPos.x;
      const y = mapPos.y;
      const isHovered = this.hoveredMarker === marker;
      const radius = isHovered ? 12 : 9;
      const pulseRadius = radius * (1 + (1 - pulsePhase) * 0.4);
      const isPanic = marker.statusCode === '10-100';

      const color = isPanic ? '#e54850' : this.teamColor(marker.cat);
      const glow = isPanic ? 'rgba(255, 23, 68, 0.4)' : (marker.cat === 'police' ? 'rgba(59, 111, 182, 0.25)' : 'rgba(255, 180, 32, 0.2)');

      if (isPanic) {
        ctx.save();
        ctx.globalAlpha = rapidFlash;
      }

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, pulseRadius * 3);
      gradient.addColorStop(0, glow);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, pulseRadius * 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = (isPanic ? rapidFlash : 1) * pulsePhase * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, pulseRadius * 1.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = isHovered ? 20 : (isPanic ? 25 : 10);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Centro con color de estado (10-x) para oficiales con turno activo.
      if (marker.hasPlate && marker.statusCode && !isPanic) {
        ctx.fillStyle = this.getStatusColor(marker.statusCode);
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      const initial = (marker.playerName || '?')[0].toUpperCase();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(8, radius * 0.75)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initial, x, y + 1);

      if (isPanic) {
        ctx.restore();
      }

      if (marker.wanted > 0 || marker === this.selectedMarker) {
        ctx.save();
        if (marker.wanted > 0) {
          ctx.strokeStyle = 'rgba(255, 82, 82, 0.9)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#e54850';
          ctx.font = 'bold 8px sans-serif';
          ctx.textBaseline = 'top';
          ctx.fillText('★'.repeat(Math.min(marker.wanted, 5)), x, y + radius + 6);
        }
        if (marker === this.selectedMarker) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.arc(x, y, radius + 9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          const age = Date.now() - this.focusTime;
          if (age >= 0 && age < 1600) {
            const bounce = radius + 12 + (age / 1600) * 26;
            ctx.strokeStyle = `rgba(255,255,255,${(0.75 * (1 - age / 1600)).toFixed(3)})`;
            ctx.lineWidth = 2;
            ctx.arc(x, y, bounce, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      const showTag = marker.cat !== 'civil'
        ? (this.zoom > 0.35 || isHovered || marker === this.selectedMarker)
        : (this.zoom > 0.6 || isHovered);
      if (showTag) {
        const label = this.markerShortLabel(marker);
        ctx.font = `${isPanic ? 'bold 10px' : '9px'} sans-serif`;
        const tw = ctx.measureText(label).width;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#0b1220';
        ctx.fillRect(x - tw / 2 - 4, y + radius + 2, tw + 8, 14);
        ctx.restore();
        ctx.fillStyle = isPanic ? '#ff5c64' : (marker.cat === 'police' ? 'rgba(228, 231, 238, 0.95)' : this.teamColor(marker.cat));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(label, x, y + radius + 4);
      }

      // Indicador de bodycam EN VIVO (solo despacho lo va a abrir al clickear).
      if (marker.bodycamActive) {
        const bx = x + radius * 0.75;
        const by = y - radius * 0.75;
        ctx.save();
        ctx.fillStyle = rapidFlash ? '#e54850' : 'rgba(229,72,80,0.45)';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawCallMarkers(ctx) {
    if (!this.calls || this.calls.length === 0) return;
    const now = Date.now();
    const pulsePhase = Math.sin(now / 250) * 0.3 + 0.7;

    for (const c of this.calls) {
      const mapPos = this.worldToMap(c.worldX, c.worldZ);
      const sx = mapPos.x * this.zoom + this.offsetX;
      const sy = mapPos.y * this.zoom + this.offsetY;
      if (sx < -60 || sx > this.width + 60 || sy < -60 || sy > this.height + 60) continue;

      const x = mapPos.x;
      const y = mapPos.y;
      const isHovered = this.hoveredMarker === c;
      const radius = isHovered ? 14 : 11;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.2);
      gradient.addColorStop(0, 'rgba(229,72,80,0.35)');
      gradient.addColorStop(1, 'rgba(229,72,80,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius * 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(229,72,80,0.8)';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.4 * pulsePhase + 0.3;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#e54850';
      ctx.shadowColor = '#e54850';
      ctx.shadowBlur = isHovered ? 22 : 12;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(8, radius * 0.8)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', x, y + 1);

      if (isHovered) {
        ctx.fillStyle = '#e54850';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(c.playerName, x, y + radius + 4);
      }
    }
  }

  setupEvents() {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));

    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

    this.canvas.addEventListener('click', (e) => this.onClick(e));

    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredMarker = null;
      this.hideTooltip();
    });

    this.canvas.addEventListener('dblclick', (e) => this.onDblClick(e));
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.onContextMenu();
    });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));

    this.setupTouchEvents();

    window.addEventListener('resize', () => this.resize());
  }

  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.isDragging = false;
    this.dragStartX = e.clientX - rect.left;
    this.dragStartY = e.clientY - rect.top;
    this.dragOffsetX = this.offsetX;
    this.dragOffsetY = this.offsetY;
    this._dragMoved = false;
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (e.buttons === 1) {
      if (this.dragStartX !== undefined) {
        const dx = mouseX - this.dragStartX;
        const dy = mouseY - this.dragStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          this.isDragging = true;
          this._dragMoved = true;
          this.offsetX = this.dragOffsetX + dx;
          this.offsetY = this.dragOffsetY + dy;
          this.hideTooltip();
        }
      }
    }

    if (!this.isDragging) {
      this.checkMarkerHover(mouseX, mouseY);
    }

    const world = this.screenToWorld(mouseX, mouseY);
    if (this.onCoordsUpdate) {
      this.onCoordsUpdate(world);
    }
  }

  onMouseUp(e) {
    this.isDragging = false;
    this.dragStartX = undefined;
    this.dragStartY = undefined;
  }

  onWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom + delta * this.zoom));

    const mapX = (mouseX - this.offsetX) / this.zoom;
    const mapY = (mouseY - this.offsetY) / this.zoom;
    this.zoom = newZoom;
    this.offsetX = mouseX - mapX * this.zoom;
    this.offsetY = mouseY - mapY * this.zoom;
  }

  onClick(e) {
    if (this._dragMoved) {
      this._dragMoved = false;
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (this.calibrationMode) {
      this.handleCalibrationClick(mouseX, mouseY);
      return;
    }

    const marker = this.getMarkerAt(mouseX, mouseY);
    if (marker && marker.isCall) {
      if (this.onCallClick) this.onCallClick(marker);
    } else if (marker && this.onMarkerClick) {
      this.onMarkerClick(marker);
    }
  }

  handleCalibrationClick(mouseX, mouseY) {
    const mr = this.getMapRect();
    const mapX = (mouseX - this.offsetX) / this.zoom;
    const mapY = (mouseY - this.offsetY) / this.zoom;
    const u = (mapX - mr.x) / mr.w;
    const v = (mapY - mr.y) / mr.h;

    const marker = this.getMarkerAt(mouseX, mouseY);
    if (marker && !marker.isCall) {
      // Armamos la ancla con las coords ERLC reales de ese oficial.
      this.setPendingAnchor(marker.worldX, marker.worldZ, marker.playerName);
      return;
    }
    this.addAnchorFromClick(u, v);
  }

  onDblClick(e) {
    if (this._dragMoved) {
      this._dragMoved = false;
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const marker = this.getMarkerAt(mx, my);
    if (marker && !marker.isCall) {
      this.selectMarker(marker);
      this.toggleFollow(marker.playerName);
      this.centerOn(marker.cx ?? marker.worldX, marker.cz ?? marker.worldZ);
    } else if (marker && marker.isCall) {
      this.stopFollow();
      this.centerOn(marker.worldX, marker.worldZ);
    }
  }

  onKeyDown(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const k = e.key;
    if (k === '+' || k === '=') {
      e.preventDefault();
      this.zoom = Math.min(this.maxZoom, this.zoom + 0.3);
    } else if (k === '-' || k === '_') {
      e.preventDefault();
      this.zoom = Math.max(this.minZoom, this.zoom - 0.3);
    } else if (k === '0') {
      e.preventDefault();
      this.zoom = 1;
    } else if (k === 'r' || k === 'R') {
      e.preventDefault();
      this.zoom = 1;
      this.offsetX = 0;
      this.offsetY = 0;
    } else if (k === 'f' || k === 'F') {
      e.preventDefault();
      this.stopFollow();
    } else if (k === 'Escape') {
      this.followName = null;
      this.selectedMarker = null;
      this.pendingAnchor = null;
      this.emitCalibration();
      this.draw();
    }
  }

  onContextMenu() {
    if (this.calibrationMode) {
      this.pendingAnchor = null;
      this.emitCalibration();
      this.draw();
    }
  }

  setupTouchEvents() {
    let lastTouchDist = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchOffsetX = 0;
    let touchOffsetY = 0;

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchOffsetX = this.offsetX;
        touchOffsetY = this.offsetY;
        this._dragMoved = false;
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          this._dragMoved = true;
          this.offsetX = touchOffsetX + dx;
          this.offsetY = touchOffsetY + dy;
          this.hideTooltip();
        }
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const scale = lastTouchDist / dist;
        const newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom / scale));
        this.zoom = newZoom;
        lastTouchDist = dist;
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      if (!this._dragMoved && e.changedTouches.length === 1) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.changedTouches[0].clientX - rect.left;
        const my = e.changedTouches[0].clientY - rect.top;
        const marker = this.getMarkerAt(mx, my);
        if (marker && marker.isCall) {
          if (this.onCallClick) this.onCallClick(marker);
        } else if (marker && this.onMarkerClick) {
          this.onMarkerClick(marker);
        }
      }
    });
  }

  checkMarkerHover(mouseX, mouseY) {
    const hit = this.getMarkerAt(mouseX, mouseY);
    if (hit !== this.hoveredMarker) {
      this.hoveredMarker = hit;
      if (hit) {
        this.showTooltip(hit, mouseX, mouseY);
      } else {
        this.hideTooltip();
      }
    } else if (hit) {
      this.moveTooltip(mouseX, mouseY);
    }
  }

  getMarkerAt(mouseX, mouseY) {
    const hitRadius = 20;
    const candidates = this.markers.concat(this.calls || []);
    for (const marker of candidates) {
      const screenPos = this.worldToScreen(marker.cx ?? marker.worldX, marker.cz ?? marker.worldZ);
      const dx = mouseX - screenPos.x;
      const dy = mouseY - screenPos.y;
      if (dx * dx + dy * dy < hitRadius * hitRadius) {
        return marker;
      }
    }
    return null;
  }

  escapeTag(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(/[&<>"']/g, (ch) => {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return map[ch];
    });
  }

  showTooltip(marker, x, y) {
    if (!this.tooltipEl) return;
    if (marker.isCall) {
      const desc = marker.description || '—';
      const locParts = [marker.street, marker.postal, marker.building].filter(Boolean);
      const loc = locParts.length > 0 ? locParts.join(', ') : 'Ubicación desconocida';
      this.tooltipEl.innerHTML = `
        <div class="tt-call" style="color:#e54850;">${this.escapeTag(marker.playerName)}</div>
        <div class="tt-type">${this.escapeTag(marker.caller || marker.team || '')}</div>
        <div class="tt-desc">${this.escapeTag(desc)}</div>
        <div class="tt-desc" style="color:#e6a868;">📍 ${this.escapeTag(loc)}</div>
      `;
    } else {
      const team = marker.team || 'Civil';
      const sc = marker.statusCode ? ' · ' + marker.statusCode : '';
      const cs = marker.callsign ? ' · ' + marker.callsign : '';
      const rank = marker.rankLabel ? ' · ' + marker.rankLabel : '';
      const extra = [];
      if (marker.wanted > 0) extra.push('<span style="color:#e54850;">★ × ' + marker.wanted + '</span>');
      if (marker.alive === false) extra.push('<span style="color:#e54850;">DECEASED</span>');
      const extraHtml = extra.length ? ' · ' + extra.join(' · ') : '';
      let html = `
        <div class="tt-call">${this.escapeTag(marker.playerName)}${this.escapeTag(cs)}</div>
        <div class="tt-type">${this.escapeTag(team)}${this.escapeTag(sc)}${this.escapeTag(rank)}${extraHtml}</div>
      `;
      if (marker.discordUser) {
        html += `<div class="tt-desc" style="color:#8a93a7;">@${this.escapeTag(marker.discordUser)}</div>`;
      }
      if (marker.bodycamActive) {
        html += `<div class="tt-desc" style="color:#e54850;font-weight:600;">📹 Bodycam EN VIVO — click para ver</div>`;
      }
      const locParts = [marker.street, marker.postal, marker.building].filter(Boolean);
      if (locParts.length > 0) {
        html += `<div class="tt-desc" style="color:#e6a868;">📍 ${this.escapeTag(locParts.join(', '))}</div>`;
      }
      html += '<div class="tt-desc" style="color:#5a6a85;font-size:10px;">Click para ver detalle y cambiar estado</div>';
      this.tooltipEl.innerHTML = html;
    }
    this.tooltipEl.classList.remove('hidden');
    this.tooltipEl.style.left = (x + 14) + 'px';
    this.tooltipEl.style.top = (y - 10) + 'px';
  }

  moveTooltip(x, y) {
    if (!this.tooltipEl || this.tooltipEl.classList.contains('hidden')) return;
    this.tooltipEl.style.left = (x + 14) + 'px';
    this.tooltipEl.style.top = (y - 10) + 'px';
  }

  hideTooltip() {
    if (!this.tooltipEl) return;
    this.tooltipEl.classList.add('hidden');
    this.hoveredMarker = null;
  }

  bindControls() {
    const zoomIn = document.getElementById('btn-zoom-in');
    const zoomOut = document.getElementById('btn-zoom-out');
    const reset = document.getElementById('btn-reset');
    const gridBtn = document.getElementById('btn-grid-toggle');
    const calBtn = document.getElementById('btn-calibrate');
    const clearCal = document.getElementById('btn-clear-calibration');
    const cropBtn = document.getElementById('btn-crop-toggle');

    if (zoomIn) {
      zoomIn.addEventListener('click', () => {
        this.zoom = Math.min(this.maxZoom, this.zoom + 0.3);
      });
    }
    if (zoomOut) {
      zoomOut.addEventListener('click', () => {
        this.zoom = Math.max(this.minZoom, this.zoom - 0.3);
      });
    }
    if (reset) {
      reset.addEventListener('click', () => {
        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.followName = null;
        this.selectedMarker = null;
      });
    }
    if (gridBtn) {
      gridBtn.addEventListener('click', () => {
        this.gridOverlay = !this.gridOverlay;
        gridBtn.classList.toggle('active', this.gridOverlay);
        gridBtn.title = this.gridOverlay ? 'Ocultar rejilla' : 'Mostrar rejilla del mundo';
        this.draw();
      });
    }
    if (calBtn) {
      calBtn.addEventListener('click', () => {
        const on = this.toggleCalibration();
        calBtn.classList.toggle('active', on);
        calBtn.textContent = on ? 'Cancelar calibración' : 'Calibrar mapa';
        this.emitCalibration();
      });
    }
    if (clearCal) {
      clearCal.addEventListener('click', () => {
        this.clearCalibration();
      });
    }
    if (cropBtn) {
      cropBtn.classList.toggle('active', this.useContentRect);
      cropBtn.title = this.useContentRect ? 'Usando recuadro real del mapa (clic para usar imagen completa)' : 'Usando imagen completa (clic para recortar bordes vacíos)';
      cropBtn.addEventListener('click', () => {
        const next = !this.useContentRect;
        if (next && !this.contentRect) this.detectContentRect();
        this.setUseContentRect(next);
        cropBtn.classList.toggle('active', this.useContentRect);
        cropBtn.title = this.useContentRect ? 'Usando recuadro real del mapa (clic para usar imagen completa)' : 'Usando imagen completa (clic para recortar bordes vacíos)';
      });
    }
  }
}
