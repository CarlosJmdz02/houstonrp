// Conversión del PCM que entrega Discord (opus 48 kHz estéreo) al formato
// que necesita Whisper (mono 16 kHz Float32 en rango -1..1).
//
// IMPORTANTE: transformers.js v4 NO remuestrea. Pasar 48 kHz a Whisper hace
// que el modelo escuche la voz a 1/3 de velocidad y "entienda" basura tipo
// "¡Ah! ¡No! ¡No!..." — que era exactamente el fallo de las llamadas 911.
export const DISCORD_SAMPLE_RATE = 48000;
export const WHISPER_SAMPLE_RATE = 16000;
const RATIO = DISCORD_SAMPLE_RATE / WHISPER_SAMPLE_RATE; // 3 (entero)

/**
 * @param {Array<Int16Array|Uint8Array>} chunks frames opus decodificados,
 *   estéreo intercalado a 48 kHz (Int16). También acepta Buffer/Uint8Array.
 * @returns {Float32Array} mono a 16 kHz listo para Whisper
 */
export function pcm48kToWhisper16k(chunks) {
  const list = Array.isArray(chunks) ? chunks : [chunks];

  let totalSamples = 0;
  for (const c of list) totalSamples += c ? c.length : 0;
  if (totalSamples < RATIO * 2) return new Float32Array(0);

  // 1) estéreo 48 kHz → mono 48 kHz
  const mono = new Int16Array(Math.ceil(totalSamples / 2));
  let m = 0;
  for (const chunk of list) {
    if (!chunk || !chunk.length) continue;

    let s;
    if (chunk instanceof Int16Array) {
      s = chunk;
    } else {
      // Buffer de Node: puede venir de un pool con byteOffset IMPAR, y
      // Int16Array exige alineación de 2 bytes (si no, lanza RangeError y
      // se perdería todo el audio de la llamada).
      const bytes = Math.floor(chunk.length / 2) * 2;
      if (chunk.byteOffset % 2 === 0) {
        s = new Int16Array(chunk.buffer, chunk.byteOffset, bytes / 2);
      } else {
        const copy = new Int16Array(bytes / 2);
        new Uint8Array(copy.buffer).set(
          new Uint8Array(chunk.buffer, chunk.byteOffset, bytes)
        );
        s = copy;
      }
    }

    for (let i = 0; i + 1 < s.length; i += 2) {
      mono[m++] = (s[i] + s[i + 1]) >> 1;
    }
  }

  // 2) 48 kHz → 16 kHz con filtro paso-bajo REAL antes de decimar.
  //    El promedio de 3 muestras (filtro "box") deja pasar casi todo lo de
  //    más de 8 kHz y eso se pliega sobre la voz (aliasing): es lo que hace
  //    que "postal" salga escrito "postar". Un FIR de sinc con ventana de
  //    Hamming corta en 7.5 kHz ANTES de tomar una de cada tres muestras.
  const outLen = Math.floor(m / RATIO);
  if (outLen <= 0) return new Float32Array(0);

  const H = antiAliasKernel();
  const off = (H.length - 1) >> 1;

  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const base = i * RATIO;
    let acc = 0;
    for (let k = 0; k < H.length; k++) {
      const idx = base + k - off;
      if (idx < 0 || idx >= m) continue;
      acc += H[k] * mono[idx];
    }
    out[i] = acc / 32768;
  }
  return out;
}

// Kernel FIR: sinc truncado × ventana de Hamming. Se calcula una sola vez
// al cargar el módulo (63 taps) y se normaliza para que la ganancia en
// continua valga exactamente 1.
let KERNEL = null;
function antiAliasKernel() {
  if (KERNEL) return KERNEL;

  const TAPS = 63;
  const FC = 7500; // Hz (el Nyquist de la salida es 8000 Hz)
  const M = TAPS - 1;
  const center = M / 2;
  const w = (2 * Math.PI * FC) / DISCORD_SAMPLE_RATE;

  const h = new Float64Array(TAPS);
  let sum = 0;
  for (let i = 0; i < TAPS; i++) {
    const x = i - center;
    // h(x) = sin(2·pi·fc·x/fs) / (pi·x); en x = 0 vale 2·fc/fs
    const sinc = x === 0 ? (2 * FC) / DISCORD_SAMPLE_RATE : Math.sin(w * x) / (Math.PI * x);
    const win = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / M);
    h[i] = sinc * win;
    sum += h[i];
  }
  for (let i = 0; i < TAPS; i++) h[i] /= sum || 1;

  KERNEL = h;
  return KERNEL;
}
