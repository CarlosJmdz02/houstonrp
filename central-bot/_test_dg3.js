const { getAudioUrl } = require('C:/Users/13462/OneDrive/Desktop/houston-web1ww/central-bot/node_modules/google-tts-api');
const { spawn } = require('child_process');
const ffmpeg = require('C:/Users/13462/OneDrive/Desktop/houston-web1ww/central-bot/node_modules/ffmpeg-static');
const KEY = process.env.DG_KEY;

function toWav(mp3) {
  return new Promise((res, rej) => {
    const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
      '-f', 'wav', '-ar', '16000', '-ac', '1', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const c = [];
    p.stdout.on('data', d => c.push(d));
    p.on('error', rej);
    p.on('close', x => x === 0 ? res(Buffer.concat(c)) : rej(new Error('ff ' + x)));
    p.stdin.on('error', () => {});
    p.stdin.end(mp3);
  });
}

(async () => {
  const frase = process.env.F || '10-8 para central, escena bajo control';
  const url = getAudioUrl(frase, 'es', 1, 1000);
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const mp3 = Buffer.from(await r.arrayBuffer());
  const wav = await toWav(mp3);

  const pruebas = [
    ['nova-3-general', 'es'],
    ['nova-3-general', 'es-ES'],
    ['nova-3-general', 'es-MX'],
    ['nova-3-general', undefined],
    ['nova-2-general', 'es'],
    ['whisper-large', 'es'],
  ];
  for (const [model, lang] of pruebas) {
    const q = new URLSearchParams({ model, smart_format: 'true' });
    if (lang) q.set('language', lang);
    const t0 = Date.now();
    const a = await fetch('https://api.deepgram.com/v1/listen?' + q.toString(), {
      method: 'POST', headers: { Authorization: 'Token ' + KEY, 'Content-Type': 'audio/wav' }, body: wav,
    });
    const txt = await a.text();
    let out = txt;
    let detected = '';
    try {
      const j = JSON.parse(txt);
      const alt = j.results && j.results.channels[0].alternatives[0];
      out = (alt && alt.transcript) || (j.err_code + ': ' + j.err_msg);
      detected = (j.results && j.results.channels[0].detected_language) || '';
    } catch (e) {}
    console.log((model + ' | ' + (lang || 'auto')).padEnd(34),
      (Date.now() - t0) + 'ms', detected ? '[' + detected + ']' : '', '→', out);
  }
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
