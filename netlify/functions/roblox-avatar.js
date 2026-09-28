const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`API returned ${res.statusCode}`));
        resolve(JSON.parse(body));
      });
    }).on('error', reject);
  });
}

async function resolveUsername(username) {
  const data = await new Promise((resolve, reject) => {
    const postData = JSON.stringify({ usernames: [username], excludeBannedUsers: true });
    const req = https.request('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0'
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Roblox users API: ${res.statusCode}`));
        resolve(JSON.parse(body));
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
  if (!data.data || data.data.length === 0) throw new Error('Username not found');
  return data.data[0].id;
}

exports.handler = async (event) => {
  const path = event.path.replace('/.netlify/functions/roblox-avatar/', '').replace(/\/$/, '');

  try {
    let userId;

    if (path.startsWith('by-username/')) {
      const username = decodeURIComponent(path.replace('by-username/', ''));
      if (!username) {
        return { statusCode: 400, body: 'Username is required' };
      }
      userId = await resolveUsername(username);
    } else {
      userId = path;
      if (!userId || !/^\d+$/.test(userId)) {
        return { statusCode: 400, body: 'Invalid user ID' };
      }
    }

    const apiUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`;
    const data = await fetchJson(apiUrl);

    const imageUrl = data?.data?.[0]?.imageUrl;
    if (!imageUrl || data?.data?.[0]?.state !== 'Completed') {
      return { statusCode: 404, body: 'No avatar available' };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
      body: JSON.stringify({ url: imageUrl, userId: Number(userId) }),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
  }
};
