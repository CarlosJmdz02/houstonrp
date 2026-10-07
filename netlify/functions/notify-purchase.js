const https = require('https');

// Aviso de compras de la Tienda → canal del bot (mensaje normal del bot,
// NO un webhook). El canal lo puso el dueño del proyecto.
const CHANNEL_ID = process.env.MARKET_CHANNEL_ID || '1554967862572220416';
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qqgtroxrkccftlrpqwsk.supabase.co').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || 'sb_publishable_ZTcgdobN4BxLtxo59UUCuA_raeLls6H';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const RECENT_MS = 5 * 60 * 1000; // la compra debe ser reciente para avisar

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

function request(url, options) {
  return new Promise((resolve, reject) => {
    const data = options.body ? JSON.stringify(options.body) : null;
    const opts = {
      method: options.method || 'GET',
      headers: Object.assign({}, options.headers),
      timeout: 8000,
    };
    if (data) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = https.request(url, opts, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: out }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  if (!BOT_TOKEN) {
    return json(500, { ok: false, error: 'Falta DISCORD_BOT_TOKEN en las variables de entorno de Netlify' });
  }

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (_) { return json(400, { ok: false, error: 'JSON inválido' }); }

  const discordId = String(payload.discord_id || '').trim();
  const item = String(payload.item || '').trim();
  const price = Number(payload.price);

  // Validaciones duras: nada de @everyone ni textos raros en el canal.
  if (!/^\d{15,25}$/.test(discordId)) return json(400, { ok: false, error: 'discord_id inválido' });
  if (!item || item.length > 60 || /@(everyone|here)/i.test(item)) return json(400, { ok: false, error: 'item inválido' });
  if (!isFinite(price) || price < 0 || price > 1000000) return json(400, { ok: false, error: 'price inválido' });

  // 1) Verificamos que la compra exista de verdad en economy_adjustments
  //    (si no, cualquiera podría spamear el canal desde el navegador).
  try {
    const reason = 'Compra en tienda: ' + item;
    const url = SUPABASE_URL + '/rest/v1/economy_adjustments' +
      '?discord_id=eq.' + encodeURIComponent(discordId) +
      '&reason=eq.' + encodeURIComponent(reason) +
      '&order=created_at.desc&limit=1&select=id,amount,created_at';
    const r = await request(url, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } });
    if (r.status < 200 || r.status >= 300) {
      return json(502, { ok: false, error: 'No se pudo verificar la compra (' + r.status + ')' });
    }
    const rows = JSON.parse(r.body || '[]');
    const row = rows && rows[0];
    if (!row) return json(403, { ok: false, error: 'Compra no encontrada' });
    const boughtAt = new Date(row.created_at).getTime();
    if (!isFinite(boughtAt) || (Date.now() - boughtAt) > RECENT_MS) {
      return json(403, { ok: false, error: 'La compra no es reciente' });
    }
    if (Number(row.amount) !== -price) {
      return json(403, { ok: false, error: 'El monto no coincide' });
    }
  } catch (e) {
    return json(502, { ok: false, error: 'Verificación falló: ' + e.message });
  }

  // 2) Mensaje normal del bot en el canal (no webhook)
  const content = '<@' + discordId + '> compró **' + item + '** por $' + price;
  try {
    const r = await request('https://discord.com/api/v10/channels/' + CHANNEL_ID + '/messages', {
      method: 'POST',
      headers: { Authorization: 'Bot ' + BOT_TOKEN },
      body: { content: content },
    });
    if (r.status < 200 || r.status >= 300) {
      return json(502, { ok: false, error: 'Discord respondió ' + r.status + ': ' + r.body.slice(0, 160) });
    }
    return json(200, { ok: true, content: content });
  } catch (e) {
    return json(502, { ok: false, error: e.message });
  }
};
