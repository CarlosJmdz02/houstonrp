// ── Códigos 10-x del MDT (fuente única para Dispatch) ──
// Se usa en el panel "Estado de unidades" y en el modal del punto del oficial.
// Debe mantenerse sincronizado con TEN_CODES de mdt.html / police.html.
export const TEN_CODE_OPTIONS = [
  { code: '10-8',   label: 'En servicio' },
  { code: '10-6',   label: 'Ocupado' },
  { code: '10-7',   label: 'Fuera de servicio' },
  { code: '10-5',   label: 'Vigilancia' },
  { code: '10-11',  label: 'Detención de tráfico' },
  { code: '10-15',  label: 'Persona sospechosa' },
  { code: '10-23',  label: 'Llegó a la escena' },
  { code: '10-50',  label: 'Accidente grave' },
  { code: '10-97',  label: 'Funcionario de bienes' },
  { code: '10-98',  label: 'Disponible' },
  { code: '10-99',  label: 'Oficial en apuros' },
  { code: '10-100', label: 'PÁNICO' },
];

export class UI {
  constructor() {
    this.statStatus = document.getElementById('stat-status');
    this.statPlayers = document.getElementById('stat-players');
    this.statMax = document.getElementById('stat-max');
    this.statQueue = document.getElementById('stat-queue');
    this.statFps = document.getElementById('stat-fps');
    this.statUptime = document.getElementById('stat-uptime');
    this.statUpdated = document.getElementById('stat-updated');
    this.badgeStatus = document.getElementById('badge-status');

    this.playersList = document.getElementById('players-list');
    this.playersCount = document.getElementById('players-count');

    this.rightPanel = document.getElementById('right-panel');
    this.statusList = document.getElementById('status-list');
    this.statusCount = document.getElementById('status-count');

    this.dispatchLog = document.getElementById('dispatch-log');
    this.logCount = document.getElementById('log-count');

    this.modal = document.getElementById('call-modal');
    this.modalTitle = document.getElementById('modal-title');
    this.modalBody = document.getElementById('modal-body');
    this.modalClose = document.getElementById('modal-close');
    this.modalCloseBtn = document.getElementById('modal-close-btn');
    this.modalCenter = document.getElementById('modal-center');

    this._currentPlayerData = null;
    this._onCenterCallback = null;
    this._onStatusUpdate = null;
    this._ownShiftChecked = false;
    this._ownShiftOk = false;

    // ── Panel de bodycams (solo Dispatch): tiles persistentes ──
    this._bcTiles = new Map();     // peerId → { el, video, viewer, ... }
    this._bcRosterKey = null;
    this._bcRoster = null;
    this._bcPanel = null;
    this._bcGrid = null;
    this._bcRosterCount = null;
    this._bcPanelCount = null;

    this.setupModalEvents();
    this.initBodycamPanel();

    this._audio = null;
    this._audioUnlocked = false;
    this._audioEnabled = true;

    this._hoverAudio = null;
    this._hoverAudioInit = false;
  }

  getTeamDotColor(teamLower) {
    if (teamLower.includes('poli') || teamLower === 'police') return '#3b6fb6';
    if (teamLower.includes('sheriff') || teamLower.includes('hcso') || teamLower.includes('dps')) return '#d4a017';
    if (teamLower.includes('fire') || teamLower.includes('bomber')) return '#e54850';
    if (teamLower.includes('ems') || teamLower.includes('medic') || teamLower.includes('ambulance')) return '#9b72cf';
    if (teamLower.includes('tow') || teamLower.includes('grua')) return '#ffb020';
    return '#8a93a7';
  }

  getTeamClass(teamLower) {
    if (teamLower.includes('poli') || teamLower === 'police') return 'police';
    if (teamLower.includes('sheriff') || teamLower.includes('hcso') || teamLower.includes('dps')) return 'sheriff';
    if (teamLower.includes('fire') || teamLower.includes('bomber')) return 'fire';
    if (teamLower.includes('ems') || teamLower.includes('medic') || teamLower.includes('ambulance')) return 'ems';
    if (teamLower.includes('tow') || teamLower.includes('grua')) return 'tow';
    return 'other';
  }

  locationOf(p) {
    if (!p) return null;
    if (p.Location && (p.Location.LocationX !== undefined || p.Location.LocationZ !== undefined)) {
      const lx = Number(p.Location.LocationX);
      const lz = Number(p.Location.LocationZ);
      if (isFinite(lx) && isFinite(lz)) {
        return { x: lx, z: lz, street: p.Location.StreetName, postal: p.Location.PostalCode, building: p.Location.BuildingNumber };
      }
    }
    if (Array.isArray(p.Position) && p.Position.length >= 2 && typeof p.Position[0] === 'number' && typeof p.Position[1] === 'number') {
      return { x: p.Position[0], z: p.Position[1], street: null, postal: null, building: null };
    }
    if (typeof p.PositionDescriptor === 'string') {
      const parts = p.PositionDescriptor.split(',').map(s => parseFloat(String(s).trim()));
      if (parts.length >= 2 && isFinite(parts[0]) && isFinite(parts[1])) {
        return { x: parts[0], z: parts[1], street: null, postal: null, building: null };
      }
    }
    return null;
  }

  initAudio() {
    try {
      this._audio = new Audio('audios/llamada.MP3');
      this._audio.preload = 'auto';
      this._audio.volume = 1;
      this._audio.muted = false;

      this._audioIndicator = document.getElementById('audio-indicator');
      this._audioStatus = document.getElementById('audio-status');
      this._audioIcon = document.getElementById('audio-icon');

      const unlock = () => {
        if (this._audioUnlocked) return;
        this._audio.play().then(() => {
          this._audio.pause();
          this._audio.currentTime = 0;
          this._audioUnlocked = true;
          this.updateAudioUI();
        }).catch(() => {});
        document.removeEventListener('click', unlock);
        document.removeEventListener('touchstart', unlock);
        document.removeEventListener('keydown', unlock);
      };
      document.addEventListener('click', unlock, { once: true });
      document.addEventListener('touchstart', unlock, { once: true });
      document.addEventListener('keydown', unlock, { once: true });

      if (this._audioIndicator) {
        this._audioIndicator.addEventListener('click', () => this.toggleAudio());
      }

      this.updateAudioUI();
    } catch (e) {
      console.warn('No se pudo inicializar audio:', e);
    }
  }

  updateAudioUI() {
    if (this._audioStatus) {
      if (!this._audioUnlocked) {
        this._audioStatus.textContent = '...';
      } else if (this._audioEnabled) {
        this._audioStatus.textContent = 'SÍ';
      } else {
        this._audioStatus.textContent = 'NO';
      }
    }
    if (this._audioIndicator) {
      this._audioIndicator.className = 'stat-card stat-card-audio';
      if (!this._audioUnlocked) {
        this._audioIndicator.classList.add('audio-muted');
      } else if (!this._audioEnabled) {
        this._audioIndicator.classList.add('audio-muted');
      } else {
        this._audioIndicator.classList.add('audio-active');
      }
    }
  }

  toggleAudio() {
    if (!this._audioUnlocked) return;
    this._audioEnabled = !this._audioEnabled;
    this.updateAudioUI();
  }

  playNotificationSound() {
    if (!this._audio || !this._audioUnlocked || !this._audioEnabled) return;
    try {
      this._audio.currentTime = 0;
      this._audio.play().catch(() => {});
    } catch (e) {}
  }

  updateDashboard(data) {
    const serverOnline = data && data.Name;

    if (this.statStatus) {
      this.statStatus.textContent = serverOnline ? 'En línea' : 'Fuera de línea';
    }
    if (this.badgeStatus) {
      this.badgeStatus.className = 'stat-badge ' + (serverOnline ? 'online' : 'offline');
    }

    if (!serverOnline) {
      if (this.statPlayers) this.statPlayers.textContent = '--';
      if (this.statMax) this.statMax.textContent = '--';
      if (this.statQueue) this.statQueue.textContent = '--';
      if (this.statFps) this.statFps.textContent = '—';
      if (this.statUptime) this.statUptime.textContent = '—';
      return;
    }

    if (this.statPlayers) {
      this.statPlayers.textContent = data.CurrentPlayers ?? '--';
    }
    if (this.statMax) {
      this.statMax.textContent = data.MaxPlayers ?? '--';
    }
    if (this.statQueue) {
      this.statQueue.textContent = Array.isArray(data.Queue) ? data.Queue.length : '0';
    }
    if (this.statFps) {
      this.statFps.textContent = '—';
    }
    if (this.statUptime) {
      this.statUptime.textContent = '—';
    }
  }

  updateTimestamp() {
    if (!this.statUpdated) return;
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    this.statUpdated.textContent = `${h}:${m}:${s}`;
  }

  initHoverSound() {
    try {
      this._hoverAudio = new Audio('assets/sound/click.mp4');
      this._hoverAudio.volume = 0.3;
    } catch (e) {
      console.warn('No se pudo inicializar hover sound:', e);
    }
  }

  playHoverSound() {
    if (!this._hoverAudio) return;
    try {
      this._hoverAudio.currentTime = 0;
      this._hoverAudio.play().catch(() => {});
    } catch (e) {}
  }

  renderCalls(emergencyCalls, onCenterCallback) {
    return { added: [], removed: [] };
  }

  renderEmergencyCalls(calls, activeShifts, assignments) {
    const list = document.getElementById('calls-list');
    const count = document.getElementById('calls-count');
    if (!list) return;
    const arr = Array.isArray(calls) ? calls : [];
    if (count) count.textContent = arr.length;

    if (!this._prevCallIds) this._prevCallIds = new Set();

    const self = this;
    const _callPosById = {};

    const ids = arr.map(c => c.id || c.CallNumber || c.CallId || '');
    const newIds = new Set(ids);

    ids.forEach((id, i) => {
      const c = arr[i];
      const pos = this.locationOf(c);
      _callPosById[id] = pos
        ? { x: pos.x, z: pos.z, street: pos.street, postal: pos.postal, building: pos.building }
        : null;
    });
    this._callPosById = _callPosById;

    const prevIds = this._prevCallIds;

    if (arr.length === 0) {
      list.innerHTML = '<div class="empty-state">No hay llamadas activas</div>';
      this._prevCallIds = new Set();
      return;
    }

    const isSame =
      prevIds.size === newIds.size &&
      arr.every(c => prevIds.has(c.id || c.CallNumber || c.CallId || ''));

    if (isSame) return;

    this._prevCallIds = newIds;
    const officers = Array.isArray(activeShifts) ? activeShifts : [];
    const assignMap = (assignments && typeof assignments === 'object') ? assignments : {};
    list.innerHTML = arr.map((c, i) => {
      const caller = this.escapeHtml(c.Caller || 'Desconocido');
      const reason = this.escapeHtml(c.Description || c.description || c.Reason || c.reason || '—');
      const loc = c.PositionDescriptor
        ? this.escapeHtml(c.PositionDescriptor)
        : (c.Location ? this.escapeHtml(c.Location) : (c.Position ? `X:${c.Position[0]?.toFixed(0)} Z:${c.Position[1]?.toFixed(0)}` : '—'));
      const id = c.id || c.CallNumber || c.CallId || '';
      const assigned = assignMap[id];
      let assignHtml = '';
      if (assigned) {
        assignHtml = `
          <div class="call-card-assign">
            <span style="font-size:11px;color:#4acf8f;font-weight:600;">✅ Asignada a ${this.escapeHtml(assigned.unit_name)}</span>
            <button class="call-assign-release" data-call-id="${id}" onclick="releaseCallAssignment(this.dataset.callId)">Liberar</button>
          </div>`;
      } else {
        assignHtml = `
          <div class="call-card-assign">
            <select class="call-assign-select" data-call-id="${id}" onchange="assignCallToUnit(this)">
              <option value="">— Asignar a —</option>
              ${officers.map(s => `<option value="${s.id}">${this.escapeHtml(s._displayName || s.username || 'Oficial')}</option>`).join('')}
            </select>
          </div>`;
      }
      return `<div class="call-card" data-call-id="${id}">
        <div class="call-card-header">
          <span class="call-card-id">#${id}</span>
          <span class="call-card-reason">${reason}</span>
        </div>
        <div class="call-card-body">
          <div class="call-card-row"><span class="call-label">🆔</span><span>${caller}</span></div>
          <div class="call-card-row"><span class="call-label">📍</span><span>${loc}</span></div>
        </div>
        ${assignHtml}
      </div>`;
    }).join('');

    list.querySelectorAll('.call-card').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        if (e.target.closest('.call-card-assign')) return;
        const id = card.dataset.callId;
        const pos = self._callPosById && self._callPosById[id];
        if (pos && self._onCenterCallback) {
          self._onCenterCallback(pos.x, pos.z);
        }
      });
    });
  }

  showPanicAlert(shift) {
    this.playPanicSound();
    this.panicFlash();
    const msg = `🚨 ¡${shift.username || 'Un oficial'} activó ALERTA DE PÁNICO (10-100)!`;
    const existing = document.getElementById('panic-alert');
    if (existing) {
      existing.querySelector('.panic-alert-msg').textContent = msg;
      existing.classList.remove('hidden');
      existing.style.animation = 'none';
      requestAnimationFrame(() => { existing.style.animation = ''; });
      return;
    }
    const alertEl = document.createElement('div');
    alertEl.id = 'panic-alert';
    alertEl.className = 'panic-alert';
    alertEl.innerHTML = `
      <div class="panic-alert-inner">
        <div class="panic-alert-icon">🚨</div>
        <div class="panic-alert-msg">${msg}</div>
        <button class="panic-alert-close" onclick="this.parentElement.parentElement.remove()">✕</button>
      </div>
    `;
    document.body.appendChild(alertEl);
    setTimeout(() => { const el = document.getElementById('panic-alert'); if (el) el.remove(); }, 8000);
  }

  panicFlash() {
    try {
      let flash = document.getElementById('panic-flash');
      if (!flash) {
        flash = document.createElement('div');
        flash.id = 'panic-flash';
        document.body.appendChild(flash);
      }
      flash.classList.remove('active');
      void flash.offsetWidth;
      flash.classList.add('active');
      const mapEl = document.getElementById('map-container');
      if (mapEl) {
        mapEl.classList.remove('panic-blink');
        void mapEl.offsetWidth;
        mapEl.classList.add('panic-blink');
      }
      setTimeout(() => { flash.classList.remove('active'); }, 1400);
    } catch (e) {}
  }

  playPanicSound() {
    try {
      if (!this._panicAudio) {
        this._panicAudio = new Audio('audios/panic-button.mp3');
        this._panicAudio.preload = 'auto';
      }
      if (this._audioUnlocked && this._audioEnabled) {
        this._panicAudio.currentTime = 0;
        this._panicAudio.play().catch(() => {});
      }
    } catch (e) {}
  }

  renderStatusPanel(shifts) {
    if (!this.statusList) return;

    const list = Array.isArray(shifts) ? shifts : [];

    if (this.statusCount) {
      this.statusCount.textContent = list.length;
    }

    if (!this.rightPanel) return;
    this.rightPanel.classList.remove('hidden');

    this.statusList.innerHTML = '';
    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No hay unidades en servicio';
      this.statusList.appendChild(empty);
      return;
    }
    for (const shift of list) {
      this.statusList.appendChild(this.createStatusCard(shift));
    }
  }

  createStatusCard(shift) {
    const card = document.createElement('div');
    card.className = 'status-card';

    const displayName = shift._displayName || shift.username || 'Desconocido';
    const deptLabel = (shift.department || 'hpd').toUpperCase();
    const currentCode = shift.status_code || '10-8';
    const codeClass = this.getStatusCodeClass(currentCode);
    const rankLabel = shift._rank_label ? ' · ' + this.escapeHtml(shift._rank_label) : '';

    const loc = shift._location;
    let locText = '';
    if (loc) {
      const parts = [loc.postal, loc.street, loc.building ? '#' + loc.building : ''].filter(Boolean);
      locText = parts.length ? parts.join(' · ') : ('X:' + Math.round(loc.x) + ' Z:' + Math.round(loc.z));
    }
    const locHtml = locText
      ? `<div class="status-card-loc">📍 ${this.escapeHtml(locText)}</div>`
      : '';

    const isPanic = currentCode === '10-100';
    const codes = TEN_CODE_OPTIONS.map(c => c.code);

    card.innerHTML = `
      <div class="status-card-header ${isPanic ? 'panic-header' : ''}">
        <div>
          <div class="status-card-name">
            <span class="team-dot" style="background:#3b6fb6;box-shadow:0 0 4px #3b6fb6;width:6px;height:6px;border-radius:50%;display:inline-block;"></span>
            ${this.escapeHtml(displayName)}
            ${isPanic ? '<span class="panic-indicator">🚨</span>' : ''}
          </div>
          <div class="status-card-dept">${deptLabel}${rankLabel} · #${shift.id}</div>
          ${locHtml}
        </div>
        <span class="status-card-current ${codeClass}">${isPanic ? '🔴 10-100 PÁNICO' : currentCode}</span>
      </div>
      <div class="status-card-actions status-card-grid">
        ${codes.map(code => {
          const isPanicBtn = code === '10-100';
          return `<button class="status-btn ${isPanicBtn ? 'status-btn-panic' : ''} ${code === currentCode ? 'active' : ''}" data-shift-id="${shift.id}" data-code="${code}">${code}</button>`;
        }).join('')}
      </div>
    `;

    card.addEventListener('mouseenter', () => this.playHoverSound());

    const buttons = card.querySelectorAll('.status-btn');
    for (const btn of buttons) {
      btn.addEventListener('mouseenter', () => this.playHoverSound());
      btn.addEventListener('click', (e) => {
        const code = btn.dataset.code;
        if (code === '10-100') {
          const name = card.querySelector('.status-card-name')?.textContent?.trim() || 'Este oficial';
          if (!confirm(`⚠️ ¿ESTÁS SEGURO? Vas a activar ALERTA DE PÁNICO (10-100) para ${name}.\n\nTodos los clientes recibirán la alerta de emergencia.`)) return;
        }
        const shiftId = btn.dataset.shiftId;
        if (this._onStatusUpdate && shiftId) {
          this._onStatusUpdate(shiftId, code);
        }
        for (const b of buttons) b.classList.remove('active');
        btn.classList.add('active');
        const badge = card.querySelector('.status-card-current');
        if (badge) {
          const isPanic = code === '10-100';
          badge.textContent = isPanic ? '🔴 10-100 PÁNICO' : code;
          badge.className = `status-card-current ${this.getStatusCodeClass(code)}`;
          card.querySelector('.status-card-header')?.classList.toggle('panic-header', isPanic);
        }
        if (code === '10-100') {
          this.playPanicSound();
        }
      });
    }

    return card;
  }

  getStatusCodeClass(code) {
    if (code === '10-8') return 'code-10-8';
    if (code === '10-7') return 'code-10-7';
    if (code === '10-6') return 'code-10-6';
    if (code === '10-100') return 'code-10-100';
    return 'code-default';
  }

  renderPlayers(players) {
    if (!this.playersList) return;

    const list = Array.isArray(players) ? players : [];

    if (this.playersCount) {
      this.playersCount.textContent = list.length;
    }

    if (list.length === 0) {
      this.playersList.innerHTML = '<div class="empty-state">No hay oficiales conectados</div>';
      return;
    }

    this.playersList.innerHTML = '';
    for (const player of list) {
      this.playersList.appendChild(this.createPlayerCard(player));
    }
  }

  renderLog(entries) {
    if (!this.dispatchLog) return;
    if (this.logCount) this.logCount.textContent = entries.length;
    this.dispatchLog.innerHTML = '';
    const frag = document.createDocumentFragment();
    const total = entries.length;
    for (let i = total - 1; i >= 0; i--) {
      const e = entries[i];
      const el = document.createElement('div');
      el.className = 'log-entry log-' + (e.type || 'status');
      el.innerHTML = `<span class="log-time">${e.time}</span><span class="log-text">${this.escapeHtml(e.text)}</span>`;
      frag.appendChild(el);
    }
    this.dispatchLog.appendChild(frag);
  }

  createPlayerCard(player) {
    const card = document.createElement('div');
    card.className = 'player-card fade-in';

    const initial = (player.Player || '?')[0].toUpperCase();
    const teamLower = (player.Team || '').toLowerCase();
    const dotColor = this.getTeamDotColor(teamLower);
    const isPolice = teamLower.includes('poli') || teamLower === 'police';
    const plate = player._plate;
    const isPanic = plate && plate.status_code === '10-100';
    const isWanted = Number(player.WantedStars) > 0;

    if (isPanic) card.classList.add('panic');
    if (isWanted) card.classList.add('wanted');
    if (isPolice) card.classList.add('is-police');

    let plateHtml = '';
    if (isPolice) {
      if (plate) {
        const deptLabel = (plate.department || 'hpd').toUpperCase();
        plateHtml = `<span style="font-size:10px;color:#3b6fb6;font-family:monospace;margin-left:4px;">#${plate.shiftId} · ${deptLabel}</span>`;
      } else {
        plateHtml = `<span style="font-size:10px;color:#8a93a7;font-family:monospace;margin-left:4px;">—</span>`;
      }
    }
    const csHtml = player.Callsign
      ? `<span class="call-sign-chip">${this.escapeHtml(player.Callsign)}</span>`
      : '';
    const wantedHtml = isWanted
      ? `<span style="color:#e54850;font-size:10px;font-weight:600;margin-left:4px;">★${player.WantedStars}</span>`
      : '';
    const loc = this.locationOf(player);
    const locHtml = (loc && (loc.street || loc.postal))
      ? `<div class="player-loc">📍 ${this.escapeHtml([loc.postal, loc.street].filter(Boolean).join(' · '))}${loc.building ? ' · #' + this.escapeHtml(loc.building) : ''}</div>`
      : '';

    const panicBadge = isPanic
      ? '<div class="player-panic-badge">🚨 10-100 PÁNICO</div>'
      : '';

    // Chip directo a la bodycam (solo Dispatch) — un clic y se abre en el panel.
    const bcPeer = plate && plate.bodycam_active ? (plate.bodycam_peer_id || '') : '';
    const bcChip = (window.HRP_IS_DISPATCHER === true && bcPeer)
      ? '<button type="button" class="bc-card-chip" title="Ver bodycam en el panel">📹</button>'
      : '';

    card.innerHTML = `
      <div class="player-avatar" style="border-color:${dotColor}44;background:${dotColor}22;color:${dotColor};">${initial}</div>
      <div class="player-info">
        <div class="player-name">${this.escapeHtml(player.Player || 'Desconocido')}${plateHtml}${csHtml}${wantedHtml}${bcChip}</div>
        <div class="player-team">
          <span class="team-dot" style="background:${dotColor};box-shadow:0 0 4px ${dotColor};"></span>
          ${this.escapeHtml(player.Team || 'Civil')}
        </div>
        ${locHtml}
      </div>
      ${panicBadge}
    `;

    if (bcChip) {
      const chip = card.querySelector('.bc-card-chip');
      if (chip) {
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openBodycamTile({ peerId: bcPeer, name: player.Player || 'Oficial' });
        });
      }
    }

    card.addEventListener('click', () => {
      if (this._onSelectPlayer) {
        try { this._onSelectPlayer(player.Player); } catch (e) {}
      }
      if (this._onCenterCallback) {
        const playerLoc = this.locationOf(player);
        if (playerLoc) {
          this._onCenterCallback(playerLoc.x, playerLoc.z);
        }
      }
      this.showPlayerModal(player);
    });

    return card;
  }

  showPlayerModal(player) {
    if (!this.modal || !this.modalTitle || !this.modalBody) return;

    this._currentPlayerData = player;
    this._ownShiftChecked = false;
    this._ownShiftOk = false;

    const teamLower = (player.Team || '').toLowerCase();
    const teamBadgeClass = this.getTeamClass(teamLower);
    const dotColor = this.getTeamDotColor(teamLower);
    const isPolice = teamLower.includes('poli') || teamLower === 'police';
    const plate = player._plate;

    this.modalTitle.textContent = `${this.escapeHtml(player.Player || 'Desconocido')}`;

    const isUnit = isPolice || !/civil/i.test(teamLower);
    let plateRow = '';
    let statusRow = '';
    let callsignRow = '';
    let wantedRow = '';
    let panicRow = '';
    let discordRow = '';
    let deptRow = '';
    let rankRow = '';

    // Filas exclusivas de policía / sheriff.
    if (isPolice) {
      if (player.Callsign) {
        callsignRow = `<div class="in-game-plate">
          <span class="igp-label">PLACA EN JUEGO</span>
          <span class="igp-value">${this.escapeHtml(player.Callsign)}</span>
        </div>`;
      }
      const wanted = Number(player.WantedStars) || 0;
      if (wanted > 0) {
        wantedRow = `<div class="info-row">
          <span class="info-label">Buscado</span>
          <span class="info-value" style="color:#e54850;font-weight:600;">${'★'.repeat(Math.min(wanted, 5))} (${wanted} estrellas)</span>
        </div>`;
      }
    }

    // Filas de cualquier unidad con turno activo (policía, sheriff, bomberos, EMS, grúa...).
    if (plate) {
      const deptLabel = (plate.department || 'hpd').toUpperCase();
      const sc = plate.status_code || '10-8';
      const isPanic = sc === '10-100';
      if (isPanic) panicRow = `<div class="panic-banner">🚨 10-100 — ¡PÁNICO ACTIVO! 🚨</div>`;
      plateRow = `<div class="info-row">
        <span class="info-label">Unidad</span>
        <span class="info-value" style="color:#3b6fb6;font-family:monospace;font-size:15px;">#${plate.shiftId} · ${deptLabel}</span>
      </div>`;
      statusRow = `<div class="info-row">
        <span class="info-label">Estado</span>
        <span class="info-value" style="color:${isPanic ? '#e54850' : '#4acf8f'};font-weight:600;">${sc}${isPanic ? ' 🚨' : ''}</span>
      </div>`;
      deptRow = `<div class="info-row">
        <span class="info-label">Departamento</span>
        <span class="info-value" style="color:#3b6fb6;font-weight:600;">${this.escapeHtml(deptLabel)}</span>
      </div>`;
      if (plate.username) {
        discordRow = `<div class="info-row">
          <span class="info-label">Discord</span>
          <span class="info-value" style="font-family:monospace;">@${this.escapeHtml(String(plate.username))}
            <button class="btn-copy-discord" data-discord="${this.escapeHtml(plate.discord_id || plate.username)}" style="margin-left:6px;font-size:10px;padding:2px 8px;cursor:pointer;">Copiar</button>
          </span>
        </div>`;
      }
      if (plate.rank_label) {
        const hourly = Number(plate.hourly) || 0;
        rankRow = `<div class="info-row">
          <span class="info-label">Rango</span>
          <span class="info-value" style="color:#e6a868;font-weight:600;">${this.escapeHtml(plate.rank_label)}
            ${hourly ? `<span style="color:#8a93a7;font-weight:400;font-family:monospace;"> · $${hourly.toLocaleString()}/h in-game ($${(hourly * 6).toLocaleString()}/h real)</span>` : ''}
          </span>
        </div>`;
      }
    } else if (isUnit) {
      plateRow = `<div class="info-row">
        <span class="info-label">Unidad</span>
        <span class="info-value" style="color:var(--text-muted);">Sin turno activo</span>
      </div>`;
    }

    const loc = this.locationOf(player);
    const posStr = loc ? `X: ${Number(loc.x).toFixed(2)} / Z: ${Number(loc.z).toFixed(2)}` : 'No disponible';

    let locRow = '';
    if (loc && (loc.street || loc.postal || loc.building)) {
      const parts = [];
      if (loc.postal) parts.push('Postal: ' + loc.postal);
      if (loc.street) parts.push(loc.street);
      if (loc.building) parts.push('#' + loc.building);
      locRow = `<div class="info-row">
        <span class="info-label">Ubicación</span>
        <span class="info-value" style="color:#e6a868;">${this.escapeHtml(parts.join(' · '))}</span>
      </div>`;
    }

    // ── BODYCAM: solo el Dispatch. En vez de abrir/cerrar un visor cada vez
    //    que cambia de unidad, se manda al PANEL de bodycams (persistente). ──
    const isDispatcher = window.HRP_IS_DISPATCHER === true;
    const bcPeer = plate && plate.bodycam_active ? (plate.bodycam_peer_id || '') : '';
    let bodycamHtml = '';
    if (isDispatcher && plate && plate.shiftId) {
      if (bcPeer) {
        const alreadyOpen = this._bcTiles && this._bcTiles.has(bcPeer);
        bodycamHtml = `
          <div class="bc-section">
            <div class="bc-head">
              <span class="bc-label"><span class="bc-dot"></span> Bodycam del oficial</span>
              <span style="font-size:10px;color:#4acf8f;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">EN VIVO</span>
            </div>
            <button type="button" class="bc-open-panel-btn" id="bc-open-panel">
              ${alreadyOpen ? '📺 Ya está abierta — ir al panel' : '📹 Ver bodycam en el panel'}
            </button>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:6px;line-height:1.45;">
              Se abre en el panel de bodycams y se queda ahí aunque cambies de unidad. Podés abrir varias a la vez.
            </div>
          </div>`;
      } else {
        bodycamHtml = `
          <div class="bc-section">
            <div class="bc-head">
              <span class="bc-label"><span class="bc-dot off"></span> Bodycam</span>
              <span style="font-size:10.5px;color:var(--text-muted);">Apagada</span>
            </div>
          </div>`;
      }
    }

    this.modalBody.innerHTML = `
      ${panicRow}
      <div class="info-row">
        <span class="info-label">Nombre</span>
        <span class="info-value">${this.escapeHtml(player.Player || 'Desconocido')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Equipo</span>
        <span class="info-value">
          <span class="team-badge ${teamBadgeClass}">${this.escapeHtml(player.Team || 'Civil')}</span>
        </span>
      </div>
      ${callsignRow}
      ${plateRow}
      ${statusRow}
      ${discordRow}
      ${deptRow}
      ${rankRow}
      ${wantedRow}
      ${locRow}
      <div class="info-row">
        <span class="info-label">Coordenadas</span>
        <span class="info-value" style="font-family:monospace;">${posStr}</span>
      </div>
      ${bodycamHtml}
      ${isUnit ? this.statusEditorBlock(player, plate) : ''}
    `;

    this.modal.classList.remove('hidden');
    this.renderStatusEditor(player);

    // Botón "Ver bodycam en el panel" (solo Dispatch + bodycam encendida).
    const openBcBtn = document.getElementById('bc-open-panel');
    if (openBcBtn && isDispatcher && bcPeer) {
      openBcBtn.addEventListener('click', () => {
        this.openBodycamTile({ peerId: bcPeer, name: player.Player || 'Oficial' });
        this.hideModal();
      });
    }

    const copyBtn = this.modalBody.querySelector('.btn-copy-discord');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const val = copyBtn.getAttribute('data-discord') || '';
        if (navigator.clipboard) {
          navigator.clipboard.writeText(val).then(() => {
            copyBtn.textContent = 'Copiado ✓';
            setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 1500);
          }).catch(() => {});
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  // PANEL DE BODYCAMS — varias transmisiones abiertas a la vez,
  // sin que se cierren entre sí al cambiar de unidad/pantalla.
  // ══════════════════════════════════════════════════════════
  initBodycamPanel() {
    this._bcPanel = document.getElementById('bc-panel');
    this._bcGrid = document.getElementById('bc-panel-grid');
    this._bcRoster = document.getElementById('bc-roster');
    this._bcRosterCount = document.getElementById('bc-live-count');
    this._bcPanelCount = document.getElementById('bc-panel-count');
    this._bcRosterList = [];
    this._bcSavedPos = null;
    if (!this._bcPanel) return;

    const openBtn = document.getElementById('bc-panel-open');
    const closeBtn = document.getElementById('bc-panel-close');
    const minBtn = document.getElementById('bc-panel-min');
    const fullBtn = document.getElementById('bc-panel-full');
    const allBtn = document.getElementById('bc-open-all');
    if (openBtn) openBtn.addEventListener('click', () => this.showBodycamPanel());
    if (closeBtn) closeBtn.addEventListener('click', () => this.hideBodycamPanel());
    if (minBtn) minBtn.addEventListener('click', () => {
      const minimized = this._bcPanel.classList.toggle('min');
      minBtn.textContent = minimized ? '□' : '—';
    });
    if (fullBtn) fullBtn.addEventListener('click', () => this.toggleFullBodycamPanel(fullBtn));
    if (allBtn) allBtn.addEventListener('click', () => this.openAllBodycams());

    const head = document.getElementById('bc-panel-head');
    if (head) this.attachBodycamDrag(head);
    this.restoreBodycamPanelPos();

    window.addEventListener('pagehide', () => this.closeAllBodycams());
  }

  // ── Arrastrar el panel con la barra superior ──
  attachBodycamDrag(handle) {
    const panel = this._bcPanel;
    if (!panel) return;
    const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));
    let dragging = false;
    let moved = false;
    let sx = 0, sy = 0, ox = 0, oy = 0;

    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      if (!moved) { moved = true; panel.classList.add('dragging'); }

      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const fitsW = w <= window.innerWidth - 8;
      const fitsH = h <= window.innerHeight - 8;
      const x = clamp(ox + dx, fitsW ? 4 : -w + 110, fitsW ? window.innerWidth - w - 4 : window.innerWidth - 110);
      const y = clamp(oy + dy, fitsH ? 4 : 0, fitsH ? window.innerHeight - h - 4 : window.innerHeight - 56);
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      e.preventDefault();
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (moved) {
        panel.classList.remove('dragging');
        this.saveBodycamPanelPos();
      }
      moved = false;
    };

    handle.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('button')) return;
      const r = panel.getBoundingClientRect();
      panel.style.left = r.left + 'px';
      panel.style.top = r.top + 'px';
      panel.style.right = 'auto';
      panel.style.transform = 'none';
      panel.style.width = r.width + 'px';
      panel.classList.remove('full');
      const fullBtn = document.getElementById('bc-panel-full');
      if (fullBtn) {
        fullBtn.textContent = '⤢';
        fullBtn.title = 'Ampliar a toda la pantalla';
      }
      dragging = true;
      moved = false;
      sx = e.clientX;
      sy = e.clientY;
      ox = r.left;
      oy = r.top;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      e.preventDefault();
    });
  }

  toggleFullBodycamPanel(btn) {
    const panel = this._bcPanel;
    if (!panel) return;
    const isFull = panel.classList.toggle('full');
    btn.textContent = isFull ? '🗗' : '⤢';
    btn.title = isFull ? 'Restaurar tamaño' : 'Ampliar a toda la pantalla';
    if (!isFull) this.restoreBodycamPanelPos();
  }

  saveBodycamPanelPos() {
    try {
      const p = this._bcPanel;
      if (!p || p.classList.contains('full')) return;
      localStorage.setItem('hrp_bc_panel_pos', JSON.stringify({
        left: p.style.left, top: p.style.top, right: p.style.right, width: p.style.width, transform: p.style.transform
      }));
    } catch (_) {}
  }

  restoreBodycamPanelPos() {
    try {
      const raw = localStorage.getItem('hrp_bc_panel_pos');
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || !s.left) return;
      const p = this._bcPanel;
      const w = parseInt(s.width, 10) || 0;
      const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));
      const x = clamp(parseInt(s.left, 10) || 0, w && w <= window.innerWidth - 8 ? 4 : -w + 110,
        w && w <= window.innerWidth - 8 ? window.innerWidth - w - 4 : window.innerWidth - 110);
      const y = clamp(parseInt(s.top, 10) || 70, 4, Math.max(4, window.innerHeight - 56));
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.right = 'auto';
      p.style.transform = 'none';
      if (s.width) p.style.width = s.width;
    } catch (_) {}
  }

  // Abre de una sola vez TODAS las bodycams que están en vivo.
  openAllBodycams() {
    const list = Array.isArray(this._bcRosterList) ? this._bcRosterList : [];
    if (!list.length) return;
    if (typeof HRPBC === 'undefined') return;
    let opened = 0;
    for (const s of list) {
      if (!s || !s.bodycam_peer_id) continue;
      const ok = this.openBodycamTile({
        peerId: s.bodycam_peer_id,
        name: s._displayName || s.username || 'Oficial',
      });
      if (ok) opened++;
    }
    if (opened) this.showBodycamPanel();
  }

  releaseBcVideo(video) {
    if (!video) return;
    try {
      if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
    } catch (_) {}
    video.srcObject = null;
  }

  showBodycamPanel() {
    if (!this._bcPanel) return;
    this._bcPanel.classList.remove('hidden');
    // Al volver a mostrar, reanudamos la reproducción de cada tile.
    this._bcTiles.forEach(rec => {
      if (rec.video && rec.video.paused && rec.video.srcObject) {
        rec.video.play().catch(() => {});
      }
    });
    this.syncBodycamUI();
  }

  hideBodycamPanel() {
    if (!this._bcPanel) return;
    this._bcPanel.classList.add('hidden');
    // Se oculta pero NO se corta: se pausa el <video> para ahorrar CPU.
    this._bcTiles.forEach(rec => {
      try { if (rec.video && !rec.video.paused) rec.video.pause(); } catch (_) {}
    });
  }

  closeAllBodycams() {
    Array.from(this._bcTiles.keys()).forEach(id => this.closeBodycamTile(id));
  }

  openBodycamTile(opts) {
    const peerId = (opts && opts.peerId) || '';
    const name = (opts && opts.name) || 'Oficial';
    if (!peerId) return false;
    if (typeof HRPBC === 'undefined') return false;

    if (this._bcTiles.has(peerId)) {
      this.showBodycamPanel();
      const rec = this._bcTiles.get(peerId);
      if (rec && rec.el) {
        rec.el.style.outline = '2px solid rgba(74,204,143,.8)';
        setTimeout(() => { if (rec.el) rec.el.style.outline = ''; }, 900);
      }
      return true;
    }
    if (!this._bcGrid) return false;

    const empty = document.getElementById('bc-panel-empty');
    if (empty) empty.remove();

    const tile = document.createElement('div');
    tile.className = 'bc-tile';
    tile.dataset.peer = peerId;
    tile.innerHTML = `
      <div class="bc-tile-head">
        <span class="bc-tile-name">${this.escapeHtml(name)}</span>
        <span class="bc-tile-status">Conectando…</span>
        <button class="bc-tile-retry" type="button" title="Reintentar conexión" style="display:none;">Reintentar</button>
        <button class="bc-tile-close" type="button" title="Cerrar bodycam">✕</button>
      </div>
      <div class="bc-stage">
        <video autoplay playsinline muted></video>
        <div class="bc-msg">Abriendo transmisión de ${this.escapeHtml(name)}…</div>
        <div class="bc-osd"><span style="width:7px;height:7px;border-radius:50%;background:#e54850;display:inline-block;"></span> LIVE · ${this.escapeHtml(name)}</div>
      </div>`;

    const video = tile.querySelector('video');
    const stage = tile.querySelector('.bc-stage');
    const status = tile.querySelector('.bc-tile-status');
    const msg = tile.querySelector('.bc-msg');
    const retryBtn = tile.querySelector('.bc-tile-retry');

    const rec = { el: tile, video, stage, status, msg, viewer: null, name, closing: false };
    this._bcTiles.set(peerId, rec);

    const session = (typeof hrpGetSession === 'function') ? hrpGetSession() : null;

    rec.viewer = HRPBC.startViewer({
      peerId: peerId,
      officerName: name,
      viewerId: (session && session.id) || '',
      onStream: (remoteStream) => {
        if (!remoteStream || !remoteStream.getVideoTracks().length) return;
        video.srcObject = remoteStream;
        if (this._bcPanel && !this._bcPanel.classList.contains('hidden')) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
        stage.classList.add('live');
        tile.classList.remove('off');
        status.textContent = 'EN VIVO';
        status.className = 'bc-tile-status live';
        if (retryBtn) retryBtn.style.display = 'none';
        this.syncBodycamUI();
      },
      onDone: (r) => {
        if (rec.closing || this._bcTiles.get(peerId) !== rec) return;
        rec.viewer = null;
        this.releaseBcVideo(video);
        stage.classList.remove('live');
        tile.classList.add('off');
        status.textContent = r && r.ok ? 'CONECTADO' : 'SIN SEÑAL';
        status.className = 'bc-tile-status' + (r && r.ok ? '' : ' err');
        if (retryBtn) retryBtn.style.display = (r && r.retry) ? '' : 'none';
        if (msg) {
          msg.style.display = '';
          msg.textContent = (r && r.msg) || 'La bodycam se cerró.';
        }
        // Si el oficial la apagó (sin posibilidad de reintentar), lo sacamos
        // del panel solos para que no se acumulen tiles muertos.
        if (r && !r.ok && !r.retry) {
          setTimeout(() => {
            if (this._bcTiles.get(peerId) === rec && !rec.viewer) this.closeBodycamTile(peerId);
          }, 15000);
        }
        this.syncBodycamUI();
      },
    });

    tile.querySelector('.bc-tile-close').addEventListener('click', () => this.closeBodycamTile(peerId));
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        this.closeBodycamTile(peerId);
        this.openBodycamTile({ peerId: peerId, name: name });
      });
    }
    this._bcGrid.appendChild(tile);
    this.showBodycamPanel();
    this.syncBodycamUI();
    return true;
  }

  closeBodycamTile(peerId) {
    const rec = this._bcTiles.get(peerId);
    if (!rec) return;
    rec.closing = true;
    this._bcTiles.delete(peerId);
    try { if (rec.viewer) rec.viewer.stop(); } catch (_) {}
    rec.viewer = null;
    this.releaseBcVideo(rec.video);
    try { if (rec.el && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el); } catch (_) {}
    if (this._bcGrid && this._bcTiles.size === 0) {
      this._bcGrid.innerHTML = '<div class="bc-empty" id="bc-panel-empty">Elegí una unidad en la lista lateral y tocá “Ver bodycam”. Podés abrir varias a la vez: no se cierran entre sí.</div>';
    }
    this.syncBodycamUI();
  }

  syncBodycamUI() {
    const n = this._bcTiles.size;
    if (this._bcPanelCount) this._bcPanelCount.textContent = String(n);
    if (this._bcGrid) this._bcGrid.classList.toggle('only-one', n === 1);
    // Botones del roster lateral: marcar cuáles ya están abiertas.
    if (this._bcRoster) {
      this._bcRoster.querySelectorAll('.bc-live-row').forEach(row => {
        const btn = row.querySelector('.bc-open-btn');
        if (!btn) return;
        const open = this._bcTiles.has(row.dataset.peer);
        btn.classList.toggle('opened', open);
        btn.textContent = open ? 'Abierta' : 'Ver';
      });
    }
  }

  // Lista lateral de bodycams EN VIVO (se actualiza con el poll del Dispatch).
  // Solo re-renderiza cuando cambia el conjunto: así no parpadea cada 0.7 s.
  updateBodycamRoster(shifts) {
    if (!this._bcRoster) return;
    const list = (Array.isArray(shifts) ? shifts : [])
      .filter(s => s && s.bodycam_active && s.bodycam_peer_id);
    this._bcRosterList = list;

    const allBtn = document.getElementById('bc-open-all');
    if (allBtn) allBtn.style.display = list.length ? '' : 'none';

    const key = list.map(s =>
      s.bodycam_peer_id + '|' + (s._displayName || s.username || '') + '|' + (s.status_code || '')
    ).join(',');
    if (key === this._bcRosterKey) { this.syncBodycamUI(); return; }
    this._bcRosterKey = key;

    if (this._bcRosterCount) this._bcRosterCount.textContent = String(list.length);

    if (list.length === 0) {
      this._bcRoster.innerHTML = '<div class="empty-state">Ninguna bodycam activa</div>';
      this.syncBodycamUI();
      return;
    }

    this._bcRoster.innerHTML = '';
    for (const s of list) {
      const peerId = s.bodycam_peer_id;
      const name = s._displayName || s.username || 'Oficial';
      const dept = (s.department || 'hpd').toUpperCase();
      const code = s.status_code || '10-8';

      const row = document.createElement('div');
      row.className = 'bc-live-row';
      row.dataset.peer = peerId;
      row.innerHTML = `
        <span class="bc-dot" style="width:8px;height:8px;flex-shrink:0;"></span>
        <div class="bc-live-info">
          <div class="bc-live-name">${this.escapeHtml(name)}</div>
          <div class="bc-live-sub">${this.escapeHtml(dept)} · #${s.id} · ${this.escapeHtml(code)}</div>
        </div>
        <button class="bc-open-btn" type="button">Ver</button>`;
      row.querySelector('.bc-open-btn').addEventListener('click', () => {
        this.openBodycamTile({ peerId: peerId, name: name });
      });
      this._bcRoster.appendChild(row);
    }
    this.syncBodycamUI();
  }

  statusEditorBlock(player, plate) {
    const hasShift = !!(plate && plate.shiftId);
    if (!hasShift) {
      return `<div class="status-editor">
        <div class="se-head">Cambiar estado <span class="se-sub">(sincronizado con el MDT)</span></div>
        <div class="se-empty">Este oficial no tiene turno activo. Debe iniciar turno desde el MDT para que puedas cambiarle el estado.</div>
      </div>`;
    }
    return `<div class="status-editor">
      <div class="se-head">Cambiar estado <span class="se-sub">(sincronizado con el MDT)</span></div>
      <div class="se-current">Estado actual: <b id="st-current">${this.escapeHtml(plate.status_code || '10-8')}</b></div>
      <div class="se-buttons" id="st-buttons"><div class="se-empty">Comprobando turno…</div></div>
      <div class="se-msg" id="st-msg"></div>
    </div>`;
  }

  async userHasActiveShift() {
    if (this._ownShiftChecked) return this._ownShiftOk;
    try {
      const session = (typeof hrpGetSession === 'function') ? hrpGetSession() : null;
      if (!session || !session.id) { this._ownShiftOk = false; }
      else {
        const rows = await supaSelect('police_shift_sessions', 'id', { discord_id: `eq.${session.id}`, status: 'in.(active,break)', limit: '1' });
        this._ownShiftOk = Array.isArray(rows) && rows.length > 0;
      }
    } catch (e) { this._ownShiftOk = false; }
    this._ownShiftChecked = true;
    return this._ownShiftOk;
  }

  async renderStatusEditor(player) {
    const holder = document.getElementById('st-buttons');
    const msg = document.getElementById('st-msg');
    const plate = player && player._plate;
    if (!holder || !plate || !plate.shiftId) return;

    let msgText = '';
    const canEdit = (window.HRP_IS_DISPATCHER === true) || await this.userHasActiveShift();
    if (!canEdit) {
      msg.innerHTML = '⚠️ Para cambiar el estado de un oficial necesitás tener un <b>turno activo en el MDT</b> (iniciá turno primero).';
      return;
    }

    const current = plate.status_code || '10-8';

    holder.innerHTML = TEN_CODE_OPTIONS.map(({ code, label }) =>
      `<button type="button" class="se-btn${code === current ? ' active' : ''}${code === '10-100' ? ' danger' : ''}" data-code="${code}" title="${this.escapeHtml(label)}">${code} · ${this.escapeHtml(label)}</button>`
    ).join('');

    holder.querySelectorAll('.se-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.dataset.code;
        if (code === '10-100') {
          const name = (document.getElementById('modal-title') || {}).textContent || 'Este oficial';
          if (!confirm(`⚠️ ¿ESTÁS SEGURO? Vas a activar ALERTA DE PÁNICO (10-100) para ${name}.\n\nTodos los clientes recibirán la alerta de emergencia.`)) return;
        }
        btn.disabled = true;
        msg.innerHTML = '⏳ Guardando…';
        try {
          if (this._onStatusUpdate) await this._onStatusUpdate(plate.shiftId, code);
          plate.status_code = code;
          const curr = document.getElementById('st-current');
          if (curr) curr.textContent = code;
          holder.querySelectorAll('.se-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.code === code);
            b.disabled = false;
          });
          msg.innerHTML = '✅ Estado actualizado a <b>' + code + '</b> · sincronizado con el MDT del oficial y el registro del despacho.';
          if (code === '10-100') this.playPanicSound();
        } catch (e) {
          msg.textContent = '❌ Error al actualizar el estado. Reintentá.';
          btn.disabled = false;
        }
      });
    });
  }

  setupModalEvents() {
    if (this.modalClose) {
      this.modalClose.addEventListener('click', () => this.hideModal());
    }
    if (this.modalCloseBtn) {
      this.modalCloseBtn.addEventListener('click', () => this.hideModal());
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hideModal();
    });

    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) this.hideModal();
      });
    }

    if (this.modalCenter) {
      this.modalCenter.addEventListener('click', () => {
        if (this._currentPlayerData && this._onCenterCallback) {
          const p = this._currentPlayerData;
          const loc = this.locationOf(p);
          if (loc) {
            this._onCenterCallback(loc.x, loc.z);
          }
          this.hideModal();
        }
      });
    }
  }

  hideModal() {
    if (!this.modal) return;
    this.modal.classList.add('hidden');
    this._currentPlayerData = null;
  }

  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  formatTimestamp(unixSeconds) {
    if (!unixSeconds) return '--:--';
    const date = new Date(unixSeconds * 1000);
    const now = new Date();
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) return 'Ahora';
    if (diffMinutes < 60) return `Hace ${diffMinutes} min`;

    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}
