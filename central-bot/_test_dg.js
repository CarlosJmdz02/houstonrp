const { getAudioUrl } = require('C:/Users/13462/OneDrive/Desktop/houston-web1ww/central-bot/node_modules/google-tts-api');
const { spawn } = require('child_process');
const ffmpeg = require('C:/Users/13462/OneDrive/Desktop/houston-web1ww/central-bot/node_modules/ffmpeg-static');
const KEY = process.env.DG_KEY;

const frases = [
  '10-8 para central',
  'código 4, la escena está bajo control',
  'necesito un médico, hay un herido aquí',
  '1kilo01 para central muestrame 10-6',
];

function toWav(mp3) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
      '-f', 'wav', '-ar', '16000', '-ac', '1', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const c = [];
    p.stdout.on('data', d => c.push(d));
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(Buffer.concat(c)) : reject(new Error('ffmpeg ' + code)));
    p.stdin.on('error', () => {});
    p.stdin.end(mp3);
  });
}

(async () => {
  for (const f of frases) {
    const url = getAudioUrl(f, 'es', 1, 1000);
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const mp3 = Buffer.from(await r.arrayBuffer());
    const wav = await toWav(mp3);

    const fd = new FormData();
    fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'a.wav');
    fd.append('model', 'nova-3-multilingual');
    fd.append('language', 'es');
    fd.append('smart_format', 'true');
    fd.append('encoding', 'linear16');
    fd.append('sample_rate', '16000');

    const t0 = Date.now();
    const r2 = await fetch('https://api.deepgram.com/v1/listen', {
      method: 'POST', headers: { Authorization: 'Token ' + KEY }, body: fd,
    });
    const j = await r2.json();
    const txt = (j.results && j.results.channels && j.results.channels[0]
      && j.results.channels[0].alternatives && j.results.channels[0].alternatives[0]
      && j.results.channels[0].alternatives[0].transcript) || JSON.stringify(j).slice(0, 160);
    console.log((Date.now() - t0) + 'ms | "' + f + '"  →  "' + txt + '"');
  }
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
