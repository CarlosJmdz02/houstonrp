const KEY = process.env.GROQ_KEY;
const SYS = 'Sos central de despacho de radio de una policia de roleplay. Respondé SOLO con un objeto JSON sin texto extra: {"reply":"..."} en español, empieza con "10-4", menciona el codigo y su significado, max 120 caracteres.';

(async () => {
  // 1) clave válida
  const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + KEY } });
  console.log('models HTTP', r.status);
  if (!r.ok) { console.log((await r.text()).slice(0, 200)); process.exit(1); }
  const j = await r.json();
  const ids = (j.data || []).map(x => x.id);
  console.log('whisper-large-v3:', ids.includes('whisper-large-v3'));
  console.log('llama-3.3-70b-versatile:', ids.includes('llama-3.3-70b-versatile'));

  // 2) IA de redacción (latencia)
  let t0 = Date.now();
  const r2 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile', temperature: 0.2, max_tokens: 140,
      messages: [{ role: 'system', content: SYS }, { role: 'user', content: 'para central mostrarme 10 o 8' }],
    }),
  });
  const j2 = await r2.json();
  const txt = (j2.choices && j2.choices[0] && j2.choices[0].message && j2.choices[0].message.content) || '';
  console.log('LLM HTTP', r2.status, (Date.now() - t0) + 'ms');
  console.log('LLM dice:', txt.slice(0, 200));

  // 3) STT: genero un WAV en español con Google TTS y lo mando a whisper-large-v3
  const { getAudioUrl } = require('./node_modules/google-tts-api');
  const { spawn } = require('child_process');
  const phrase = 'para central mostrame diez ocho en servicio';
  const url = getAudioUrl(phrase, 'es', 1, 1000);
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const mp3 = Buffer.from(await res.arrayBuffer());
  console.log('mp3', mp3.length, 'bytes (frase:', phrase + ')');

  const ffmpeg = require('./node_modules/ffmpeg-static');
  const pcm = await new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 's16le', '-ar', '16000', '-ac', '1', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks = [];
    proc.stdout.on('data', d => chunks.push(d));
    proc.on('error', reject);
    proc.on('close', c => c === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('ffmpeg ' + c)));
    proc.stdin.on('error', () => {});
    proc.stdin.end(mp3);
  });
  console.log('pcm16k', pcm.length, 'bytes (' + (pcm.length / 2 / 16000).toFixed(1) + 's)');

  // WAV 16 kHz mono 16 bits
  const n = pcm.length / 2;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(16000, 24); buf.writeUInt32LE(32000, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  pcm.copy(buf, 44);

  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'audio/wav' }), 'speech.wav');
  fd.append('model', 'whisper-large-v3');
  fd.append('language', 'es');
  fd.append('response_format', 'json');
  t0 = Date.now();
  const r3 = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + KEY }, body: fd,
  });
  const j3 = await r3.json().catch(() => ({}));
  console.log('STT HTTP', r3.status, (Date.now() - t0) + 'ms');
  console.log('STT escuchó:', JSON.stringify(j3.text || j3));
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
