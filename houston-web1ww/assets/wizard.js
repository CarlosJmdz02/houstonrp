/* =========================================================================
   HOUSTON RP — WIZARD (LIVE PREVIEW FIX)
   ========================================================================= */

const $ = (id) => document.getElementById(id);
const TOTAL_STEPS = 4;

/* ============================= */
/* 🔵 SESIÓN */
/* ============================= */

(async function initSession(){

  if(typeof hrpGetSession !== "function"){
    window.location.href = "index.html";
    return;
  }

  const session = hrpGetSession();
  if(!session || !session.id){
    const _p=window.location.pathname.split('/').pop()||'index.html'; if(_p!=='index.html')localStorage.setItem('hrp_redirect',_p);
    window.location.href = "index.html";
    return;
  }

  $('user-name') && ($('user-name').textContent = session.username || "User");
  $('user-sub') && ($('user-sub').textContent = '@' + (session.username || "user"));

  const avatarEl = $('user-avatar');
  if(avatarEl){
    avatarEl.innerHTML = session.avatar
      ? `<img src="https://cdn.discordapp.com/avatars/${session.id}/${session.avatar}.png">`
      : '?';
  }

  $('btn-logout')?.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = "index.html";
  });

})();

/* abrir/cerrar el menú de usuario (ya existía el CSS .open, faltaba el toggle) */
$('user-card')?.addEventListener('click', (e) => {
  e.stopPropagation();
  $('user-popover')?.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  const pop = $('user-popover');
  const card = $('user-card');
  if(!pop || !card) return;
  if(!pop.contains(e.target) && !card.contains(e.target)){
    pop.classList.remove('open');
  }
});

/* ============================= */
/* 🔵 STATE */
/* ============================= */

let WIZ = JSON.parse(localStorage.getItem('hrp_wizard_data')) || { step: 1, signature: null };
if(!WIZ.step || WIZ.step < 1) WIZ.step = 1;
if(WIZ.step > TOTAL_STEPS) WIZ.step = TOTAL_STEPS;
if(WIZ.signature === undefined) WIZ.signature = null;
if(typeof WIZ.fields !== 'object' || !WIZ.fields) WIZ.fields = {};

function saveWizard(){
  localStorage.setItem('hrp_wizard_data', JSON.stringify(WIZ));
}

function val(id){
  const el = $(id);
  if(!el) return "";
  return (el.value || "").trim();
}

let rbxFetchTimer = null;

/* ============================= */
/* 🔥 LIVE PREVIEW — PASO 2 (ROBLOX) */
/* ============================= */

async function hrpFetchRobloxUser(username){
  if(!username || username.length < 2) return null;
  try {
    const res = await fetch(`/.netlify/functions/roblox-resolve/${encodeURIComponent(username)}`);
    if(!res.ok) return null;
    const data = await res.json();
    if(data && data.userId) return { id: data.userId, name: username };
    return null;
  } catch(e) {
    console.warn('Roblox resolve proxy error:', e.message);
    return null;
  }
}

function loadRobloxImages(userId, usuario){
  const img = $('rbx-avatar-img');
  const ph = $('rbx-avatar-placeholder');
  const info = $('rbx-info');
  const nameEl = $('rbx-display-name');
  const idEl = $('rbx-display-id');

  if(nameEl) nameEl.textContent = usuario;
  if(idEl) idEl.textContent = 'ID: ' + userId;
  if(info) info.style.display = 'flex';

  if(!img) return;

  const proxyUrl = userId
    ? `/.netlify/functions/roblox-avatar/${userId}`
    : null;

  if (proxyUrl) {
    fetch(proxyUrl)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(data => {
        if (data.url) {
          img.onload = () => {
            img.style.display = 'block';
            if(ph) ph.style.display = 'none';
          };
          img.onerror = () => { if(ph) ph.style.display = 'flex'; };
          img.src = data.url;
          if(typeof LicenseCanvas !== 'undefined' && LicenseCanvas) LicenseCanvas.setAvatarUrl(data.url);
        }
      })
      .catch(() => { if(ph) ph.style.display = 'flex'; });
  } else {
    if(ph) ph.style.display = 'flex';
  }
}

function updateRobloxPreview(){
  const usuario = val('f-rbx-usuario');
  const rbxId   = val('f-rbx-id');

  const img = $('rbx-avatar-img');
  const ph = $('rbx-avatar-placeholder');
  const info = $('rbx-info');
  const nameEl = $('rbx-display-name');
  const idEl = $('rbx-display-id');
  const noteText = $('rbx-note-text');

  function resetPreview(msg){
    if(noteText) noteText.textContent = msg;
    if(img) img.style.display = 'none';
    if(ph) ph.style.display = 'flex';
    if(info) info.style.display = 'none';
    if(nameEl) nameEl.textContent = '—';
    if(idEl) idEl.textContent = 'ID: —';
    if(typeof LicenseCanvas !== 'undefined' && LicenseCanvas) LicenseCanvas.setAvatarUrl(null);
  }

  if(!usuario && !rbxId){
    resetPreview('Escribe un usuario de Roblox para ver su perfil.');
    return;
  }

  if(rbxId && /^\d+$/.test(rbxId)){
    loadRobloxImages(rbxId, usuario || 'Usuario');
    if(noteText) noteText.textContent = 'Foto cargada desde el ID ingresado.';
    return;
  }

  if(usuario){
    if(noteText) noteText.textContent = 'Buscando usuario…';
    clearTimeout(rbxFetchTimer);
    rbxFetchTimer = setTimeout(async () => {
      const userData = await hrpFetchRobloxUser(usuario);
      if(userData){
        loadRobloxImages(userData.id, userData.name || usuario);
        if(noteText) noteText.textContent = 'Foto de perfil cargada.';
      } else {
        resetPreview('No se encontró el usuario.');
      }
    }, 500);
  }
}

/* ============================= */
/* 🔥 LIVE PREVIEW — PASO 3 (FIRMA) */
/* ============================= */

function updateSignaturePreview(){
  const ph = $('sig-ph');
  if(!ph) return;
  if(WIZ.signature){
    ph.innerHTML = `<img src="${WIZ.signature}" alt="Firma" style="max-width:90%;max-height:90%;">`;
  } else {
    ph.innerHTML = `<span>Tu firma aparecerá aquí</span>`;
  }
}

/* ============================= */
/* 🔥 MASTER PREVIEW UPDATE */
/* ============================= */

function updatePreview(){
  updateRobloxPreview();
  updateSignaturePreview();
  if(typeof LicenseCanvas !== 'undefined' && LicenseCanvas){
    LicenseCanvas.render();
    const finalImg = $('final-license-img');
    if(finalImg){
      try{
        finalImg.src = LicenseCanvas.toDataURL();
        finalImg.style.display = 'block';
      }catch(e){
        console.error('[Wizard] ERROR al generar el preview final (toDataURL):', e.message);
        finalImg.style.display = 'none';
      }
    }
  }
}

function persistFields(){
  try {
    WIZ.fields = WIZ.fields || {};
    document.querySelectorAll('[id^="f-"]').forEach(el => {
      WIZ.fields[el.id] = el.type === 'checkbox' ? !!el.checked : (el.value != null ? el.value : '');
    });
    saveWizard();
  } catch(e) {}
}

function restoreFields(){
  if(!WIZ.fields) return;
  document.querySelectorAll('[id^="f-"]').forEach(el => {
    if(Object.prototype.hasOwnProperty.call(WIZ.fields, el.id)){
      if(el.type === 'checkbox') el.checked = !!WIZ.fields[el.id];
      else el.value = WIZ.fields[el.id] == null ? '' : String(WIZ.fields[el.id]);
    }
  });
}

function onFieldChange(){
  persistFields();
  updatePreview();
}

document.addEventListener('input', onFieldChange);
document.addEventListener('change', onFieldChange);

/* ============================= */
/* 🔵 VALIDACIÓN */
/* ============================= */

function markField(name, invalid){
  const wrap = document.querySelector(`.field[data-field="${name}"]`);
  wrap?.classList.toggle('invalid', invalid);
}

function validateStep1(){
  let ok = true;
  ['nombres','apellidos','dob','altura','peso','direccion','ciudad','zip'].forEach(name => {
    const input = $('f-' + name);
    const empty = !input || !input.value.trim();
    markField(name, empty);
    if(empty) ok = false;
  });
  ['sexo','sangre','ojos','cabello','nacionalidad','estado'].forEach(name => {
    const sel = $('f-' + name);
    const empty = !sel || !sel.value;
    markField(name, empty);
    if(empty) ok = false;
  });
  const dob = val('f-dob');
  if(dob && !/^\d{1,2}[\/.\-\s]\d{1,2}[\/.\-\s]\d{4}$/.test(dob)){
    markField('dob', true);
    ok = false;
  }
  const altura = val('f-altura');
  if(altura && (!/^\d+$/.test(altura) || +altura < 50 || +altura > 300)){
    markField('altura', true);
    ok = false;
  }
  const peso = val('f-peso');
  if(peso && (!/^\d+$/.test(peso) || +peso < 20 || +peso > 400)){
    markField('peso', true);
    ok = false;
  }
  const zip = val('f-zip');
  if(zip && !/^\d{3,10}$/.test(zip)){
    markField('zip', true);
    ok = false;
  }
  return ok;
}

function validateStep2(){
  let ok = true;
  ['rbx-usuario','rbx-id'].forEach(name => {
    const input = $('f-' + name);
    const empty = !input || !input.value.trim();
    markField(name, empty);
    if(empty) ok = false;
  });
  const idVal = val('f-rbx-id');
  if(idVal && !/^\d+$/.test(idVal)){
    markField('rbx-id', true);
    ok = false;
  }
  const anio = val('f-rbx-anio');
  if(anio && !(/^\d{4}$/.test(anio) && +anio >= 1900 && +anio <= new Date().getFullYear())){
    markField('rbx-anio', true);
    ok = false;
  }
  return ok;
}

function validateStep3(){
  if(!WIZ.signature){
    showToast('Dibuja tu firma antes de continuar', true);
    return false;
  }
  if(!$('f-acepto')?.checked){
    showToast('Debes aceptar las normas para continuar', true);
    return false;
  }
  return true;
}

/* ============================= */
/* 🔵 TOAST */
/* ============================= */

let toastTimer = null;
function showToast(msg, isError){
  const toast = $('toast');
  const text  = $('toast-text');
  if(!toast || !text) return;
  text.textContent = msg;
  toast.style.borderColor = isError ? 'var(--accent-red)' : '';
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

/* ============================= */
/* 🔵 FIRMA (CANVAS) */
/* ============================= */

let sigCtx = null;
let sigDrawing = false;
let sigHasContent = false;

function setupSignaturePad(){
  const canvas = $('sig-canvas');
  if(!canvas || canvas.dataset.ready === '1') return;

  const wrap = canvas.parentElement;
  const rect = wrap.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  sigCtx = canvas.getContext('2d');
  sigCtx.strokeStyle = '#111';
  sigCtx.lineWidth = 2.2;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';

  function pos(e){
    const r = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return { x: cx, y: cy };
  }

  function start(e){
    e.preventDefault();
    sigDrawing = true;
    const p = pos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(p.x, p.y);
    $('sig-hint') && ($('sig-hint').style.display = 'none');
  }
  function move(e){
    if(!sigDrawing) return;
    e.preventDefault();
    const p = pos(e);
    sigCtx.lineTo(p.x, p.y);
    sigCtx.stroke();
    sigHasContent = true;
  }
  function end(){
    if(!sigDrawing) return;
    sigDrawing = false;
    WIZ.signature = sigHasContent ? canvas.toDataURL('image/png') : null;
    saveWizard();
    updateSignaturePreview();
    if(typeof LicenseCanvas !== 'undefined' && LicenseCanvas) LicenseCanvas.setSignature(WIZ.signature);
  }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);

  canvas.dataset.ready = '1';

  if(WIZ.signature){
    const img = new Image();
    img.onload = () => {
      sigCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
      sigHasContent = true;
      $('sig-hint') && ($('sig-hint').style.display = 'none');
    };
    img.src = WIZ.signature;
    if(typeof LicenseCanvas !== 'undefined' && LicenseCanvas) LicenseCanvas.setSignature(WIZ.signature);
  }
}

function resizeSigCanvas(){
  const canvas = $('sig-canvas');
  if(!canvas || !sigCtx || canvas.dataset.ready !== '1') return;
  const wrap = canvas.parentElement;
  const rect = wrap.getBoundingClientRect();
  if(!rect.width || !rect.height) return;
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  sigHasContent = false;
  if(WIZ.signature){
    const img = new Image();
    img.onload = () => {
      sigCtx.clearRect(0, 0, canvas.width, canvas.height);
      sigCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
      sigHasContent = true;
      $('sig-hint') && ($('sig-hint').style.display = 'none');
    };
    img.src = WIZ.signature;
  } else {
    sigCtx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

window.addEventListener('resize', resizeSigCanvas);
window.addEventListener('orientationchange', resizeSigCanvas);

$('btn-sig-clear')?.addEventListener('click', () => {
  const canvas = $('sig-canvas');
  if(canvas && sigCtx){
    sigCtx.clearRect(0, 0, canvas.width, canvas.height);
  }
  sigHasContent = false;
  WIZ.signature = null;
  saveWizard();
  $('sig-hint') && ($('sig-hint').style.display = 'flex');
  updateSignaturePreview();
  if(typeof LicenseCanvas !== 'undefined' && LicenseCanvas) LicenseCanvas.setSignature(null);
});

/* ============================= */
/* 🔵 RESUMEN (PASO 4) */
/* ============================= */

function buildSummary(){
  const wrap = $('summary-wrap');
  if(!wrap) return;

  const rows = [
    ['Nombres', val('f-nombres')],
    ['Apellidos', val('f-apellidos')],
    ['Fecha de nacimiento', val('f-dob')],
    ['Sexo', val('f-sexo')],
    ['Tipo de sangre', val('f-sangre')],
    ['Estatura', val('f-altura') ? val('f-altura') + ' cm' : ''],
    ['Peso', val('f-peso') ? val('f-peso') + ' kg' : ''],
    ['Color de ojos', val('f-ojos')],
    ['Color de cabello', val('f-cabello')],
    ['Nacionalidad', val('f-nacionalidad')],
    ['Dirección', val('f-direccion')],
    ['Ciudad', val('f-ciudad')],
    ['Estado', val('f-estado')],
    ['Código Postal', val('f-zip')],
    ['Usuario Roblox', val('f-rbx-usuario') ? '@' + val('f-rbx-usuario') : ''],
    ['ID Roblox', val('f-rbx-id')],
    ['Cuenta creada en', val('f-rbx-anio')],
  ];

  wrap.innerHTML = `
    <div class="grid2">
      ${rows.map(([label, value]) => `
        <div class="field">
          <label>${label}</label>
          <div style="font-size:13.5px;color:#fff;font-weight:600;">${value || '—'}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function buildFinalLicense(){
  const slot = $('final-license-slot');
  if(!slot) return;

  const sigHtml = WIZ.signature
    ? `<img src="${WIZ.signature}" style="max-height:40px;max-width:160px;">`
    : `<span style="color:var(--text-mute);font-size:11px;">Sin firma</span>`;

  slot.innerHTML = `
    <div class="card" data-license>
      <div class="card-content">
        <div class="license-data">
          <div><b>Nombres:</b> <span>${val('f-nombres') || '—'}</span></div>
          <div><b>Apellidos:</b> <span>${val('f-apellidos') || '—'}</span></div>
          <div><b>Fecha:</b> <span>${val('f-dob') || '—'}</span></div>
          <div><b>Sexo:</b> <span>${val('f-sexo') || '—'}</span></div>
          <div><b>Estatura:</b> <span>${val('f-altura') ? val('f-altura') + ' cm' : '—'}</span></div>
          <div><b>Ojos:</b> <span>${val('f-ojos') || '—'}</span></div>
        </div>
        <div style="margin-top:10px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;color:var(--text-mute);">Firma:</span>
          ${sigHtml}
        </div>
      </div>
    </div>
  `;
}

/* ============================= */
/* 🔵 DISCORD WEBHOOK */
/* ============================= */

const WEBHOOK_URL = "https://discord.com/api/webhooks/1522262318363181086/VnGPkai2LSZm7SVGvnJNGOREDG6gEdyRo2AyDRv1UvKSTGele_PIxN1cwoxMdTCbCGaD";

async function sendWebhook(payload){
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch(e) {
    console.error("Webhook error:", e);
  }
}

/* ============================= */
/* 🔵 CREAR PERSONAJE (FINAL) */
/* ============================= */

async function createCharacter(){
  const id = 'HRP-' + Math.floor(100000 + Math.random() * 900000);
  const session = hrpGetSession();
  const charName = (val('f-nombres') + ' ' + val('f-apellidos')).trim();

  const btn = $('btn-next');
  if(btn){
    btn.disabled = true;
    btn.textContent = 'Creando...';
  }

  try {
    const client = hrpGetSb();
    if(!client){
      throw new Error("No se pudo conectar con la base de datos");
    }

    await client.from('characters').insert({
      id: id,
      nombres: val('f-nombres'),
      apellidos: val('f-apellidos'),
      dob: val('f-dob'),
      sexo: val('f-sexo'),
      sangre: val('f-sangre'),
      altura: val('f-altura'),
      peso: val('f-peso'),
      ojos: val('f-ojos'),
      cabello: val('f-cabello'),
      nacionalidad: val('f-nacionalidad'),
      direccion: val('f-direccion'),
      ciudad: val('f-ciudad'),
      estado: val('f-estado'),
      zip: val('f-zip'),
      roblox: val('f-rbx-usuario'),
      roblox_id: val('f-rbx-id'),
      user_discord: session?.id || '',
    });

    await sendWebhook({
      embeds: [{
        title: "Personaje Creado",
        color: 0x00ff00,
        fields: [
          { name: "ID", value: `\`${id}\``, inline: true },
          { name: "Nombre", value: charName, inline: true },
          { name: "Discord ID", value: `\`${session?.id || "—"}\``, inline: true },
          { name: "Usuario", value: session?.username || "Desconocido", inline: true },
          { name: "Roblox", value: val('f-rbx-usuario') || "—", inline: true },
        ],
        timestamp: new Date().toISOString(),
      }]
    });

    document.querySelectorAll('.step-pane[data-step]').forEach(p => p.style.display = 'none');
    const success = document.querySelector('.step-pane[data-step="success"]');
    if(success) success.style.display = 'block';
    $('success-id') && ($('success-id').textContent = id);

    $('actions-row') && ($('actions-row').style.display = 'none');
    $('step-title') && ($('step-title').textContent = 'Personaje Creado');
    $('step-sub') && ($('step-sub').textContent = '¡Listo! Tu personaje fue creado exitosamente.');

    document.querySelectorAll('.prev-pane[data-step]').forEach(p => p.style.display = 'none');
    const finalPrev = document.querySelector('.prev-pane[data-step="4"]');
    if(finalPrev) finalPrev.style.display = 'block';

    localStorage.removeItem('hrp_wizard_data');

    hrpInitRewardUI();

  } catch(e) {
    console.error('Error creating character:', e);

    await sendWebhook({
      embeds: [{
        title: "Error al crear personaje",
        color: 0xff0000,
        fields: [
          { name: "Discord", value: `<@${session?.id}>`, inline: true },
          { name: "Usuario", value: session?.username || "Desconocido", inline: true },
          { name: "Nombre intentado", value: charName || "—", inline: true },
          { name: "Error", value: `\`\`\`${e.message || "Error desconocido"}\`\`\`` },
        ],
        timestamp: new Date().toISOString(),
      }]
    });

    showToast('Error: ' + (e.message || 'Error desconocido'), true);
  } finally {
    if(btn){
      btn.disabled = false;
      btn.textContent = 'Crear Personaje';
    }
  }
}

/* ============================= */
/* 🔵 RENDER */
/* ============================= */

const STEP_TITLES = {
  1: ['Crear Personaje', 'Paso 1 de 4 — Datos Básicos'],
  2: ['Crear Personaje', 'Paso 2 de 4 — Cuenta de Roblox'],
  3: ['Crear Personaje', 'Paso 3 de 4 — Firma Digital'],
  4: ['Crear Personaje', 'Paso 4 de 4 — Resumen'],
};

function render(){

  document.querySelectorAll('.step-pane[data-step]').forEach(p => {
    if(p.dataset.step === 'success') return;
    p.style.display = (p.dataset.step === String(WIZ.step)) ? 'block' : 'none';
  });

  document.querySelectorAll('.prev-pane[data-step]').forEach(p => {
    p.style.display = (p.dataset.step === String(WIZ.step)) ? 'block' : 'none';
  });

  document.querySelectorAll('.step[data-go]').forEach(stepEl => {
    const n = Number(stepEl.dataset.go);
    stepEl.classList.toggle('done', n < WIZ.step);
    stepEl.classList.toggle('current', n === WIZ.step);
    stepEl.classList.toggle('clickable', n <= WIZ.step);
  });
  document.querySelectorAll('.step-line[data-line]').forEach(line => {
    const n = Number(line.dataset.line);
    line.classList.toggle('done', n < WIZ.step);
  });

  if(STEP_TITLES[WIZ.step]){
    $('step-title') && ($('step-title').textContent = STEP_TITLES[WIZ.step][0]);
    $('step-sub') && ($('step-sub').textContent = STEP_TITLES[WIZ.step][1]);
  }

  $('btn-back') && ($('btn-back').style.display = WIZ.step === 1 ? 'none' : 'inline-flex');
  $('btn-next') && ($('btn-next').textContent = WIZ.step === TOTAL_STEPS ? 'Crear Personaje' : 'Siguiente →');

  if(WIZ.step === 3){
    setupSignaturePad();
  }
  if(WIZ.step === 4){
    buildSummary();
    buildFinalLicense();
  }

  updatePreview();
}

/* permite saltar a un paso ya visitado haciendo click en el stepper */
document.querySelectorAll('.step[data-go]').forEach(stepEl => {
  stepEl.addEventListener('click', () => {
    const n = Number(stepEl.dataset.go);
    if(n <= WIZ.step){
      WIZ.step = n;
      saveWizard();
      render();
    }
  });
});

if(typeof LicenseCanvas !== 'undefined' && LicenseCanvas){
  LicenseCanvas.init('license-canvas');
  console.log('[Wizard] LicenseCanvas inicializado correctamente');
} else {
  console.error('[Wizard] ERROR: license-canvas.js no cargó — LicenseCanvas no existe');
}

$('btn-download')?.addEventListener('click', () => {
  if(typeof LicenseCanvas === 'undefined' || !LicenseCanvas) return;
  try{
    const a = document.createElement('a');
    a.download = 'licencia-houston-rp.png';
    a.href = LicenseCanvas.toDataURL();
    a.click();
  }catch(e){
    console.error('[Wizard] ERROR al descargar la licencia (toDataURL):', e.message);
    showToast('No se pudo descargar la licencia', true);
  }
});

/* ============================= */
/* 🔵 BOTONES */
/* ============================= */

$('btn-back')?.addEventListener('click', () => {
  if(WIZ.step > 1){
    WIZ.step--;
    saveWizard();
    render();
  }
});

$('btn-next')?.addEventListener('click', () => {
  if(WIZ.step === 1 && !validateStep1()){
    showToast('Completa los campos obligatorios', true);
    return;
  }
  if(WIZ.step === 2 && !validateStep2()){
    showToast('Verifica tu usuario e ID de Roblox', true);
    return;
  }
  if(WIZ.step === 3 && !validateStep3()){
    return; // el toast ya se muestra dentro de validateStep3
  }

  if(WIZ.step < TOTAL_STEPS){
    WIZ.step++;
    saveWizard();
    render();
  } else {
    if(!validateStep1()){
      WIZ.step = 1; saveWizard(); render(); showToast('Completa los campos obligatorios', true); return;
    }
    if(!validateStep2()){
      WIZ.step = 2; saveWizard(); render(); showToast('Verifica tu usuario e ID de Roblox', true); return;
    }
    if(!validateStep3()){
      return; // el toast ya se muestra dentro de validateStep3
    }
    createCharacter();
  }
});

/* ============================= */
/* 🔵 CHECK EXISTING CHARACTER */
/* ============================= */

async function hrpCheckExistingCharacter(discordId) {
  if (!discordId) return null;
  try {
    const data = await supaSingle("characters", "id,nombres,apellidos,user_discord,created_at",
      { user_discord: `eq.${discordId}`, order: "created_at.desc" }
    );
    return data || null;
  } catch {
    return null;
  }
}

/* ============================= */
/* 🔵 RECOMPENSA DE BIENVENIDA ($300) */
/* ============================= */

const WELCOME_REWARD = { amount: 300, reason: "Recompensa creacion de personaje" };

async function hrpGetWelcomeRewardStatus() {
  const session = hrpGetSession();
  if (!session || !session.id) return null;
  try {
    const data = await supaSingle("economy", "welcome_reward_claimed,balance", { discord_id: `eq.${session.id}` });
    if (!data) return { claimed: false, balance: 0 };
    return { claimed: !!data.welcome_reward_claimed, balance: data.balance };
  } catch (e) {
    console.error('Reward status error:', e);
    return null;
  }
}

function hrpRewardButtons() {
  return [$('btn-claim-reward'), $('btn-claim-reward-exists')].filter(Boolean);
}

function hrpRewardStatusEls() {
  return [$('reward-status'), $('reward-status-exists')].filter(Boolean);
}

async function hrpRefreshWalletBalance() {
  const session = hrpGetSession();
  if (!session || !session.id) return;
  try {
    if (typeof hrpGetBalance !== 'function') return;
    const bal = await hrpGetBalance(session.id);
    const el = document.getElementById('hrp-wallet-amount');
    if (el && typeof hrpFormatBalance === 'function') el.textContent = hrpFormatBalance(bal);
  } catch (_) { /* silencioso */ }
}

function hrpSetRewardUI(claimed, text, kind) {
  hrpRewardButtons().forEach(btn => {
    btn.disabled = claimed;
    if (claimed) btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg> Reclamado';
    else btn.textContent = 'Reclamar $300';
  });
  hrpRewardStatusEls().forEach(el => {
    el.textContent = text || '';
    el.classList.remove('ok', 'err', 'ready');
    if (kind) el.classList.add(kind);
  });
}

async function hrpClaimWelcomeReward() {
  const session = hrpGetSession();
  if (!session || !session.id) return;

  const btn = hrpRewardButtons()[0];
  if (!btn || btn.disabled) return;

  const prevHtml = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Reclamando...';

  try {
    if (typeof hrpRpc !== 'function') throw new Error('Sistema de economía no disponible');
    const res = await hrpRpc('hrp_claim_welcome_reward', { p_discord_id: String(session.id) });

    if (res && res.status === 'claimed') {
      hrpSetRewardUI(true, '¡Recompensa reclamada! +$' + WELCOME_REWARD.amount + ' agregados a tu cuenta.', 'ok');
      showToast('🎉 Reclamaste tu recompensa de $' + WELCOME_REWARD.amount + '!', false);
      hrpRefreshWalletBalance();
    } else if (res && res.status === 'already_claimed') {
      hrpSetRewardUI(true, 'Ya reclamaste tu recompensa de bienvenida.', 'ok');
    } else {
      btn.disabled = false;
      btn.innerHTML = prevHtml;
      hrpSetRewardUI(false, 'No se pudo reclamar. Volvé a intentarlo.', 'err');
      showToast('No se pudo reclamar la recompensa.', true);
    }
  } catch (e) {
    console.error('Reward claim error:', e);
    btn.disabled = false;
    btn.innerHTML = prevHtml;
    hrpSetRewardUI(false, 'Error al reclamar. Volvé a intentarlo.', 'err');
    showToast('Error al reclamar la recompensa.', true);
  }
}

async function hrpInitRewardUI() {
  const status = await hrpGetWelcomeRewardStatus();
  if (!status) {
    hrpSetRewardUI(false, 'No se pudo verificar la recompensa.', 'err');
    return;
  }
  if (status.claimed) {
    hrpSetRewardUI(true, 'Ya reclamaste tu recompensa de bienvenida.', 'ok');
  } else {
    const btn = hrpRewardButtons()[0];
    if (btn) btn.disabled = false;
    const gotBtn = hrpRewardButtons().length > 0;
    hrpStatusText('Reclamá tu recompensa de $' + WELCOME_REWARD.amount + '.', gotBtn ? 'ready' : null);
  }
  hrpRefreshWalletBalance();
}

function hrpStatusText(text, kind) {
  hrpRewardStatusEls().forEach(el => {
    el.textContent = text || '';
    el.classList.remove('ok', 'err', 'ready');
    if (kind) el.classList.add(kind);
  });
}

/* ============================= */
/* 🔵 INIT */
/* ============================= */

(async function initWizard() {
  const session = hrpGetSession();
  if (!session || !session.id) { restoreFields(); render(); return; }

  const existing = await hrpCheckExistingCharacter(session.id);
  if (existing) {
    const topbar = document.querySelector('.topbar');
    const content = document.querySelector('.content');
    const slot = document.getElementById('exists-slot');
    if (topbar) topbar.style.display = 'none';
    if (content) content.style.display = 'none';
    if (slot) {
      const nameEl = document.getElementById('exists-char-name');
      const idEl = document.getElementById('exists-char-id');
      if (nameEl) nameEl.textContent = existing.nombres + ' ' + existing.apellidos;
      if (idEl) idEl.textContent = existing.id;
      slot.classList.add('visible');
    }
    hrpInitRewardUI();
    return;
  }

  restoreFields();
  render();
})();