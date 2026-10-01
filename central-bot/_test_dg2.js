const { getAudioUrl } = require('C:/Users/13462/OneDrive/Desktop/houston-web1ww/central-bot/node_modules/google-tts-api');
const { spawn } = require('child_process');
const ffmpeg = require('C:/Users/13462/OneDrive/Desktop/houston-web1ww/central-bot/node_modules/ffmpeg-static');
const KEY = process.env.DG_KEY;

const frases = [
  '10-8 para central',
  'código 4, la escena está bajo control',
  'necesito un médico, hay un herido aquí',
  '1kilo01 para central muestrame 10-6',
  'oficial caído, pánico activo en el código postal 404',
];

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
  const model = process.env.DG_MODEL || 'nova-3-general';
  for (const f of frases) {
    const url = getAudioUrl(f, 'es', 1, 1000);
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const mp3 = Buffer.from(await r.arrayBuffer());
    const wav = await toWav(mp3);
    const q = new URLSearchParams({ model, language: 'es', smart_format: 'true' });
    const t0 = Date.now();
    const a = await fetch('https://api.deepgram.com/v1/listen?' + q.toString(), {
      method: 'POST', headers: { Authorization: 'Token ' + KEY, 'Content-Type': 'audio/wav' }, body: wav,
    });
    const txt = await a.text();
    let out = txt;
    try { const j = JSON.parse(txt); out = (j.results && j.results.channels[0].alternatives[0].transcript) || (j.err_code + ': ' + j.err_msg); } catch (e) {}
    console.log((Date.now() - t0) + 'ms | ' + f + '  →  ' + out);
  }
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
