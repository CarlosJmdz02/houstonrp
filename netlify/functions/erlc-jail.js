const https = require('https');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function request(url, options) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body,
      }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function sendCommand(command, serverKey, maxAttempts) {
  let last = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await request('https://api.erlc.gg/v2/server/command', {
      method: 'POST',
      headers: {
        'server-key': serverKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      body: JSON.stringify({ command }),
    });

    if (res.status >= 200 && res.status < 300) return res;
    if (res.status === 429) {
      last = res;
      let retryAfter = 1;
      try {
        const data = JSON.parse(res.body);
        if (typeof data.retry_after === 'number') retryAfter = data.retry_after;
      } catch (_) {}
      const headerRetry = parseFloat(res.headers['retry-after']);
      if (!isNaN(headerRetry) && headerRetry >= 0) retryAfter = headerRetry;
      if (attempt < maxAttempts - 1) {
        await sleep((retryAfter + 0.5) * 1000);
        continue;
      }
      break;
    }
    throw new Error(`ER:LC API: ${res.status} ${res.body.slice(0, 200)}`);
  }

  let detail = '';
  if (last) {
    try {
      const data = JSON.parse(last.body);
      detail = data.message ? ` — ${data.message}` : '';
    } catch (_) {}
  }
  throw new Error('La API de ER:LC está saturada. Espera unos segundos e inténtalo de nuevo.' + detail);
}

async function getEgressIp() {
  try {
    const res = await request('https://api.ipify.org?format=json', {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (res.status >= 200 && res.status < 300) {
      const data = JSON.parse(res.body);
      if (data.ip) return data.ip;
    }
  } catch (_) {}
  return null;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const serverKey = process.env.ERLC_SERVER_KEY || "VXBTbuMPczqSTiiXBSEl-YSYZNffTyTZCzmSjFdTdUFNdIygwcnZMGwsmYZfL";

  try {
    const { username, months } = JSON.parse(event.body || '{}');
    if (!username) throw new Error('Falta el usuario de Roblox');

    const minutes = parseInt(months, 10);
    if (!minutes || minutes <= 0) throw new Error('El arresto no tiene tiempo de prisión');
    if (minutes > 60) throw new Error('Máximo 60 minutos (60 meses) por condena en ER:LC');

    const res = await sendCommand(`:jail ${username} ${minutes}`, serverKey, 4);
    const data = JSON.parse(res.body);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, username, minutes, result: data }),
    };
  } catch (err) {
    const msg = err.message || 'Error desconocido';
    if (msg.includes('403') || msg.includes('not authorized')) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: 'La IP de Netlify no está autorizada en ER:LC. Usa el endpoint de server.js (IP fija) en lugar de esto.',
          ip: await getEgressIp().catch(() => null),
          hint: 'Configura HRP_JAIL_EXECUTOR_URL en auth.js apuntando a tu server.js con IP pública fija.',
        }),
      };
    }
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: msg }),
    };
  }
};