const https = require('https');

exports.handler = async (event) => {
  const username = decodeURIComponent(
    event.path.replace('/.netlify/functions/roblox-resolve/', '').replace(/\/$/, '')
  );

  if (!username) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Username is required' }) };
  }

  try {
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

    if (!data.data || data.data.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Username not found' }) };
    }

    const userId = data.data[0].id;
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
      body: JSON.stringify({ userId, username }),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
  }
};
