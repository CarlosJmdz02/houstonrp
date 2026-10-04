// ============================================================
// transcriber.js — Motor de transcripción (nivel 3 de respaldo)
// ------------------------------------------------------------
// central.js llama a:  transcribe(float32, { language: 'spanish' })
// con el PCM ya convertido por pcm.js (mono 16 kHz, -1..1).
//
// Orden real en central.js:
//   1) Deepgram      (si hay DEEPGRAM_API_KEY)
//   2) Groq whisper  (si hay GROQ_API_KEY / STT_API_KEY)   ← el habitual
//   3) ESTE ARCHIVO  (solo si los dos anteriores fallaron)
//
// Usa la misma API de Groq que el nivel 2, con el modelo turbo
// para que el respaldo también sea rápido.
// ============================================================

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = process.env.STT_MODEL || 'whisper-large-v3-turbo';

function apiKey() {
  return process.env.STT_API_KEY || process.env.GROQ_API_KEY || '';
}

/** Float32 (-1..1) 16 kHz → WAV 16-bit mono, listo para la API. */
function floatToWav(float32, sampleRate) {
  const n = float32.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);          // PCM
  view.setUint16(22, 1, true);          // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, n * 2, true);

  let off = 44;
  for (let i = 0; i < n; i++, off += 2) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return Buffer.from(buffer);
}

/**
 * @param {Float32Array} audio mono 16 kHz en rango -1..1 (sale de pcm.js)
 * @param {{language?: string}} opts
 * @returns {Promise<string>} texto transcrito ('' si no se pudo)
 */
export async function transcribe(audio, opts = {}) {
  const key = apiKey();
  if (!key || !audio || !audio.length) return '';

  let wav;
  try {
    wav = floatToWav(audio, 16000);
  } catch (_) {
    return '';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const fd = new FormData();
    fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
    fd.append('model', MODEL);
    fd.append('language', opts.language || 'es');
    fd.append('response_format', 'json');

    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: fd,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn('[transcriber] Groq HTTP ' + res.status);
      return '';
    }
    const j = await res.json();
    return String((j && j.text) || '').trim();
  } catch (e) {
    console.warn('[transcriber] fallo:', e.message);
    return '';
  } finally {
    clearTimeout(timer);
  }
}

export default transcribe;
