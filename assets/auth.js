// =============================
// 🔵 DISCORD CONFIG
// =============================
const discordClientId = "1545692856583454771";
const discordRedirectUri = (() => {
  try {
    return `${window.location.origin}/index.html`;
  } catch {
    return "https://houstoncommunity.netlify.app/index.html";
  }
})();
const discordGuildId = "1285846827463344209";
const discordPoliceRoleId = "1431255106212335686";
const discordManageRoleId = "1502940172348690482";
const discordDevRoleId = "1425697670495862844";
const discordFoundationRoleId = "1430728225423884419";
const discordDispatchRoleId = "1502940318092366056";

// =============================
// 🔵 EJECUTOR DE CÁRCEL (ER:LC)
// =============================
// URL del servidor con IP fija que ejecuta los comandos :jail (server.js).
// Vacío = intenta la función de Netlify. Ej: "https://jail.tu-dominio.com/api/erlc/jail"
const HRP_JAIL_EXECUTOR_URL = "http://73.6.39.165:3001";

// Envía a un jugador a la cárcel de ER:LC (usa el ejecutor configurado o la función de Netlify).
// `months` se interpreta como minutos en ER:LC (máximo 60).
async function hrpSendToJail(username, months) {
  const payload = { username, months };
  const endpoints = [];
  if (HRP_JAIL_EXECUTOR_URL) {
    endpoints.push(/\/erlc\/jail$/.test(HRP_JAIL_EXECUTOR_URL) ? HRP_JAIL_EXECUTOR_URL : `${HRP_JAIL_EXECUTOR_URL}/api/erlc/jail`);
  }
  endpoints.push(`${hrpGetSiteOrigin()}/.netlify/functions/erlc-jail`);
  endpoints.push('/.netlify/functions/erlc-jail');

  let lastErr = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch (_) {}
      if (!res.ok || data.error) {
        lastErr = new Error(data.error || text || `HTTP ${res.status}`);
        continue;
      }
      return data;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('No se pudo ejecutar la orden de cárcel');
}

// =============================
// 🔵 DISCORD WEBHOOKS
// =============================
const HRP_DISCORD_WEBHOOKS = {
  incident: "https://discord.com/api/webhooks/1466065185088471273/l4G1ClfOUAi8uFEhxbMVkcgIjOhMSDpvpk8PMqCHeHay25gIMtWLWMzNhxrmh-DLYD4r",
  character: "https://discord.com/api/webhooks/1522262318363181086/VnGPkai2LSZm7SVGvnJNGOREDG6gEdyRo2AyDRv1UvKSTGele_PIxN1cwoxMdTCbCGaD",
  arrest: "https://discord.com/api/webhooks/1524885469022912642/-YPmfTUQ8h2_VvF_E1hwXc79wZ0pyn8m6n16X1DVTxKdnJ_b0PQq19rTKk_4-SCrZSmP",
  fine: "https://discord.com/api/webhooks/1520733812001210458/85wg66oMWahaLU9MGc-p__ebvrqPv90-rXynmxTILUtbb1Yf-UuFu4Jyc0ENpSBmWVn-",
  license: "https://discord.com/api/webhooks/1466065185088471273/l4G1ClfOUAi8uFEhxbMVkcgIjOhMSDpvpk8PMqCHeHay25gIMtWLWMzNhxrmh-DLYD4r",
  security: "https://discordapp.com/api/webhooks/1531348144724639748/O3oIhfj7aM-XwLUxW8cIjy8n_eKeVFnAtTkvGMh6qdMDdWLD7Ajf1ZgkpKOGEE0dD4Eh",
};

function hrpGetSiteOrigin() {
  try {
    const origin = window.location.origin;
    if (origin && origin !== "null") return origin;
  } catch (_) {}
  return "https://houstoncommunity.netlify.app";
}

async function hrpSendDiscordWebhook(webhookUrl, payload) {
  if (!webhookUrl) return null;
  const proxyUrl = `${hrpGetSiteOrigin()}/.netlify/functions/discord-webhook?webhook=${encodeURIComponent(webhookUrl)}`;
  try {
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.ok ? response : null;
  } catch (err) {
    console.warn("Discord webhook failed:", err);
    return null;
  }
}

function hrpCreateDiscordEmbed({ title, description = "", color = 0x1e6fff, fields = [], footer = "Houston RP — Police Department", timestamp = new Date().toISOString() }) {
  return {
    title,
    description,
    color,
    fields,
    footer: { text: footer },
    timestamp,
  };
}

// =============================
// 🔵 SUPABASE CONFIG
// =============================
const supabaseUrl = "https://qqgtroxrkccftlrpqwsk.supabase.co";
const supabaseKey = "sb_publishable_ZTcgdobN4BxLtxo59UUCuA_raeLls6H";

// =============================
// 🔵 SUPABASE REST CLIENT
// =============================
function supaFetch(method, table, options = {}) {
  const { select, filters, body, single } = options;
  let url = `${supabaseUrl}/rest/v1/${table}`;
  const params = new URLSearchParams();

  if (select) params.set("select", select);
  if (filters) {
    for (const [col, val] of Object.entries(filters)) {
      params.append(col, val);
    }
  }

  const qs = params.toString();
  if (qs) url += "?" + qs;

  const headers = {
    "apikey": supabaseKey,
    "Authorization": `Bearer ${supabaseKey}`,
    "Content-Type": "application/json",
  };

  if (method === "POST" || method === "PATCH") headers["Prefer"] = "return=representation";

  return fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async res => {
    if ((res.status === 404 || res.status === 406) && method === "GET") {
      return single ? null : [];
    }
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Supabase ${method} ${table}: ${res.status} ${text}`);
      err.code = res.status;
      err.details = text;
      throw err;
    }
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return single ? null : [];
    const data = JSON.parse(text);
    if (single) {
      return Array.isArray(data) ? (data[0] || null) : data;
    }
    return data;
  });
}

function supaSelect(table, select, filters) {
  return supaFetch("GET", table, { select, filters });
}

function supaSingle(table, select, filters) {
  return supaFetch("GET", table, { select, filters, single: true });
}

function supaInsert(table, body, select = "*") {
  return supaFetch("POST", table, { body, select });
}

function supaUpdate(table, body, filters) {
  return supaFetch("PATCH", table, { body, filters });
}

function supaDelete(table, filters) {
  return supaFetch("DELETE", table, { filters });
}

function supaUpsert(table, body, onConflict) {
  let url = `${supabaseUrl}/rest/v1/${table}`;
  if (onConflict) url += `?on_conflict=${onConflict}`;
  const headers = {
    "apikey": supabaseKey,
    "Authorization": `Bearer ${supabaseKey}`,
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=representation"
  };
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  }).then(async res => {
    if (!res.ok) { const t = await res.text(); throw new Error(`Supabase UPSERT ${table}: ${res.status} ${t}`); }
    if (res.status === 204) return null;
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  });
}

function hrpClearSession() {
  hrp_memory_session = null;
  sessionStorage.removeItem('hrp_oauth_processed');
  sessionStorage.removeItem('hrp_last_index_redirect');
  if (!hrp_ls_available) return;
  const keysToKeep = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('hrp_bank_') || key.startsWith('hrp_salary_'))) {
      keysToKeep.push(key);
    }
  }
  const preserved = {};
  for (const k of keysToKeep) {
    preserved[k] = localStorage.getItem(k);
  }
  localStorage.clear();
  for (const [k, v] of Object.entries(preserved)) {
    localStorage.setItem(k, v);
  }
}

function hrpForceReauth() {
  hrp_memory_session = null;
  sessionStorage.removeItem('hrp_oauth_processed');
  if (hrp_ls_available) { try { localStorage.removeItem('hrp_user'); } catch(e) {} }
  hrpClearGuildMemberCache();
  // Limpia también los caches de acceso y departamentos para que el reauth no arrastre
  // permisos/roles viejos de una sesión anterior (máx. 24h de TTL).
  if (hrp_ls_available) {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('hrp_access_') === 0) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
      localStorage.removeItem('hrp_departments');
      localStorage.removeItem('hrp_selected_dept');
    } catch (_) {}
  }
  const currentPath = window.location.pathname.replace(/^\/+/, '') || 'dashboard.html';
  if (hrp_ls_available) { try { localStorage.setItem('hrp_redirect', currentPath); } catch(e) {} }
  const baseUrl = window.location.origin + '/';
  window.location.href = hrpBuildDiscordAuthUrl();
}

// =============================
// 🔵 CHECK CONFIG
// =============================
function hrpIsConfigured() {
  return discordClientId && discordClientId.length > 10;
}

// =============================
// 🔵 DISCORD LOGIN URL
// =============================
function hrpBuildDiscordAuthUrl() {
  return (
    `https://discord.com/oauth2/authorize?client_id=${discordClientId}` +
    `&redirect_uri=${encodeURIComponent(discordRedirectUri)}` +
    `&response_type=token` +
    `&scope=identify%20guilds%20guilds.members.read`
  );
}

// =============================
// 🔵 SESSION
// =============================
var hrp_memory_session = null;

function hrpIsLocalStorageAvailable() {
  try {
    var test = '__hrp_ls_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (_) { return false; }
}

var hrp_ls_available = hrpIsLocalStorageAvailable();

function hrpStartSession(user, token) {
  if (token) user._token = token;
  hrp_memory_session = user;
  if (hrp_ls_available) {
    try { localStorage.setItem("hrp_user", JSON.stringify(user)); }
    catch (e) { console.warn("localStorage set failed (private mode?):", e.message); }
  }
}

function hrpGetSession() {
  if (hrp_memory_session && hrp_memory_session.id) return hrp_memory_session;
  if (hrp_ls_available) {
    try { return JSON.parse(localStorage.getItem("hrp_user")); }
    catch { return null; }
  }
  return null;
}

function hrpRequireSession() {
  const session = hrpGetSession();
  if (session && session.id) return session;

  // Anti-redirect-loop guard: prevent rapid successive redirects to index on mobile
  var now = Date.now();
  var lastRedirect = parseInt(sessionStorage.getItem('hrp_last_index_redirect') || '0');
  if (now - lastRedirect < 2000) {
    // Don't redirect again within 2 seconds — likely a loop
    return null;
  }
  sessionStorage.setItem('hrp_last_index_redirect', String(now));

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  if (currentPage !== 'index.html') {
    try { localStorage.setItem('hrp_redirect', currentPage); }
    catch (e) { sessionStorage.setItem('hrp_redirect', currentPage); }
  }
  window.location.replace('index.html');
  return null;
}

function hrpNavigateTo(page) {
  if (!page) return;
  const target = String(page).trim();
  if (!target) return;
  const normalized = target.startsWith('/') ? target.slice(1) : target;
  const current = window.location.pathname.split('/').pop() || 'index.html';
  if (normalized === current) return;
  window.location.assign(normalized.endsWith('.html') ? `/${normalized}` : `/${normalized}.html`);
}

function hrpGetToken() {
  const u = hrpGetSession();
  return u?._token || null;
}

// =============================
// 🔵 DISCORD USER FETCH
// =============================
async function hrpGetDiscordUser(token) {
  const res = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return await res.json();
}

// =============================
// 🔵 SUPABASE SAVE
// =============================
async function hrpSaveUser(user) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/users`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        discord_id: user.id,
        username: user.username,
        avatar: user.avatar,
      }),
    });
  } catch (e) {
    console.warn("Save user skipped:", e.message);
  }
}

// =============================
// 🔵 GUILD MEMBERSHIP CHECK
// =============================
async function hrpCheckGuildMembership(token) {
  if (!token) return null; // sin token — no se puede verificar, no invalidar sesión
  try {
    const res = await fetch(`https://discord.com/api/v10/users/@me/guilds/${discordGuildId}/member`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) return 'token_expired';
    if (res.status === 404) return false; // definitivamente NO es miembro del server
    // 429 (rate limit) y 5xx (error del server) son transitorios:
    // tratarlos como desconocido NO invalida la sesión ni bota al usuario.
    if (res.status === 429 || res.status >= 500) return null;
    if (!res.ok) return null; // 403 u otro — no concluyente
    return true;
  } catch (_) {
    return null; // network error — don't invalidate session
  }
}

// =============================
// 🔵 DISCORD CALLBACK FIX (MOBILE-RESILIENT)
// =============================
async function hrpHandleDiscordRedirect() {
  const hash = window.location.hash;
  if (!hash) return false;

  const params = new URLSearchParams(hash.replace("#", ""));
  const token = params.get("access_token");

  if (!token) return false;

  // Anti-loop guard: only skip reprocessing if we ALREADY have a valid session.
  // (Previously it blocked retries after a failed attempt — user got stuck logged out.)
  if (sessionStorage.getItem('hrp_oauth_processed') && hrpGetSession() && hrpGetSession().id) {
    clearHashMobile();
    return false;
  }
  sessionStorage.setItem('hrp_oauth_processed', '1');

  // Clear hash from URL immediately (both methods for mobile compatibility)
  clearHashMobile();

  console.log('[Auth] Callback de Discord recibido, token OK — guardando sesión');

  // Parse fallback user data from OAuth response params
  const fallbackUser = {
    id: params.get("user_id") || params.get("discord_id") || null,
    username: params.get("username") || null,
    global_name: params.get("global_name") || null,
    avatar: params.get("avatar") || null,
    _token: token,
  };

  let user = null;

  // Try to fetch the full Discord user (may fail on mobile network)
  try {
    user = await hrpGetDiscordUser(token);
    if (!user || !user.id) {
      console.warn("Discord user fetch failed, using fallback from OAuth response");
      user = null;
    }
  } catch (err) {
    console.warn("Discord user fetch error (non-critical on mobile):", err.message);
    user = null;
  }

  // If API fetch failed, use fallback data from OAuth response
  if (!user || !user.id) {
    if (fallbackUser.id) {
      user = fallbackUser;
    } else {
      console.error("[Auth] ERROR: no se pudo obtener el usuario de Discord y la respuesta OAuth no trae id.");
      console.error("[Auth] Si el fetch a discord.com/api/users/@me falla, el login no puede completarse.");
      sessionStorage.removeItem('hrp_oauth_processed'); // permitir reintentar
      return false;
    }
  }

  // Save session BEFORE guild membership check — prevents mobile redirect loops
  hrpStartSession(user, token);
  console.log('[Auth] Sesión guardada para', user.username || user.id);

  // Guild membership check is non-blocking on mobile
  let inGuild = null;
  try {
    inGuild = await hrpCheckGuildMembership(token);
  } catch (err) {
    console.warn("Guild membership check failed (non-blocking):", err.message);
    inGuild = null;
  }

  // If guild check explicitly denied, set access cache
  if (inGuild === false || inGuild === 'token_expired') {
    hrpSetAccessCache('guild_denied', true);
  }

  // Save user to Supabase (non-blocking)
  try {
    await hrpSaveUser(user);
  } catch (err) {
    console.warn("Save user skipped (non-critical):", err.message);
  }

  return true;
}

function clearHashMobile() {
  if (history && history.replaceState) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  try { window.location.hash = ''; } catch (_) {}
}

// =============================
// 🔵 DEMO MODE
// =============================
function hrpStartDemoSession() {
  hrpStartSession({ id: "123456", username: "DemoUser", avatar: null });
}

// =============================
// 🔵 SUPABASE CLIENT COMPAT (for wizard.js)
// =============================
function hrpGetSb() {
  const headers = {
    "apikey": supabaseKey,
    "Authorization": `Bearer ${supabaseKey}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };

  return {
    from: (table) => {
      const baseUrl = `${supabaseUrl}/rest/v1/${table}`;
      const buildUrl = (filters) => {
        if (!filters || filters.length === 0) return baseUrl;
        const params = filters.map(f => `${f.col}=${f.op}.${f.val}`).join("&");
        return `${baseUrl}?${params}`;
      };

      return {
        insert: (body) => ({
          then: (resolve, reject) => {
            fetch(baseUrl, { method: "POST", headers, body: JSON.stringify(body) })
              .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(t); }))
              .then(resolve).catch(reject);
          },
        }),
        select: (cols) => {
          let filters = [];
          const chain = {
            eq: (c, v) => { filters.push({ col: c, op: "eq", val: v }); return chain; },
            limit: (n) => { filters.push({ col: "limit", op: "", val: n }); return chain; },
            then: (resolve, reject) => {
              const url = buildUrl(filters);
              const fullUrl = cols ? `${url}&select=${cols}` : url;
              fetch(fullUrl, { method: "GET", headers })
                .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(t); }))
                .then(resolve).catch(reject);
            },
          };
          return chain;
        },
        upsert: (body, opts) => ({
          then: (resolve, reject) => {
            let url = baseUrl;
            if (opts?.onConflict) url += `?on_conflict=${opts.onConflict}`;
            fetch(url, { method: "POST", headers: { ...headers, "Prefer": "resolution=merge-duplicates" }, body: JSON.stringify(body) })
              .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(t); }))
              .then(resolve).catch(reject);
          },
        }),
      };
    },
  };
}

const DEPARTMENTS = { hcso: 'HCSO', hpd: 'HPD', ice: 'ICE', tph: 'TPH', hfd: 'HFD', dot: 'HDOT' };

const DEPARTMENT_ROLES = {
  hpd: "1364729666128314418",
  hcso: "1364729668569137172",
  ice: "1310839129252298802",
  tph: "1310839295988334612",
  hfd: "1414695837258485780",
  dot: "1414695846552801421",
};

let cachedDepartments = null;
let hrpReauthNeeded = false;
let _cachedMember = null;
const ACCESS_CACHE_KEY = 'hrp_access_cache';
const ACCESS_CACHE_TTL = 86400000; // 24 hours — evita que las secciones del sidebar parpadeen/desaparezcan al navegar

function hrpGetCachedDepartments() {
  return cachedDepartments || JSON.parse(localStorage.getItem('hrp_departments') || 'null') || [];
}

function hrpSetCachedDepartments(depts) {
  cachedDepartments = Array.isArray(depts) ? depts : [];
  try { localStorage.setItem('hrp_departments', JSON.stringify(cachedDepartments)); } catch (_) {}
}

function hrpAccessCacheScope() {
  try {
    const u = JSON.parse(localStorage.getItem('hrp_user') || 'null');
    return (u && u.id) ? u.id : 'anon';
  } catch { return 'anon'; }
}

function hrpGetAccessCache(type) {
  try {
    const raw = localStorage.getItem(ACCESS_CACHE_KEY + '_' + hrpAccessCacheScope() + '_' + type);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.ts < ACCESS_CACHE_TTL) return data;
    return null;
  } catch { return null; }
}

function hrpSetAccessCache(type, value) {
  localStorage.setItem(ACCESS_CACHE_KEY + '_' + hrpAccessCacheScope() + '_' + type, JSON.stringify({ v: value, ts: Date.now() }));
}

function depFilter(department) {
  return department ? { department: `eq.${department}` } : {};
}

// =============================
// 🔵 POLICE SHIFT SYSTEM
// =============================
const MAX_SHIFT_SECONDS = 10 * 60 * 60; // 10 horas de servicio por turno (nunca se excede)

async function hrpStartShift(discordId, username, department) {
  try {
    // Nunca crear segundos turnos: si ya existe uno activo/break (p. ej. iniciado
    // en otro dispositivo), se reanuda ese turno en lugar de duplicar horas.
    const existing = await hrpGetActiveShift(discordId);
    if (existing) return existing;

    // Usar el nombre de Discord (apodo del servidor / display name) en lugar
    // del username plano, para que aparezca así en el MDT y en manage-shift.
    let displayName = username;
    try {
      const dn = await hrpGetDisplayName();
      if (dn) displayName = dn;
    } catch (_) {}

    const data = await supaInsert("police_shift_sessions", {
      discord_id: discordId,
      username: displayName,
      status: "active",
      department: department || 'hpd',
      status_code: '10-8',
    });
    return data?.[0] || null;
  } catch (err) {
    console.error("Start shift error:", err);
    return null;
  }
}

async function hrpStartBreak(shiftId) {
  try {
    await supaUpdate("police_shift_sessions", {
      status: "break",
      break_start: new Date().toISOString(),
    }, { id: `eq.${shiftId}` });
    return true;
  } catch (err) {
    console.error("Start break error:", err);
    return false;
  }
}

async function hrpEndBreak(shiftId, breakStart) {
  try {
    const now = new Date();
    const bs = Date.parse(breakStart);
    const breakDuration = Number.isNaN(bs) ? 0 : Math.floor((now - bs) / 1000);

    let current;
    try {
      current = await supaSingle("police_shift_sessions", "break_duration", { id: `eq.${shiftId}` });
    } catch (_) {}

    const totalBreak = (current?.break_duration || 0) + breakDuration;

    await supaUpdate("police_shift_sessions", {
      status: "active",
      break_start: null,
      break_duration: totalBreak,
    }, { id: `eq.${shiftId}` });

    return true;
  } catch (err) {
    console.error("End break error:", err);
    return false;
  }
}

async function hrpEndShift(shiftId, startTime, breakDuration) {
  try {
    const now = Date.now();
    let startMs = Date.parse(startTime);
    let breakSec = breakDuration || 0;

    // Fuente autoritativa: leer la fila real. Los breaks completados viven en
    // break_duration (segundos) y un break en curso en break_start. Sin esto,
    // terminar el turno durante un descanso contaba el descanso como servicio.
    try {
      const row = await supaSingle("police_shift_sessions", "*", { id: `eq.${shiftId}` });
      if (row) {
        if (row.start_time) {
          const s = Date.parse(row.start_time);
          if (!Number.isNaN(s)) startMs = s;
        }
        if (typeof row.break_duration === 'number' && !Number.isNaN(row.break_duration)) {
          breakSec = row.break_duration;
        }
        if (row.status === 'break' && row.break_start) {
          const bs = Date.parse(row.break_start);
          if (!Number.isNaN(bs)) breakSec += Math.max(0, (now - bs) / 1000);
        }
      }
    } catch (_) {}

    const totalMs = Number.isNaN(startMs) ? 0 : Math.max(0, now - startMs);
    const totalSeconds = Math.floor(totalMs / 1000) - Math.floor(breakSec);
    // Tope absoluto: ningún turno puede registrar más de 10 horas de servicio.
    const capped = Math.min(Math.max(0, totalSeconds), MAX_SHIFT_SECONDS);

    await supaUpdate("police_shift_sessions", {
      status: "completed",
      end_time: new Date(now).toISOString(),
      total_seconds: capped,
    }, { id: `eq.${shiftId}` });

    return true;
  } catch (err) {
    console.error("End shift error:", err);
    return false;
  }
}

async function hrpGetActiveShift(discordId) {
  try {
    const data = await supaSelect("police_shift_sessions", "*",
      { discord_id: `eq.${discordId}`, status: `in.(active,break)`, order: "id.desc", limit: "1" }
    );
    return data?.[0] || null;
  } catch (err) {
    if (err.code === 406) return null;
    console.error("Get active shift error:", err);
    return null;
  }
}

async function hrpGetTopHours(department) {
  try {
    const shiftFilter = { status: "eq.completed", total_seconds: "not.is.null", ...depFilter(department) };
    const [shifts, adjustments] = await Promise.all([
      supaSelect("police_shift_sessions", "discord_id, username, total_seconds", shiftFilter
      ).catch(() => []),
      supaSelect("police_hours_adjustments", "discord_id, username, adjustment_seconds", depFilter(department))
        .catch(() => []),
    ]);

    const agg = {};
    for (const row of shifts) {
      if (!agg[row.discord_id]) agg[row.discord_id] = { discord_id: row.discord_id, username: row.username, total_seconds: 0, shifts: 0 };
      agg[row.discord_id].total_seconds += row.total_seconds || 0;
      agg[row.discord_id].shifts += 1;
    }
    for (const row of adjustments) {
      if (!agg[row.discord_id]) agg[row.discord_id] = { discord_id: row.discord_id, username: row.username, total_seconds: 0, shifts: 0 };
      agg[row.discord_id].total_seconds += row.adjustment_seconds || 0;
    }

    return Object.values(agg).sort((a, b) => b.total_seconds - a.total_seconds);
  } catch (err) {
    console.error("Get top hours error:", err);
    return [];
  }
}

async function hrpGetUserShifts(discordId, department) {
  try {
    const filters = { discord_id: `eq.${discordId}`, status: "eq.completed", order: "end_time.desc", limit: "20", ...depFilter(department) };
    const data = await supaSelect("police_shift_sessions", "*", filters);
    return data || [];
  } catch (err) {
    console.error("Get user shifts error:", err);
    return [];
  }
}

async function hrpGetUserAvatars(discordIds) {
  try {
    if (!discordIds || discordIds.length === 0) return {};
    const ids = [...new Set(discordIds.filter(Boolean))];
    if (ids.length === 0) return {};
    const orFilter = `(${ids.map(id => `discord_id.eq.${id}`).join(',')})`;
    const data = await supaSelect("users", "discord_id, avatar", { or: orFilter });
    const map = {};
    for (const row of (data || [])) {
      if (row.discord_id && row.avatar) map[row.discord_id] = row.avatar;
    }
    return map;
  } catch (err) {
    console.error("Get user avatars error:", err);
    return {};
  }
}

// =============================
// 🔵 SHARED GUILD MEMBER FETCH (prevents duplicate Discord API calls)
// =============================
let _memberPromise = null;

async function hrpFetchGuildMember() {
  if (_memberPromise) return _memberPromise;
  _memberPromise = (async () => {
    const token = hrpGetToken();
    if (!token) return null;
    try {
      const res = await fetch(`https://discord.com/api/v10/users/@me/guilds/${discordGuildId}/member`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) return await res.json();
      if (res.status === 401) hrpReauthNeeded = true;
    } catch (_) {}
    // No cachear fallos transitorios: si un error de red/401 pasa, permitir reintentar.
    _memberPromise = null;
    return null;
  })();
  return _memberPromise;
}

function hrpClearGuildMemberCache() {
  _memberPromise = null;
}

// Nombre a mostrar en Discord: apodo del servidor (nick) > nombre global
// (display name) > username. Se usa al iniciar turno para que el MDT y
// manage-shift muestren el nombre tal como aparece en Discord.
async function hrpGetDisplayName() {
  const session = typeof hrpGetSession === 'function' ? hrpGetSession() : null;
  const fallback = (session && (session.display_name || session.global_name || session.username)) || null;
  try {
    const member = await hrpFetchGuildMember();
    if (member) {
      if (member.nick) return member.nick;
      if (member.user) return member.user.global_name || member.user.username || fallback;
    }
  } catch (_) {}
  return fallback;
}

// =============================
// 🔵 GENERIC ROLE CHECK
// Comprueba si el usuario tiene un rol de Discord concreto:
// 1) edge function (bot, autoritativo), 2) miembro del guild vía OAuth,
// 3) tabla police_members como respaldo.
// =============================
async function hrpHasRole(roleId, discordId) {
  if (!roleId) return false;
  const session = typeof hrpGetSession === 'function' ? hrpGetSession() : null;
  const id = discordId || (session && session.id);
  if (!id) return false;

  try {
    if (typeof hrpCallCheckPoliceRole === 'function') {
      const result = await hrpCallCheckPoliceRole({
        discord_id: id,
        username: (session && session.username) || 'Unknown',
        role_id: roleId,
      });
      if (result && result.allowed === true) return true;
    }
  } catch (_) {}

  try {
    const member = await hrpFetchGuildMember();
    if (member && Array.isArray(member.roles) && member.roles.includes(roleId)) return true;
  } catch (_) {}

  try {
    const rows = await supaSelect('police_members', 'role_id', { discord_id: `eq.${id}` });
    if (Array.isArray(rows) && rows.some(r => String(r.role_id) === String(roleId))) return true;
  } catch (_) {}

  return false;
}

// =============================
// 🔵 POLICE ROLE CHECK
// =============================
async function hrpCallCheckPoliceRole(payload) {
  try {
    const res = await fetch('/.netlify/functions/check-police-role', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/check-police-role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  return null;
}

async function hrpCheckPoliceAccess(discordId) {
  if (!discordId) return false;
  const session = hrpGetSession();

  // Check cache first — avoid repeated Discord API calls
  const cached = hrpGetAccessCache('police');
  if (cached && cached.v) {
    cachedDepartments = hrpGetCachedDepartments();
    // Autorepoblar: si el acceso police está confirmado pero el cache de departamentos
    // quedó vacío (bot que no devolvió `departments` en una sesión anterior), asumimos
    // todos los disponibles para que el MDT/ITMDT no muestre "Sin departamentos asignados".
    if (!cachedDepartments || cachedDepartments.length === 0) {
      cachedDepartments = Object.keys(DEPARTMENT_ROLES);
      localStorage.setItem('hrp_departments', JSON.stringify(cachedDepartments));
    }
    return true;
  }

  hrpReauthNeeded = false;

  // 1) Try Edge Function (Discord bot check)
  try {
    const result = await hrpCallCheckPoliceRole({ discord_id: discordId, username: session?.username || "Unknown" });
    if (result) {
      if (result.departments && Object.keys(result.departments).length > 0) {
        cachedDepartments = Object.entries(result.departments)
          .filter(([k, v]) => v).map(([k]) => k);
        localStorage.setItem('hrp_departments', JSON.stringify(cachedDepartments));
      }
       if (result.allowed === true) {
        // Si el bot confirmó acceso pero no detalló departamentos, asumimos todos los disponibles
        // (mismo comportamiento que los fallbacks de police_members / guild member).
        if (!cachedDepartments || cachedDepartments.length === 0) {
          cachedDepartments = Object.keys(DEPARTMENT_ROLES);
          localStorage.setItem('hrp_departments', JSON.stringify(cachedDepartments));
        }
        hrpSetAccessCache('police', true);
        return true;
      }
    }
  } catch (_) {}

  // 2) Fallback: check police_members table
  try {
    const data = await supaSingle("police_members", "discord_id",
      { discord_id: `eq.${discordId}`, role_id: `eq.${discordPoliceRoleId}` }
    );
    if (data) {
      const allDepts = Object.keys(DEPARTMENT_ROLES);
      cachedDepartments = allDepts;
      localStorage.setItem('hrp_departments', JSON.stringify(allDepts));
      hrpSetAccessCache('police', true);
      return true;
    }
  } catch (err) {
    if (err.message?.includes("does not exist") || err.code === 404) {
      console.warn("police_members table not found");
    }
  }

  // 3) Fallback — shared guild member fetch
  const member = await hrpFetchGuildMember();
  if (member) {
    const memberRoles = member.roles || [];
    if (memberRoles.includes(discordPoliceRoleId)) {
      const depts = [];
      for (const [key, roleId] of Object.entries(DEPARTMENT_ROLES)) {
        if (memberRoles.includes(roleId)) depts.push(key);
      }
      if (depts.length === 0) depts.push(...Object.keys(DEPARTMENT_ROLES));
      cachedDepartments = depts;
      localStorage.setItem('hrp_departments', JSON.stringify(depts));
      hrpSetAccessCache('police', true);
      return true;
    }
  }

  return false;
}

async function hrpEnsureTables() {
  try {
    await supaSelect("police_members", "discord_id", { limit: "1" });
    return true;
  } catch {
    return false;
  }
}

async function hrpAddPoliceMember(discordId, username) {
  try {
    await supaInsert("police_members", {
      discord_id: discordId,
      username: username,
      role_id: discordPoliceRoleId,
    });
    return true;
  } catch (err) {
    console.error("Add police member error:", err);
    return false;
  }
}

// =============================
// 🔵 MANAGE SHIFT ACCESS CHECK
// =============================
async function hrpCheckManageAccess(discordId) {
  if (!discordId) return false;

  // Check cached access for manage OR dev role
  const manageCached = hrpGetAccessCache('manage');
  const devCached = hrpGetAccessCache('dev');
  if ((manageCached && manageCached.v) || (devCached && devCached.v)) return true;

  const session = hrpGetSession();

  try {
    const result = await hrpCallCheckPoliceRole({
      discord_id: discordId,
      username: session?.username || "Unknown",
      role_id: discordManageRoleId,
    });
    if (result && result.allowed) {
      hrpSetAccessCache('manage', true);
      return true;
    }
  } catch (_) {}

  try {
    const data = await supaSingle("police_members", "discord_id",
      { discord_id: `eq.${discordId}`, role_id: `eq.${discordManageRoleId}` }
    );
    if (data) {
      hrpSetAccessCache('manage', true);
      return true;
    }
    const devData = await supaSingle("police_members", "discord_id",
      { discord_id: `eq.${discordId}`, role_id: `eq.${discordDevRoleId}` }
    );
    if (devData) {
      hrpSetAccessCache('manage', true);
      return true;
    }
    const fndData = await supaSingle("police_members", "discord_id",
      { discord_id: `eq.${discordId}`, role_id: `eq.${discordFoundationRoleId}` }
    );
    if (fndData) {
      hrpSetAccessCache('manage', true);
      return true;
    }
  } catch (err) {
    if (err.message?.includes("does not exist")) {
      console.warn("police_members table not found");
    }
  }

  const member = await hrpFetchGuildMember();
  const manageRoles = [discordManageRoleId, discordDevRoleId, discordFoundationRoleId];
  if (member && member.roles) {
    for (const roleId of manageRoles) {
      if (member.roles.includes(roleId)) {
        hrpSetAccessCache('manage', true);
        return true;
      }
    }
  }

  return false;
}

// =============================
// 🔵 MANAGE SHIFT — ADD HOURS
// =============================
async function hrpAddHours(discordId, username, seconds, reason, adminId, department) {
  try {
    await supaInsert("police_hours_adjustments", {
      discord_id: discordId,
      username: username,
      adjustment_seconds: seconds,
      reason: reason || "Añadido por administrador",
      created_by: adminId,
      department: department || 'hpd',
    });
    return true;
  } catch (err) {
    console.error("Add hours error:", err);
    return false;
  }
}

// =============================
// 🔵 MANAGE SHIFT — REMOVE HOURS
// =============================
async function hrpRemoveHours(discordId, username, seconds, reason, adminId, department) {
  try {
    await supaInsert("police_hours_adjustments", {
      discord_id: discordId,
      username: username,
      adjustment_seconds: -Math.abs(seconds),
      reason: reason || "Removido por administrador",
      created_by: adminId,
      department: department || 'hpd',
    });

    try {
      const adminSession = hrpGetSession();
      const adminName = adminSession?.username || adminId || 'Desconocido';
      const hoursRemoved = Math.floor(Math.abs(seconds) / 3600);
      const minsRemoved = Math.floor((Math.abs(seconds) % 3600) / 60);
      const timeStr = hoursRemoved > 0 ? `${hoursRemoved}h ${minsRemoved}m` : `${minsRemoved}m`;
      const deptLabel = (department || 'hpd').toUpperCase();
      await hrpSendDiscordWebhook(HRP_DISCORD_WEBHOOKS.security, {
        embeds: [hrpCreateDiscordEmbed({
          title: '⚠️ Horas Removidas',
          color: 0xff8c42,
          fields: [
            { name: '👤 Oficial Afectado', value: username || '—', inline: true },
            { name: '🎮 Discord ID', value: discordId || '—', inline: true },
            { name: '🕐 Horas Removidas', value: timeStr, inline: true },
            { name: '📝 Razón', value: reason || 'Sin razón especificada', inline: false },
            { name: '👮 Administrador', value: adminName, inline: true },
            { name: '🏷️ Departamento', value: deptLabel, inline: true },
          ],
          footer: 'Houston RP — Auditoría de Seguridad',
        })],
      });
    } catch (_) {}

    return true;
  } catch (err) {
    console.error("Remove hours error:", err);
    return false;
  }
}

// =============================
// 🔵 MANAGE SHIFT — RESET HOURS
// =============================
async function hrpResetUserHours(discordId, department) {
  try {
    await Promise.all([
      supaDelete("police_shift_sessions", { discord_id: `eq.${discordId}`, status: "eq.completed", ...depFilter(department) }),
      supaDelete("police_hours_adjustments", { discord_id: `eq.${discordId}`, ...depFilter(department) }),
    ]);
    return true;
  } catch (err) {
    console.error("Reset hours error:", err);
    return false;
  }
}

// =============================
// 🔵 MANAGE SHIFT — GET ALL USERS WITH HOURS
// =============================
async function hrpGetAllUsersWithHours(department) {
  try {
    const shiftFilter = { status: "eq.completed", total_seconds: "not.is.null", ...depFilter(department), order: "start_time.desc" };
    const [shifts, adjustments] = await Promise.all([
      supaSelect("police_shift_sessions", "discord_id, username, total_seconds, department", shiftFilter
      ).catch(() => []),
      supaSelect("police_hours_adjustments", "discord_id, username, adjustment_seconds, department", depFilter(department))
        .catch(() => []),
    ]);

    const agg = {};
    for (const row of shifts) {
      if (!agg[row.discord_id]) agg[row.discord_id] = { discord_id: row.discord_id, username: row.username, total_seconds: 0, shifts: 0, department: row.department || '' };
      agg[row.discord_id].total_seconds += row.total_seconds || 0;
      agg[row.discord_id].shifts += 1;
    }
    for (const row of adjustments) {
      if (!agg[row.discord_id]) agg[row.discord_id] = { discord_id: row.discord_id, username: row.username, total_seconds: 0, shifts: 0, department: row.department || '' };
      if (!agg[row.discord_id].department) agg[row.discord_id].department = row.department || '';
      agg[row.discord_id].total_seconds += row.adjustment_seconds || 0;
    }

    return Object.values(agg).sort((a, b) => b.total_seconds - a.total_seconds);
  } catch (err) {
    console.error("Get all users error:", err);
    return [];
  }
}

// =============================
// 🔵 ECONOMY BALANCE
// =============================
async function hrpGetBalance(discordId) {
  if (!discordId) return null;
  try {
    const data = await supaSelect('economy', 'balance', { discord_id: `eq.${discordId}` });
    return data?.[0]?.balance ?? null;
  } catch {
    return null;
  }
}

function hrpFormatBalance(balance) {
  if (balance === null || balance === undefined) return '$---';
  return '$' + Number(balance).toLocaleString();
}

async function hrpDeductBalance(discordId, amount) {
  if (!discordId || !amount) return false;
  try {
    const cur = await supaSelect('economy', 'balance', { discord_id: `eq.${discordId}` });
    const current = parseInt(cur?.[0]?.balance) || 0;
    await supaUpdate('economy', { balance: Math.max(0, current - amount) }, { discord_id: `eq.${discordId}` });
    return true;
  } catch (e) {
    console.error('Deduct balance error:', e);
    return false;
  }
}

async function hrpAddBalance(discordId, amount) {
  if (!discordId || !amount) return false;
  try {
    const cur = await supaSelect('economy', 'balance', { discord_id: `eq.${discordId}` });
    const exists = Array.isArray(cur) && cur.length > 0;
    const current = parseInt(cur?.[0]?.balance) || 0;
    await supaUpdate('economy', { balance: current + amount, updated_at: new Date().toISOString() }, { discord_id: `eq.${discordId}` });
    // Si el usuario todavía no tenía fila en `economy`, el UPDATE no afecta
    // nada y el dinero se "pierde" aunque el frontend muestre éxito.
    // En ese caso creamos la fila con el monto acreditado.
    if (!exists) {
      await supaInsert('economy', { discord_id: discordId, balance: amount, updated_at: new Date().toISOString() });
    }
    return true;
  } catch (e) {
    console.error('Add balance error:', e);
    return false;
  }
}

// =============================
// 🔵 NÓMINA (PAYROLL) — SISTEMA AUTOMÁTICO
// =============================
// Rol con acceso a modificar/quitar dinero (Foundation)
const discordPayrollAdminRoleId = "1430728225423884419";
const PAYROLL_DEPARTMENTS = { hpd: 'HPD', hcso: 'HCSO', tph: 'TPH', hfd: 'HFD', dot: 'HDOT' };

function hrpRpc(name, args) {
  return fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args || {}),
  }).then(async res => {
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`RPC ${name}: ${res.status} ${text}`);
      err.code = res.status;
      err.details = text;
      throw err;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  });
}

// Efectúa el tick de nómina: acumula sesiones activas y deposita
// automáticamente los turnos completados. Devuelve los pagos creados.
async function hrpPayrollTick() {
  try {
    const data = await hrpRpc("hrp_payroll_tick");
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("Payroll tick:", e.message);
    return [];
  }
}

// Inicia/reanuda el servicio (empieza a contar el turno)
async function hrpPayrollStart(discordId, username, department) {
  if (!discordId) return null;
  try {
    return await hrpRpc("hrp_payroll_start", {
      p_discord_id: String(discordId),
      p_username: username || "Oficial",
      p_department: department || "hpd",
    });
  } catch (e) {
    console.warn("Payroll start:", e.message);
    return null;
  }
}

// Termina el servicio guardando el progreso acumulado
async function hrpPayrollEnd(discordId) {
  if (!discordId) return null;
  try {
    return await hrpRpc("hrp_payroll_end", { p_discord_id: String(discordId) });
  } catch (e) {
    console.warn("Payroll end:", e.message);
    return null;
  }
}

// Estado/resumen de nómina del usuario
async function hrpPayrollStatus(discordId) {
  if (!discordId) return null;
  try {
    return await hrpRpc("hrp_payroll_status", { p_discord_id: String(discordId) });
  } catch (e) {
    console.warn("Payroll status:", e.message);
    return null;
  }
}

// Ajuste administrativo de saldo (amount = positivo/negativo)
async function hrpPayrollAdjust(discordId, username, amount, reason, createdBy) {
  if (!discordId || !amount) return null;
  try {
    return await hrpRpc("hrp_payroll_adjust", {
      p_discord_id: String(discordId),
      p_username: username || "",
      p_amount: amount,
      p_reason: reason || "Ajuste administrativo",
      p_created_by: createdBy || "admin",
    });
  } catch (e) {
    console.warn("Payroll adjust:", e.message);
    return null;
  }
}

// =============================
// 🔵 RANGOS + ECONOMÍA (sistema nuevo, migración 019)
// =============================
// Llama a la función de servidor que verifica el token de Discord
// del usuario y su rol antes de hacer operaciones sensibles.
async function hrpRankAdmin(action, payload) {
  const token = (typeof hrpGetToken === 'function') ? hrpGetToken() : null;
  if (!token) return { error: 'No hay token de Discord. Reconéctate.' };
  const body = Object.assign({ token, action }, payload || {});

  // 1) Netlify function (recomendado)
  try {
    const res = await fetch('/.netlify/functions/rank-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok || res.status === 400 || res.status === 401 || res.status === 403 || res.status === 500) {
      return await res.json();
    }
  } catch (_) {}

  // 2) Edge function directa (respaldo)
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/rank-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok || res.status === 400 || res.status === 401 || res.status === 403 || res.status === 500) {
      return await res.json();
    }
  } catch (_) {}

  return { error: 'No se pudo contactar al servidor de rangos.' };
}

async function hrpRankWhoAmI() {
  return await hrpRankAdmin('whoami');
}

async function hrpGetRanks() {
  try { return await supaSelect('ranks', '*', { order: 'department.asc,sort_order.asc' }); }
  catch (e) { console.warn('Get ranks:', e.message); return []; }
}

async function hrpGetRankMembers() {
  try { return await supaSelect('rank_members', '*', { order: 'updated_at.desc', limit: '500' }); }
  catch (e) { return []; }
}

async function hrpGetMemberRank(discordId) {
  if (!discordId) return null;
  try {
    const rows = await supaSelect('rank_members', '*', { discord_id: `eq.${discordId}`, limit: '1' });
    return rows?.[0] || null;
  } catch (e) { return null; }
}

async function hrpGetRankHistory(limit) {
  try { return await supaSelect('rank_history', '*', { order: 'created_at.desc', limit: String(limit || 100) }); }
  catch (e) { return []; }
}

async function hrpSetUserRank(targetId, targetName, department, rankKey) {
  return await hrpRankAdmin('set_rank', {
    target_id: String(targetId),
    target_name: targetName || '',
    department,
    rank_key: rankKey,
  });
}

async function hrpPayWidget(discordId) {
  if (!discordId) return null;
  try { return await hrpRpc('hrp_pay_widget', { p_discord_id: String(discordId) }); }
  catch (e) { return null; }
}

// El sueldo lo determina SIEMPRE el rango que el Alto Mando asigna en
// manage-shift (rank_members + ranks); nunca se envía un valor de pago
// desde el navegador.
// 1) Vía autoritativa: la Netlify function verifica la identidad en
//    Discord y arranca el turno; el servidor resuelve el sueldo.
// 2) Respaldo: si la function no está disponible, se llama directo al
//    RPC hrp_pay_start (el servidor resuelve igual contra el rango).
async function hrpPayStart(discordId, username, department) {
  if (!discordId) return null;

  try {
    const res = await hrpRankAdmin('pay_start', { department: department || '' });
    // Si el servidor respondió (ok o error), es la respuesta autoritativa:
    // no caer al RPC directo o el turno se cobraría dos veces.
    if (res && (res.status || res.error)) return res;
  } catch (_) {}

  try {
    let roleIds = [];
    if (typeof hrpFetchGuildMember === 'function') {
      const member = await hrpFetchGuildMember();
      if (member && Array.isArray(member.roles)) roleIds = member.roles;
    }
    try {
      return await hrpRpc('hrp_pay_start', {
        p_discord_id: String(discordId),
        p_username: username || 'Oficial',
        p_department: department || 'hpd',
        p_role_ids: roleIds,
      });
    } catch (_) {
      // Respaldo pre-021: firma vieja de 3 argumentos (sin p_role_ids),
      // por si la migración 021 todavía no se aplicó a Supabase.
      return await hrpRpc('hrp_pay_start', {
        p_discord_id: String(discordId),
        p_username: username || 'Oficial',
        p_department: department || 'hpd',
      });
    }
  } catch (e) { console.warn('Pay start:', e.message); return null; }
}

async function hrpPayEnd(discordId) {
  if (!discordId) return null;
  try { return await hrpRpc('hrp_pay_end', { p_discord_id: String(discordId) }); }
  catch (e) { console.warn('Pay end:', e.message); return null; }
}

async function hrpPayCollect() {
  return await hrpRankAdmin('collect');
}

// =============================
// 🗂️ IDENTIFICADORES DE CASO (formato "Caso A-000152")
// =============================
// Usa la función RPC hrp_next_case_id (migración 015). Si la migración
// todavía no fue aplicada, genera un ID de respaldo único para no romper
// el registro de arrestos/multas/incidentes.
async function hrpNextCaseId(prefix) {
  const pfx = (prefix || 'A').toString().toUpperCase();
  try {
    const res = await hrpRpc('hrp_next_case_id', { p_prefix: pfx });
    if (res && typeof res === 'string' && res.length > 0) return res;
  } catch (e) {
    console.warn('Case ID RPC no disponible, usando respaldo:', e.message);
  }
  return 'Caso ' + pfx + '-' + String(Date.now()).slice(-6);
}

function hrpFormatCaseId(caseId, fallback) {
  if (caseId && String(caseId).trim().length > 0) return String(caseId).trim();
  return fallback || '—';
}

// Inserta un registro en police_records de forma robusta.
// Si la base aún no tiene las columnas de caso (migración 015 no aplicada),
// reintenta sin esas columnas para que la multa/arresto NO se pierda.
// Los registros antiguos nunca se tocan; los nuevos reciben case_id cuando sea posible.
async function hrpInsertPoliceRecord(payload) {
  const caseKeys = ['case_id', 'case_status', 'officer_description', 'incident_type'];
  try {
    return await supaInsert('police_records', payload);
  } catch (err) {
    const msg = (err && (err.message || err.details)) || '';
    // PGRST204 = columna inexistente en el schema cache; PGRST205 = columna desconocida en el select
    if (!/PGRST204|PGRST205/.test(msg)) throw err;
    const slim = {};
    for (const k of Object.keys(payload)) {
      if (!caseKeys.includes(k)) slim[k] = payload[k];
    }
    return await supaInsert('police_records', slim);
  }
}

async function hrpGetSalaries() {
  try { return await supaSelect("payroll_salaries", "*", { order: "department.asc" }); }
  catch (e) { console.warn("Get salaries:", e.message); return []; }
}

async function hrpSetSalary(department, rank, salary) {
  try {
    await supaUpsert("payroll_salaries", { department, rank, salary }, "department,rank");
    return true;
  } catch (e) { console.error("Set salary error:", e); return false; }
}

async function hrpSetPayrollMember(discordId, username, department, rank) {
  try {
    await supaUpsert("payroll_members", { discord_id: discordId, username: username || "", department, rank }, "discord_id");
    return true;
  } catch (e) { console.error("Set payroll member error:", e); return false; }
}

async function hrpGetPayrollMembers() {
  try { return await supaSelect("payroll_members", "*", { order: "updated_at.desc" }); }
  catch (e) { return []; }
}

async function hrpGetPayments(discordId) {
  if (!discordId) return [];
  try {
    return await supaSelect("payroll_payments", "*", { discord_id: `eq.${discordId}`, order: "created_at.desc", limit: "100" });
  } catch (e) { return []; }
}

async function hrpGetAllPayments() {
  try { return await supaSelect("payroll_payments", "*", { order: "created_at.desc", limit: "200" }); }
  catch (e) { return []; }
}

async function hrpGetPayrollConfig() {
  try {
    const rows = await supaSelect("payroll_config", "*");
    const cfg = {};
    for (const r of (rows || [])) cfg[r.key] = r.value;
    return cfg;
  } catch (e) { return { shift_seconds: "7200" }; }
}

async function hrpSetShiftConfig(shiftSeconds) {
  try {
    await supaUpsert("payroll_config", { key: "shift_seconds", value: String(shiftSeconds) }, "key");
    return true;
  } catch (e) { console.error("Set shift config error:", e); return false; }
}

// Acceso de administración de dinero (solo rol 1430728225423884419)
async function hrpCheckPayrollAdmin(discordId) {
  if (!discordId) return false;

  const cached = hrpGetAccessCache('payroll_admin');
  if (cached && cached.v) return true;

  const session = hrpGetSession();

  // 1) Edge Function (bot de Discord)
  try {
    const result = await hrpCallCheckPoliceRole({
      discord_id: discordId,
      username: session?.username || "Unknown",
      role_id: discordPayrollAdminRoleId,
    });
    if (result && result.allowed) {
      hrpSetAccessCache('payroll_admin', true);
      return true;
    }
  } catch (_) {}

  // 2) police_members
  try {
    const data = await supaSingle("police_members", "discord_id",
      { discord_id: `eq.${discordId}`, role_id: `eq.${discordPayrollAdminRoleId}` }
    );
    if (data) {
      hrpSetAccessCache('payroll_admin', true);
      return true;
    }
  } catch (_) {}

  // 3) roles del guild member
  const member = await hrpFetchGuildMember();
  if (member && member.roles && member.roles.includes(discordPayrollAdminRoleId)) {
    hrpSetAccessCache('payroll_admin', true);
    return true;
  }

  return false;
}

// =============================
// 🔵 HIDE RESTRICTED SECTIONS FROM UNAUTHORIZED USERS
// =============================
function hrpHideSection(label) {
  label.style.display = 'none';
  let el = label.nextElementSibling;
  while (el && !el.classList.contains('nav-section-label')) {
    const next = el.nextElementSibling;
    el.style.display = 'none';
    el = next;
    if (!el) break;
  }
}

function hrpShowSection(label) {
  label.style.display = '';
  let el = label.nextElementSibling;
  while (el && !el.classList.contains('nav-section-label')) {
    const next = el.nextElementSibling;
    el.style.display = '';
    el = next;
    if (!el) break;
  }
}

function hrpHideRestrictedSections() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;
  const labels = nav.querySelectorAll('.nav-section-label');
  for (let i = 0; i < labels.length; i++) {
    const text = labels[i].textContent.trim();
    if (text === 'Law Enforcement') {
      const cached = hrpGetAccessCache('police');
      if (cached && cached.v === true) continue;
      hrpHideSection(labels[i]);
    }
    if (text === 'Developer' || text === 'Foundation') {
      const cached = hrpGetAccessCache('manage');
      if (cached && cached.v === true) continue;
      hrpHideSection(labels[i]);
    }
  }
}

// ── MOBILE SIDEBAR TOGGLE ──
function hrpInitMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  if (document.getElementById('sidebar-toggle-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'sidebar-toggle-btn';
  btn.className = 'sidebar-toggle';
  btn.innerHTML = '☰';
  btn.setAttribute('aria-label', 'Toggle sidebar');

  const overlay = document.createElement('div');
  overlay.id = 'sidebar-overlay';
  overlay.className = 'sidebar-overlay';

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('open');
    btn.classList.add('active');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    btn.classList.remove('active');
  }
  function toggleSidebar() {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  }

  btn.addEventListener('click', toggleSidebar);
  overlay.addEventListener('click', closeSidebar);

  document.body.appendChild(btn);
  document.body.appendChild(overlay);
}

// ── WALLET DEL SIDEBAR (dinero total, junto a los botones) ──
// Muestra el balance total del usuario en una tarjeta dentro del menú, encima
// de los botones. Funciona en TODAS las páginas con sidebar (el dock) y se
// adapta a celular/tablet/PC.
function hrpInitSidebarWallet() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;
  if (document.getElementById('hrp-wallet')) return;

  const card = document.createElement('div');
  card.id = 'hrp-wallet';
  card.className = 'hrp-wallet';
  card.setAttribute('title', 'Dinero total');
  card.innerHTML =
    '<div class="hrp-wallet-icon">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="2" y="6" width="20" height="13" rx="3"/>' +
        '<path d="M2 10h20"/>' +
        '<circle cx="17" cy="14.5" r="1.4" fill="currentColor" stroke="none"/>' +
      '</svg>' +
    '</div>' +
    '<div class="hrp-wallet-info">' +
      '<div class="hrp-wallet-label">Dinero total</div>' +
      '<div class="hrp-wallet-amount" id="hrp-wallet-amount">$---</div>' +
    '</div>';
  nav.prepend(card);

  const session = hrpGetSession();
  if (!session || !session.id) return;

  let walletBusy = false;
  async function refreshWallet() {
    if (walletBusy) return;
    walletBusy = true;
    try {
      const bal = await hrpGetBalance(session.id);
      const el = document.getElementById('hrp-wallet-amount');
      if (el) el.textContent = hrpFormatBalance(bal);
    } catch (_) { /* silencioso */ }
    walletBusy = false;
  }
  refreshWallet();
  setInterval(refreshWallet, 30000);
  window.addEventListener('focus', refreshWallet);
}

// ── NAV "CHARACTERS" ──
// El acceso a Characters solo se muestra si el usuario NO tiene personaje
// creado. Si un admin (Developer/Foundation) le borra el character, al
// recargar cualquier página vuelve a aparecer para poder crear otro.
function hrpSyncCharacterNav() {
  const links = document.querySelectorAll('a.nav-item[href="app.html"]');
  if (!links.length) return;
  const session = hrpGetSession();
  if (!session || !session.id) return;

  function apply(hasCharacter) {
    for (let i = 0; i < links.length; i++) {
      links[i].style.display = hasCharacter ? 'none' : '';
    }
  }

  Promise.resolve()
    .then(function() {
      return supaSelect('characters', 'user_discord', { user_discord: 'eq.' + session.id, limit: '1' });
    })
    .then(function(rows) {
      apply(Array.isArray(rows) && rows.length > 0);
    })
    .catch(function() { /* sin red: se deja visible para no bloquear */ });
}

// ── CLOSE SIDEBAR ON NAV CLICK (mobile) ──
document.addEventListener('click', (e) => {
  const link = e.target.closest('.nav-item, .nav-link, .sidebar a[href]');
  if (!link) return;
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  const btn = document.getElementById('sidebar-toggle-btn');
  if (btn) btn.classList.remove('active');
});

// Hide restricted sections on load, then show after verifying access.
// Fix de raíz: mantiene las secciones estables al navegar entre páginas.
// El caché de acceso persiste 24h y, si una verificación falla por red,
// se re-intenta en segundo plano para que las secciones nunca queden
// ocultas indefinidamente. No se altera el sistema de permisos: cada
// sección sigue mostrándose solo si el rol correspondiente está verificado.
(function() {
  function showRestrictedSections() {
    const nav = document.querySelector('.sidebar-nav');
    if (!nav) return;
    const labels = nav.querySelectorAll('.nav-section-label');
    for (let i = 0; i < labels.length; i++) {
      const text = labels[i].textContent.trim();
      if (text === 'Law Enforcement') {
        const cached = hrpGetAccessCache('police');
        if (cached && cached.v === true) hrpShowSection(labels[i]);
      }
      if (text === 'Developer' || text === 'Foundation') {
        const cached = hrpGetAccessCache('manage');
        if (cached && cached.v === true) hrpShowSection(labels[i]);
      }
    }
  }
  function hasHiddenRestrictedLabels() {
    const nav = document.querySelector('.sidebar-nav');
    if (!nav) return false;
    return Array.prototype.some.call(nav.querySelectorAll('.nav-section-label'), function(l) {
      const t = (l.textContent || '').trim();
      return ((t === 'Law Enforcement' || t === 'Developer' || t === 'Foundation') && l.style.display === 'none');
    });
  }
  async function verifyAll() {
    const session = hrpGetSession();
    if (!session || !session.id) return;
    await Promise.all([
      Promise.resolve().then(function() { return hrpCheckPoliceAccess(session.id); }).catch(function() { return false; }),
      Promise.resolve().then(function() { return hrpCheckManageAccess(session.id); }).catch(function() { return false; }),
    ]);
  }
  (async function() {
    if (document.readyState === 'loading') {
      await new Promise(function(resolve) { document.addEventListener('DOMContentLoaded', resolve); });
    }
    const session = hrpGetSession();
    hrpInitMobileSidebar();
    hrpInitSidebarWallet();
    hrpSyncCharacterNav();
    if (!session || !session.id) {
      hrpHideRestrictedSections();
      return;
    }
    // Aplica primero lo que ya está en caché (sin parpadeo al cambiar de página)
    // y luego verifica en segundo plano.
    hrpHideRestrictedSections();
    await Promise.race([
      verifyAll(),
      new Promise(function(resolve) { setTimeout(resolve, 6000); }),
    ]);
    showRestrictedSections();
    // Reintento en segundo plano si la verificación quedó inconclusa.
    if (hasHiddenRestrictedLabels()) {
      setTimeout(function() {
        verifyAll().then(function() { showRestrictedSections(); });
      }, 4500);
    }
  })();
})();
