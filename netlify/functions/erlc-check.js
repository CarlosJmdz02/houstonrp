const https = require('https');

function fetchJson(url, options) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`ER:LC API: ${res.statusCode} ${body.slice(0, 200)}`));
        }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

exports.handler = async (event) => {
  let robloxId = '';
  if (event.path) {
    const parts = event.path.replace(/\/+$/, '').split('/');
    robloxId = parts[parts.length - 1];
  }
  if (!robloxId || !/^\d+$/.test(robloxId)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Invalid robloxId' }),
    };
  }

  const serverKey = process.env.ERLC_SERVER_KEY || "VXBTbuMPczqSTiiXBSEl-YSYZNffTyTZCzmSjFdTdUFNdIygwcnZMGwsmYZfL";

  try {
    const data = await fetchJson('https://api.erlc.gg/v2/server?Players=true', {
      method: 'GET',
      headers: { 'server-key': serverKey, 'User-Agent': 'Mozilla/5.0' },
    });
    const players = data.Players || [];
    const player = players.find(p => {
      const parts = (p.Player || '').split(':');
      return parts[parts.length - 1] === robloxId;
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ robloxId: Number(robloxId), inServer: !!player, team: player ? player.Team : null }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
