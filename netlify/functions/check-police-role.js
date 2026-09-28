const https = require('https');

const SUPABASE_FN_URL = 'https://qqgtroxrkccftlrpqwsk.supabase.co/functions/v1/check-police-role';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const body = event.body || '{}';

  try {
    const result = await new Promise((resolve, reject) => {
      const req = https.request(SUPABASE_FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let out = '';
        res.on('data', (c) => out += c);
        res.on('end', () => resolve({ status: res.statusCode, body: out }));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    return {
      statusCode: result.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: result.body,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowed: false, error: err.message }),
    };
  }
};
