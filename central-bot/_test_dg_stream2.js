const { getAudioUrl } = require('C:/Users/13462/OneDrive/Desktop/houston-web1ww/central-bot/node_modules/google-tts-api');
const { spawn } = require('child_process');
const ffmpeg = require('C:/Users/13462/OneDrive/Desktop/houston-web1ww/central-bot/node_modules/ffmpeg-static');
const WebSocket = require('ws');
const KEY = process.env.DG_KEY;

function toPcm(mp3) {
  return new Promise((res, rej) => {
    const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
      '-f', 's16le', '-ar', '16000', '-ac', '1', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const c = [];
    p.stdout.on('data', d => c.push(d));
    p.on('error', rej);
    p.on('close', x => x === 0 ? res(Buffer.concat(c)) : rej(new Error('ff ' + x)));
    p.stdin.on('error', () => {});
    p.stdin.end(mp3);
  });
}

function streamOnce(model, pcm, extra) {
  return new Promise((resolve) => {
    const qs = new URLSearchParams({
      model, encoding: 'linear16', sample_rate: '16000', channels: '1',
      interim_results: 'true', endpointing: '300', smart_format: 'true',
      ...(extra || {}),
    });
    const url = 'wss://api.deepgram.com/v1/listen?' + qs.toString();
    const finals = [];
    let err = null;
    const ws = new WebSocket(url, { headers: { Authorization: 'Token ' + KEY } });
    const done = () => { try { ws.close(); } catch {} resolve({ finals, err }); };
    const kill = setTimeout(done, 25000);
    ws.on('open', () => {
      const frame = Math.floor(16000 * 2 / 50);
      let i = 0;
      const iv = setInterval(() => {
        if (i >= pcm.length) { clearInterval(iv); ws.send(JSON.stringify({ type: 'CloseStream' })); setTimeout(done, 1500); return; }
        ws.send(pcm.subarray(i, i + frame));
        i += frame;
      }, 20);
    });
    ws.on('message', (d) => {
      try {
        const j = JSON.parse(d.toString());
        if (j.type === 'Results') {
          const alt = j.channel && j.channel.alternatives && j.channel.alternatives[0];
          if (alt && alt.transcript && (j.is_final || j.speech_final)) finals.push(alt.transcript);
        } else if (j.type === 'Error') err = j.description || 'error';
      } catch (e) {}
    });
    ws.on('error', (e) => { err = e.message; clearTimeout(kill); done(); });
    ws.on('close', () => { clearTimeout(kill); done(); });
  });
}

(async () => {
  const frase = process.env.F || '10-8 para central, escena bajo control, código 4';
  const url = getAudioUrl(frase, 'es', 1, 1000);
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const pcm = await toPcm(Buffer.from(await r.arrayBuffer()));
  console.log('frase:', frase);

  const pruebas = [
    ['nova-3-general + language es', 'nova-3-general', { language: 'es' }],
    ['nova-3-general + keyterms', 'nova-3-general', { keyterm: ['10-8', '10-6', '10-7', 'central', 'código'].join('|') }],
    ['nova-3-general + es + keyterms', 'nova-3-general', { language: 'es', keyterm: ['10-8', '10-6', 'central'].join('|') }],
    ['nova-3-general auto', 'nova-3-general', {}],
  ];
  for (const [label, model, extra] of pruebas) {
    const res = await streamOnce(model, pcm, extra);
    console.log('—', label, res.err ? '| ERR ' + res.err : '');
    console.log('   →', JSON.stringify(res.finals.join(' ')));
  }
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
