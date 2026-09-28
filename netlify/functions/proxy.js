const https = require('https');
const http = require('http');

function agentFetch(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const mod = urlObj.protocol === 'https:' ? https : http;
    const req = mod.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

exports.handler = async (event) => {
  const queryParams = event.queryStringParameters || {};
  const path = queryParams.path || '';

  // Build the full ER:LC API URL
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (key !== 'path') {
      searchParams.set(key, value);
    }
  }
  const qs = searchParams.toString();
  const apiUrl = `https://api.erlc.gg${path}${qs ? '?' + qs : ''}`;

  // Get server key from client header or env
  const serverKey = event.headers['server-key'] || event.headers['Server-Key'] || process.env.ERLC_SERVER_KEY || "VXBTbuMPczqSTiiXBSEl-YSYZNffTyTZCzmSjFdTdUFNdIygwcnZMGwsmYZfL";
  if (!serverKey) {
    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'server-key, content-type',
      },
      body: JSON.stringify({ error: 'ERLC_SERVER_KEY not configured' }),
    };
  }

  try {
    const method = event.httpMethod || 'GET';
    const body = ['GET', 'HEAD'].includes(method)
      ? undefined
      : (event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : event.body);
    const result = await agentFetch(apiUrl, {
      method,
      headers: {
        'server-key': serverKey,
        'User-Agent': 'Mozilla/5.0',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
    });

    return {
      statusCode: result.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'server-key, content-type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: result.body,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'server-key, content-type',
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
