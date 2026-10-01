import { API_KEY } from './api.js';
import { MapController } from './map.js';
import { UI, TEN_CODE_OPTIONS } from './ui.js';

const state = {
  serverData: null,
  lastPlayers: [],
  lastQueue: [],
  fetchInterval: null,
  isFirstLoad: true,
  fetchCount: 0,
  // Scheduler de refresco: base rápida, backoff ante errores/límite de la API.
  baseDelay: 700,
  maxDelay: 12000,
  fetchDelay: 700,
  _fetching: false,
  _fetchTimer: null,
  nextFetchAt: 0
};

const loadingScreen = document.getElementById('loading-screen');
const mainContent = document.getElementById('main-content');

const ui = new UI();
let mapController = null;

function init() {
  if (!API_KEY || API_KEY.trim() === '') {
    showError('API Key no configurada. Abre js/api.js y coloca tu Server API Key.');
    return;
  }

  ui.initAudio();

  mapController = new MapController('map-canvas', 'map-canvas-container', 'map-tooltip');
  mapController.bindControls();

  mapController.onMarkerClick = (marker) => {
    if (marker.playerName) mapController.focusMarker(marker.playerName);
    if (marker.rawPlayer) {
      ui.showPlayerModal(marker.rawPlayer);
    }
  };

  mapController.onCallClick = (marker) => {
    if (mapController) mapController.centerOn(marker.worldX, marker.worldZ);
  };

  mapController.onCoordsUpdate = (world) => {
    const el = document.getElementById('map-coords');
    if (el) {
      el.textContent = 'X: ' + Math.round(world.x) + ' Z: ' + Math.round(world.z);
    }
  };

  mapController.onCalibrationUpdate = (state) => {
    const el = document.getElementById('map-cal-info');
    if (!el) return;
    if (!mapController.calibrationMode) {
      el.classList.add('hidden');
      return;
    }
    let html = '<b>● Modo calibración:</b>';
    if (state.pending) {
      html += ' <span>Ancla lista: <b>' + escapeHtml(state.pendingLabel) + '</b> — clickeá sobre la foto dónde está ese oficial.</span>';
    } else if (state.anchorCount === 0) {
      html += ' <span>Clic en un oficial del mapa y después en su posición real en la foto. Repetí con 3+ oficiales en zonas distintas para mayor precisión.</span>';
    } else {
      const rms = (state.rms !== null && state.rms !== undefined) ? ' · error ±' + (state.rms * 100).toFixed(1) + '% (más bajo = mejor)' : '';
      html += ' <span>' + state.anchorCount + ' ancla(s) aplicadas' + rms + '. Rejilla con clic derecho para salir.</span>';
    }
    html += '<br><code>' + escapeHtml(state.configJS) + '</code>';
    el.innerHTML = html;
    el.classList.remove('hidden');
  };

  mapController.onCalibrationPickPixel = (u, v) => {
    const input = window.prompt('Clic sin oficial: escribí las coordenadas ERLC de ese punto de la foto.\nFormato: X, Z (ej: 1977, 1159)', '');
    if (!input) {
      mapController.emitCalibration();
      return;
    }
    const parts = input.split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 2 && isFinite(parts[0]) && isFinite(parts[1])) {
      mapController.setPendingAnchor(parts[0], parts[1], 'X' + parts[0] + ',Z' + parts[1]);
    } else {
      window.alert('Coordenadas inválidas. Usá formato: X, Z');
    }
    mapController.emitCalibration();
  };

  const updateFollowUI = () => {
    const el = document.getElementById('map-follow');
    if (!el) return;
    if (mapController.followName) {
      document.getElementById('map-follow-name').textContent = mapController.followName;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  };
  const origEnsureFollow = mapController.ensureFollowCentered.bind(mapController);
  mapController.ensureFollowCentered = () => {
    const r = origEnsureFollow();
    updateFollowUI();
    return r;
  };
  updateFollowUI();

  ui._onCenterCallback = (x, z) => {
    if (mapController) mapController.centerOn(x, z);
  };

  ui._onSelectPlayer = (playerName) => {
    if (mapController) mapController.focusMarker(playerName);
  };

  // Todos los códigos del MDT pueden elegirse desde el Dispatch (panel y punto).
  const TEN_CODE_WHITELIST = TEN_CODE_OPTIONS.map(c => c.code);

  ui._onStatusUpdate = async (shiftId, code) => {
    if (!shiftId || TEN_CODE_WHITELIST.indexOf(code) === -1) {
      console.warn('Estado inválido:', shiftId, code);
      throw new Error('Código no válido');
    }
    try {
      await supaUpdate('police_shift_sessions', { status_code: code }, { id: `eq.${shiftId}` });
      if (code === '10-100') {
        ui.playPanicSound();
      }
      // El siguiente poll (1.2s) refresca el punto del oficial, la lista y el
      // registro del despacho automáticamente.
    } catch (err) {
      console.warn('Error updating status code:', err);
      throw err;
    }
  };

  ui.initHoverSound();

  hideLoading();

  requestAnimationFrame(() => {
    if (mapController) mapController.resize();
  });

  fetchData();
  scheduleFetch();
}

function getApiUrl() {
  const host = window.location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    return '/.netlify/functions/proxy?path=/v2/server&Players=true&EmergencyCalls=true&Queue=true';
  }
  return '/v2/server?Players=true&EmergencyCalls=true&Queue=true';
}

let processedPanics = new Set();

// ── Registro de despacho en vivo (CAD log) ──
const dispatchLog = {
  entries: [],
  add(type, text) {
    const t = new Date();
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    const ss = String(t.getSeconds()).padStart(2, '0');
    this.entries.push({ type, text, time: hh + ':' + mm + ':' + ss });
    if (this.entries.length > 80) this.entries = this.entries.slice(-80);
    ui.renderLog(this.entries);
  }
};

const prevLogState = { shifts: {}, callIds: new Set() };

function shiftsUnitTag(s) {
  if (!s) return 'Unidad';
  const name = s.username || 'Unidad';
  const dept = (s.department || 'hpd').toUpperCase();
  return `${name} [${dept}]`;
}

function computeLogDiff(shifts, calls) {
  if (!Array.isArray(shifts)) return;
  const nowShifts = {};
  for (const s of shifts) nowShifts[s.id] = s;

  for (const id of Object.keys(nowShifts)) {
    const s = nowShifts[id];
    const p = prevLogState.shifts[id];
    if (!p) {
      dispatchLog.add('start', `${shiftsUnitTag(s)} → 10-8 EN SERVICIO`);
    } else if (p.status_code !== s.status_code) {
      const code = s.status_code;
      if (code === '10-100') {
        dispatchLog.add('panic', `${shiftsUnitTag(s)} → ¡10-100 ALERTA DE PÁNICO!`);
      } else {
        dispatchLog.add('status', `${shiftsUnitTag(s)} → estado ${code || '10-x'}`);
      }
    }
  }
  for (const id of Object.keys(prevLogState.shifts)) {
    if (!nowShifts[id]) {
      dispatchLog.add('off', `${prevLogState.shifts[id].username || 'Unidad'} → 10-7 FUERA DE SERVICIO`);
    }
  }
  prevLogState.shifts = nowShifts;

  const callList = Array.isArray(calls) ? calls : [];
  const nowCallIds = new Set(callList.map(c => c.id || c.CallId || c.CallNumber));
  for (const c of callList) {
    const cid = c.id || c.CallId || c.CallNumber;
    if (!prevLogState.callIds.has(cid)) {
      dispatchLog.add('call', `911 #${cid} recibida${c.Street || c.StreetName ? ' · ' + (c.Street || c.StreetName) : ''}`);
    }
  }
  prevLogState.callIds = nowCallIds;
}

async function fetchActiveShifts() {
  try {
    const data = await supaSelect('police_shift_sessions', 'id, discord_id, username, department, status, status_code, start_time, break_duration, bodycam_active, bodycam_peer_id', { status: 'in.(active,break)' });
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('Error fetching active shifts:', err);
    return [];
  }
}

async function fetchCallAssignments() {
  try {
    const data = await supaSelect('call_assignments', 'call_id, unit_name, shift_id', null);
    if (!Array.isArray(data)) return {};
    const map = {};
    for (const row of data) {
      if (row.call_id) map[row.call_id] = row;
    }
    return map;
  } catch (err) {
    console.warn('Error fetching call assignments:', err);
    return {};
  }
}

function extractRobloxId(player) {
  if (!player) return null;
  const playerStr = player.Player || '';
  const parts = String(playerStr).split(':');
  const id = parts[parts.length - 1];
  if (/^\d+$/.test(id)) return id;
  if (player.UserId) return String(player.UserId);
  return null;
}

// ── Rangos (para mostrar rango + sueldo en el Dispatch) ──
let _ranksCache = null;
let _ranksCacheAt = 0;
const RANKS_CACHE_MS = 30000;

async function loadRanksCache(force) {
  const fresh = _ranksCache && (Date.now() - _ranksCacheAt) < RANKS_CACHE_MS;
  if (fresh && !force) return _ranksCache;
  try {
    const ranks = (typeof hrpGetRanks === 'function') ? await hrpGetRanks() : [];
    const members = (typeof hrpGetRankMembers === 'function') ? await hrpGetRankMembers() : [];
    const byDept = {};
    (Array.isArray(ranks) ? ranks : []).forEach(r => {
      (byDept[r.department] = byDept[r.department] || []).push(r);
    });
    const membersMap = {};
    (Array.isArray(members) ? members : []).forEach(m => { membersMap[String(m.discord_id)] = m; });
    _ranksCache = { byDept, members: membersMap };
    _ranksCacheAt = Date.now();
  } catch (err) {
    if (!_ranksCache) _ranksCache = { byDept: {}, members: {} };
  }
  return _ranksCache;
}

// Ubicación de un jugador (v2: Location / v1: Position / descriptor).
function playerLocation(p) {
  if (!p) return null;
  if (p.Location && (p.Location.LocationX !== undefined || p.Location.LocationZ !== undefined)) {
    const lx = Number(p.Location.LocationX);
    const lz = Number(p.Location.LocationZ);
    if (isFinite(lx) && isFinite(lz)) {
      return { x: lx, z: lz, street: p.Location.StreetName || null, postal: p.Location.PostalCode || null, building: p.Location.BuildingNumber || null };
    }
  }
  if (Array.isArray(p.Position) && p.Position.length >= 2 && typeof p.Position[0] === 'number' && typeof p.Position[1] === 'number') {
    const px = Number(p.Position[0]);
    const pz = Number(p.Position[1]);
    if (isFinite(px) && isFinite(pz)) return { x: px, z: pz, street: null, postal: null, building: null };
  }
  if (typeof p.PositionDescriptor === 'string') {
    const parts = p.PositionDescriptor.split(',').map(s => parseFloat(String(s).trim()));
    if (parts.length >= 2 && isFinite(parts[0]) && isFinite(parts[1])) {
      return { x: parts[0], z: parts[1], street: null, postal: null, building: null };
    }
  }
  return null;
}

function isLawEnforcementTeam(team) {
  return /poli|police|sheriff|patrol|highway|hcs|dps|state|lspd/i.test(team || '');
}

function isNonCivilTeam(team) {
  return !/civil/i.test(team || '');
}

const _autoEndedShifts = new Set();

async function checkAndAutoEndShifts(players, shifts) {
  if (!Array.isArray(shifts) || shifts.length === 0) return;
  if (!Array.isArray(players)) return;
  if (typeof hrpEndShift !== 'function') return;

  const currentIds = new Set(shifts.map(s => String(s.id)));
  for (const id of _autoEndedShifts) {
    if (!currentIds.has(id)) _autoEndedShifts.delete(id);
  }

  const serverIds = new Set();
  for (const p of players) {
    const rid = extractRobloxId(p);
    if (rid) serverIds.add(rid);
  }
  if (serverIds.size === 0) return;

  const discordIds = [...new Set(shifts.map(s => s.discord_id).filter(Boolean))];
  if (discordIds.length === 0) return;

  let characters = [];
  try {
    characters = await supaSelect('characters', 'user_discord, roblox_id', {
      user_discord: `in.(${discordIds.join(',')})`
    });
    if (!Array.isArray(characters)) characters = [];
  } catch (err) {
    return;
  }

  const discordToRobloxId = {};
  for (const c of characters) {
    if (c.user_discord && c.roblox_id) {
      discordToRobloxId[c.user_discord] = String(c.roblox_id);
    }
  }

  for (const shift of shifts) {
    const sid = String(shift.id);
    if (_autoEndedShifts.has(sid)) continue;

    const robloxId = discordToRobloxId[shift.discord_id];
    if (!robloxId) continue;

if (!serverIds.has(robloxId)) {
        try {
          const ok = await hrpEndShift(shift.id, shift.start_time, shift.break_duration || 0);
          if (ok) {
            _autoEndedShifts.add(sid);
            console.info(`Auto-ended shift #${shift.id} for ${shift.username} (left ER:LC)`);
            // Detener también la acumulación de pago por rol del turno.
            if (typeof hrpPayEnd === 'function' && shift.discord_id) {
              hrpPayEnd(shift.discord_id).catch(() => {});
            }
          }
        } catch (err) {
          console.warn(`checkAndAutoEndShifts: failed to end shift #${shift.id}:`, err.message);
        }
      }
  }
}

async function buildPlayerPlateMap(shifts) {
  if (shifts.length === 0) return {};

  const discordIds = [...new Set(shifts.map(s => s.discord_id).filter(Boolean))];
  if (discordIds.length === 0) return {};

  try {
    const characters = await supaSelect('characters', 'user_discord, roblox, roblox_id', { user_discord: `in.(${discordIds.join(',')})` });
    if (!Array.isArray(characters)) return {};

    const discordToShift = {};
    for (const shift of shifts) {
      if (shift.discord_id) discordToShift[shift.discord_id] = shift;
    }

    const rc = await loadRanksCache(false);

    const plateMap = {}; // por roblox_id numérico y por nombre (con o sin :id)
    for (const c of characters) {
      const shift = discordToShift[c.user_discord];
      if (!shift) continue;
      const mem = rc.members[String(shift.discord_id)] || null;
      const def = mem ? (rc.byDept[mem.department] || []).find(r => r.rank_key === mem.rank_key) : null;
      const entry = {
        shiftId: shift.id,
        department: shift.department,
        username: shift.username,
        discord_id: shift.discord_id || null,
        status_code: shift.status_code || null,
        rank_key: mem ? mem.rank_key : null,
        rank_label: def ? def.rank_label : (mem ? mem.rank_key : null),
        hourly: def ? (Number(def.hourly) || 0) : (mem && mem.hourly ? Number(mem.hourly) || 0 : 0),
        bodycam_active: !!shift.bodycam_active,
        bodycam_peer_id: shift.bodycam_peer_id || '',
      };
      if (c.roblox_id) plateMap['id:' + String(c.roblox_id)] = entry;
      if (c.roblox) {
        const full = String(c.roblox).toLowerCase().trim();
        plateMap[full] = entry;
        const parts = String(c.roblox).split(':');
        if (parts.length > 1 && parts[0].trim()) {
          plateMap[parts[0].toLowerCase().trim()] = entry;
        }
      }
    }
    return plateMap;
  } catch (err) {
    console.warn('Error building plate map:', err);
    return {};
  }
}

async function buildEnrichedShifts(shifts) {
  if (shifts.length === 0) return [];

  const discordIds = [...new Set(shifts.map(s => s.discord_id).filter(Boolean))];
  if (discordIds.length === 0) {
    return shifts.map(s => ({ ...s, _displayName: s.username }));
  }

  try {
    const characters = await supaSelect('characters', 'user_discord, roblox', { user_discord: `in.(${discordIds.join(',')})` });
    const charByDiscord = {};
    if (Array.isArray(characters)) {
      for (const c of characters) {
        if (c.roblox) {
          charByDiscord[c.user_discord] = c.roblox;
        }
      }
    }

    return shifts.map(s => ({
      ...s,
      _displayName: (s.discord_id && charByDiscord[s.discord_id]) || s.username || 'Desconocido',
      status_code: s.status_code || null,
    }));
  } catch (err) {
    console.warn('Error enriching shifts:', err);
    return shifts.map(s => ({ ...s, _displayName: s.username }));
  }
}

async function fetchData() {
  if (state._fetching) return;
  state._fetching = true;
  try {
    const url = getApiUrl();

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'server-key': API_KEY }
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const code = errorBody?.code;
      const message = errorBody?.message || response.statusText;

      console.warn(`API Error [${response.status}]:`, message);

      if (code === 4001) {
        // Límite de peticiones: esperamos cada vez un poco más antes de reintentar.
        state.fetchDelay = Math.min(state.maxDelay, Math.max(state.fetchDelay * 2, 1500));
        console.warn('Rate limit alcanzado, reintentando en ' + state.fetchDelay + 'ms');
      } else if (code >= 2000 && code < 3000) {
        state.fetchDelay = Math.min(state.maxDelay, state.fetchDelay + 400);
        ui.updateDashboard(null);
      } else if (code === 3002) {
        state.fetchDelay = Math.min(state.maxDelay, state.fetchDelay + 400);
        ui.updateDashboard(null);
      } else {
        state.fetchDelay = Math.min(state.maxDelay, state.fetchDelay + 400);
        ui.updateDashboard(null);
      }

      updateTimestamp();
      return;
    }

    state.fetchDelay = state.baseDelay;
    const data = await response.json();

    state.serverData = data;
    state.fetchCount++;

    ui.updateDashboard(data);
    updateTimestamp();

    const players = data.Players || [];

    const shifts = await fetchActiveShifts();
    const plateMap = await buildPlayerPlateMap(shifts);

    const enrichedPlayers = players.map(p => {
      const rid = extractRobloxId(p);
      const nameLower = (p.Player || '').toLowerCase().trim();
      const teamIsLE = isLawEnforcementTeam(p.Team || '');
      let plate = null;
      if (rid && plateMap['id:' + rid]) plate = plateMap['id:' + rid];
      else if (plateMap[nameLower]) plate = plateMap[nameLower];
      if (plate) return { ...p, _plate: plate };
      if (teamIsLE) return { ...p, _plate: null };
      return p;
    });

    const policePlayers = enrichedPlayers.filter(p => {
      return (p._plate !== undefined && p._plate !== null) || isNonCivilTeam(p.Team || '');
    });

    ui.renderPlayers(policePlayers);

    if (mapController) {
      mapController.setPlayers(enrichedPlayers);
      mapController.setCalls(data.EmergencyCalls || []);
      mapController.ensureFollowCentered();
    }

    const enrichedShifts = await buildEnrichedShifts(shifts);

    // Extras por turno: rango/sueldo (de rank_members) y ubicación en vivo (de Players).
    const byShiftId = {};
    for (const key in plateMap) {
      const info = plateMap[key];
      if (info && info.shiftId) byShiftId[info.shiftId] = info;
    }
    const locByShiftId = {};
    for (const p of enrichedPlayers) {
      if (p && p._plate && p._plate.shiftId) {
        const loc = playerLocation(p);
        if (loc) locByShiftId[p._plate.shiftId] = loc;
      }
    }
    for (const s of enrichedShifts) {
      const info = byShiftId[s.id];
      if (info) {
        s._discord_id = info.discord_id;
        s._rank_label = info.rank_label;
        s._hourly = info.hourly;
      }
      s._location = locByShiftId[s.id] || null;
    }

    ui.renderStatusPanel(enrichedShifts);
    ui.updateBodycamRoster(enrichedShifts);

    checkPanicAlerts(shifts);

    computeLogDiff(shifts, data.EmergencyCalls || []);

    const emergencyCalls = data.EmergencyCalls || [];
    const assignments = await fetchCallAssignments();
    ui.renderEmergencyCalls(emergencyCalls, enrichedShifts, assignments);

    checkAndAutoEndShifts(players, shifts).catch(err => {
      console.warn('Auto-end shifts check failed:', err);
    });

    state.lastPlayers = players;
    state.lastQueue = data.Queue || [];

  } catch (error) {
    console.warn('Error al conectar con la API:', error.message);
    state.fetchDelay = Math.min(state.maxDelay, state.fetchDelay + 600);
    if (state.isFirstLoad) { }
    ui.updateDashboard(null);
    updateTimestamp();
  } finally {
    state._fetching = false;
    state.isFirstLoad = false;
  }
}

// Scheduler: se refresca lo más rápido posible (baseDelay) y se frena solo si la
// API devuelve límite de peticiones o hay errores, reintentando automáticamente.
function scheduleFetch() {
  if (state._fetchTimer) clearTimeout(state._fetchTimer);
  const delay = document.hidden ? Math.max(state.fetchDelay, 3000) : state.fetchDelay;
  state.nextFetchAt = Date.now() + delay;
  state._fetchTimer = setTimeout(() => {
    fetchData().finally(scheduleFetch);
  }, delay);
}

function hideLoading() {
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
  }
  if (mainContent) {
    mainContent.classList.remove('hidden');
  }
}

function showError(message) {
  if (loadingScreen) {
    loadingScreen.innerHTML = `
      <div class="loader-container" style="max-width: 400px;">
        <div style="color: #e54850; font-size: 48px; margin-bottom: 16px;">!</div>
        <div class="loader-text" style="font-size: 18px; color: #e54850;">Error de Configuración</div>
        <div class="loader-sub" style="font-size: 13px; color: #8a93a7; margin-top: 12px; line-height: 1.5;">
          ${escapeHtml(message)}
        </div>
        <div style="margin-top: 20px; font-size: 11px; color: #4c5a72;">
          Después de configurar la API Key, actualiza la página.
        </div>
      </div>
    `;
  }
}

function updateTimestamp() {
  ui.updateTimestamp();
}

function checkPanicAlerts(shifts) {
  if (!Array.isArray(shifts)) return;
  const panicShifts = shifts.filter(s => s.status_code === '10-100');
  const currentIds = new Set(panicShifts.map(s => s.id));
  for (const s of panicShifts) {
    if (!processedPanics.has(s.id)) {
      processedPanics.add(s.id);
      ui.showPanicAlert(s);
    }
  }
  for (const id of processedPanics) {
    if (!currentIds.has(id)) {
      processedPanics.delete(id);
    }
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    state.fetchDelay = state.baseDelay;
    fetchData().finally(scheduleFetch);
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
