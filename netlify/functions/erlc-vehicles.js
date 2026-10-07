const https = require('https');

// Proxy del servidor de ER:LC. La API key vive en el servidor (env var
// ERLC_SERVER_KEY); el fallback es el mismo que ya usa erlc-check.js.
const SERVER_KEY = process.env.ERLC_SERVER_KEY || 'VXBTbuMPczqSTiiXBSEl-YSYZNffTyTZCzmSjFdTdUFNdIygwcnZMGwsmYZfL';
const ERLC_URL = 'https://api.erlc.gg/v2/server?Vehicles=true&Players=true';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(status, body) {
  return { statusCode: status, headers: HEADERS, body: JSON.stringify(body) };
}

function fetchJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: { 'server-key': SERVER_KEY, 'User-Agent': 'Mozilla/5.0' },
      timeout: timeoutMs,
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('ERLC ' + res.statusCode + ' ' + body.slice(0, 150)));
        }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  try {
    const data = await fetchJson(ERLC_URL, 8000);

    const vehicles = (data.Vehicles || []).map((v) => ({
      plate: v.Plate || '',
      model: v.Name || '',
      owner: v.Owner || '',
      color: v.ColorName || '',
      colorHex: v.ColorHex || '',
      texture: v.Texture || '',
    }));

    const players = (data.Players || []).map((p) => {
      const raw = String(p.Player || '');
      const parts = raw.split(':');
      return {
        username: parts[0] || '',
        robloxId: parts[parts.length - 1] || '',
        permission: p.Permission || '',
        team: p.Team || '',
        wanted: Number(p.WantedStars) || 0,
        postal: (p.Location && p.Location.PostalCode) || '',
        street: (p.Location && p.Location.StreetName) || '',
        building: (p.Location && p.Location.BuildingNumber) || '',
      };
    });

    return json(200, {
      ok: true,
      server: data.Name || '',
      online: data.CurrentPlayers || 0,
      max: data.MaxPlayers || 0,
      vehicles,
      players,
      fetchedAt: Date.now(),
    });
  } catch (err) {
    return json(502, { ok: false, error: err.message });
  }
};
