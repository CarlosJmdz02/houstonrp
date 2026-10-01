/*
 * rank-admin — operaciones sensibles de RANGOS + ECONOMÍA
 * ------------------------------------------------------------
 * Verifica SERVER-SIDE (con el token OAuth de Discord del usuario)
 * quién está actuando y qué roles tiene antes de:
 *   - action = "set_rank":  cambiar el rango de otro usuario
 *   - action = "collect":   cobrar el dinero pendiente del propio usuario
 *   - action = "pay_start": iniciar/reanudar turno; el sueldo lo
 *                           resuelve el servidor según el RANGO que el
 *                           Alto Mando asignó en manage-shift
 *   - action = "whoami":    devolver identidad + si es alto mando
 *
 * La escritura en Supabase se hace con la service_role (nunca expuesta
 * al navegador), llamando a las funciones hrp_rank_set_srv /
 * hrp_pay_collect_srv / hrp_pay_start, que no están disponibles para anon.
 *
 * Variables de entorno requeridas en Netlify:
 *   SUPABASE_SERVICE_ROLE_KEY  (obligatoria para set_rank / collect / pay_start)
 * Opcionales (tienen valor por defecto):
 *   SUPABASE_URL, GUILD_ID
 */

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qqgtroxrkccftlrpqwsk.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const GUILD_ID = process.env.GUILD_ID || '1285846827463344209';

const MANAGE_ROLE_ID = process.env.MANAGE_ROLE_ID || '1502940172348690482';
const DEV_ROLE_ID = '1425697670495862844';
const FOUNDATION_ROLE_ID = '1430728225423884419';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function request(url, options, payload) {
  return new Promise((resolve, reject) => {
    const data = payload === undefined ? null : JSON.stringify(payload);
    const opts = { method: options.method || 'GET', headers: { ...(options.headers || {}) } };
    if (data) {
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = https.request(url, opts, (res) => {
      let out = '';
      res.on('data', (c) => (out += c));
      res.on('end', () => resolve({ status: res.statusCode, body: out }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function discord(path, token) {
  const res = await request(`https://discord.com/api${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  let parsed = null;
  try { parsed = res.body ? JSON.parse(res.body) : null; } catch (_) { parsed = null; }
  return { ok: res.status >= 200 && res.status < 300, status: res.status, data: parsed };
}

async function rpc(name, args) {
  const res = await request(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  }, args || {});
  let parsed = null;
  try { parsed = res.body ? JSON.parse(res.body) : null; } catch (_) { parsed = null; }
  return { ok: res.status >= 200 && res.status < 300, status: res.status, data: parsed };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Método no permitido' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (_) {
    return json(400, { error: 'JSON inválido' });
  }

  const token = payload.token;
  const action = payload.action;
  if (!token) return json(401, { error: 'Falta el token de Discord' });

  // 1) Identidad real del que actúa (no se puede falsificar).
  let me;
  try {
    const r = await discord('/users/@me', token);
    if (!r.ok || !r.data || !r.data.id) {
      return json(401, { error: 'Token de Discord inválido o expirado' });
    }
    me = r.data;
  } catch (err) {
    return json(502, { error: 'No se pudo verificar con Discord', detail: err.message });
  }

  // 2) Roles reales del miembro en el servidor.
  let roles = [];
  try {
    const r = await discord(`/v10/users/@me/guilds/${GUILD_ID}/member`, token);
    if (r.ok && r.data && Array.isArray(r.data.roles)) roles = r.data.roles;
  } catch (_) {}

  // El rango SOLO lo administra el rol de Alto Mando indicado.
  const canManageRanks = roles.includes(MANAGE_ROLE_ID);
  const isAdmin = canManageRanks || roles.includes(DEV_ROLE_ID) || roles.includes(FOUNDATION_ROLE_ID);

  if (action === 'whoami') {
    return json(200, { id: me.id, username: me.username, isAdmin, canManageRanks });
  }

  if (!SERVICE_KEY) {
    return json(500, { error: 'Servidor sin configurar (falta SUPABASE_SERVICE_ROLE_KEY en Netlify)' });
  }

  if (action === 'pay_start') {
    // El sueldo lo resuelve el servidor con el rango de la web (rank_members);
    // los role_ids que pudiera mandar el navegador se ignoran.
    try {
      const newSig = await rpc('hrp_pay_start', {
        p_discord_id: String(me.id),
        p_username: me.global_name || me.username || '',
        p_department: payload.department ? String(payload.department) : '',
        p_role_ids: roles,
      });
      if (newSig.ok) return json(200, newSig.data);

      // Respaldo: firma vieja de 3 argumentos (mantenida como wrapper).
      const legacy = await rpc('hrp_pay_start', {
        p_discord_id: String(me.id),
        p_username: me.global_name || me.username || '',
        p_department: payload.department ? String(payload.department) : '',
      });
      if (legacy.ok) return json(200, legacy.data);
      return json(legacy.status === 404 ? 404 : 500, { error: 'Error al iniciar el turno', detail: legacy.data });
    } catch (err) {
      return json(502, { error: 'Error de conexión con Supabase', detail: err.message });
    }
  }

  if (action === 'collect') {
    // El jugador solo puede cobrar SU propio dinero.
    try {
      const result = await rpc('hrp_pay_collect_srv', { p_discord_id: String(me.id) });
      if (!result.ok) {
        return json(result.status === 404 ? 404 : 500, { error: 'Error al cobrar', detail: result.data });
      }
      return json(200, result.data);
    } catch (err) {
      return json(502, { error: 'Error de conexión con Supabase', detail: err.message });
    }
  }

  if (action === 'set_rank') {
    if (!canManageRanks) return json(403, { error: 'No tienes el rol de Alto Mando' });

    const targetId = payload.target_id ? String(payload.target_id) : '';
    const targetName = payload.target_name || '';
    const department = payload.department ? String(payload.department) : '';
    const rankKey = payload.rank_key ? String(payload.rank_key) : '';

    if (!targetId || !department || !rankKey) {
      return json(400, { error: 'Faltan datos (target, departamento o rango)' });
    }
    if (targetId === String(me.id)) {
      return json(403, { error: 'No puedes cambiar tu propio rango' });
    }

    try {
      const result = await rpc('hrp_rank_set_srv', {
        p_actor_id: String(me.id),
        p_actor_name: me.username || '',
        p_target_id: targetId,
        p_target_name: targetName,
        p_department: department,
        p_rank_key: rankKey,
      });
      if (!result.ok) {
        return json(500, { error: 'Error al asignar el rango', detail: result.data });
      }
      if (result.data && result.data.status === 'error') {
        return json(400, result.data);
      }
      return json(200, result.data);
    } catch (err) {
      return json(502, { error: 'Error de conexión con Supabase', detail: err.message });
    }
  }

  return json(400, { error: 'Acción desconocida' });
};
