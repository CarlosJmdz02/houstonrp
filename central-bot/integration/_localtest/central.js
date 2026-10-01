/* ════════════════════════════════════════════════════════════════
   CENTRAL / DISPATCH (voz) — módulo del Houston Hub
   ────────────────────────────────────────────────────────────────
   LOS OFICIALES LE HABLAN POR VOZ (no hace falta escribir):
     "10-8 para central"      → el bot TRANSCRIBE (whisper) y responde
                                POR VOZ: "10-4 te marco en 10-8 en servicio."
     "muéstrame en 10-7"      → marca 10-7 en la web (por el ID de Discord
                                de quien está hablando, no por la placa).
     Sin turno activo         → "10-2 no has iniciado tu turno".
     "prueba de voz"          → "Prueba de voz. Central en línea."
   También sigue funcionando escribiendo en el chat del canal de voz.

   • Vive en CENTRAL_VOICE_CHANNEL_ID (1285846829522616375 =
     👮│Law Enforcement Radio) y solo está ACTIVO con más de 2 humanos.
   • NO toca utils/emergency911.js: reutiliza su motor de transcripción
     (transcriber.js/pcm.js) y cede el audio si el 911 ya lo está tomando.
   ════════════════════════════════════════════════════════════════ */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
  EndBehaviorType,
} from '@discordjs/voice';
import ffmpegStatic from 'ffmpeg-static';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Sonido de ALERTA de pánico (se reproduce antes del aviso hablado).
const ALERT_FILE = path.join(__dirname, '..', 'sounds', 'alerta_panico.wav');
const SOUND_911_FILE = path.join(__dirname, '..', 'sounds', 'llamada_911.wav');
const CENTRAL_ACTIVO_FILE = path.join(__dirname, '..', 'sounds', 'central_activo.wav');
let lastCallAt = 0;   // última llamada 911 detectada (para no pelear con el 911)
// Silencio de la RADIO mientras hay un 10-80 (persecución activa).
// NO se interrumpe la radio: ni TTS ni sonidos. Solo "código 4" lo reactiva.
let mute1080 = false;
let lastSilentNote = 0;
let lastShiftCheck = 0;

// opusscript comparte UN SOLO heap nativo entre todos los decodificadores
// Y el codificador del reproductor (TTS). Cuando una aserción de libopus
// aborta ese heap, se muere TODO (ya no se habla ni se escucha).
// Solución: 1) mis decodificadores viven en la build asm.js (wasm:false),
// en un heap DISTINTO al del reproductor; 2) si el módulo llega a abortar,
// se recarga entero → el bot se REPARA SOLO, sin reiniciar.
const requireOpus = createRequire(import.meta.url);
let OpusCtor = null;

function loadOpus() {
  if (!OpusCtor) OpusCtor = requireOpus('opusscript');
  return OpusCtor;
}

function reloadOpus(reason) {
  console.warn('[central] ♻️ recargando módulo opus (' + reason + ')');
  try {
    for (const k of Object.keys(requireOpus.cache)) {
      if (k.indexOf('opusscript') !== -1) delete requireOpus.cache[k];
    }
  } catch {}
  OpusCtor = null;
  decoders.clear();   // los viejos se tiran SIN delete(): el heap muere con el módulo
  try { loadOpus(); } catch (e) { console.warn('[central] recarga opus falló:', e.message); }
}
import { pcm48kToWhisper16k } from './pcm.js';
import { transcribe } from './transcriber.js';

// ── Configuración ───────────────────────────────────────────────────
const VOICE_CHANNEL_ID = process.env.CENTRAL_VOICE_CHANNEL_ID || '1285846829522616375';
// Canales donde se derivan los pedidos (no se toca el proyecto de 911)
const MEDICAL_CHANNEL_ID = process.env.MEDICAL_CHANNEL_ID || '1285846829522616377';  // atención médica
const TOW_CHANNEL_ID = process.env.TOW_CHANNEL_ID || '1285846829522616376';          // grúas
const GUILD_ID = process.env.GUILD_ID || null;
const MIN_PEOPLE = Number(process.env.CENTRAL_MIN_PEOPLE || 2);
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qqgtroxrkccftlrpqwsk.supabase.co').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_ZTcgdobN4BxLtxo59UUCuA_raeLls6H';

// ── STT: IA en la nube (opcional, mucho más inteligente) ────────────
// Con STT_API_KEY (Groq u OpenAI-compatible) se transcribe con
// whisper-large-v3 en la nube: mucho mejor en español y ~1 s en vez de
// los 2-3 s del whisper-tiny local (que es lo único que cabe en esta RAM).
// SIN clave → se usa el motor local (el mismo del 911). Sin romper nada.
const STT_KEY = process.env.STT_API_KEY || process.env.GROQ_API_KEY || '';
const STT_URL = process.env.STT_BASE_URL || 'https://api.groq.com/openai/v1/audio/transcriptions';
const STT_MODEL = process.env.STT_MODEL || 'whisper-large-v3';
// Deepgram (transcripción principal): el único que respeta los números
// en español ("10-8"), sin límite de peticiones por minuto.
const DG_KEY = process.env.DEEPGRAM_API_KEY || '';
const DG_MODEL = process.env.DEEPGRAM_STT_MODEL || 'whisper-large';
const DG_URL = 'https://api.deepgram.com/v1/listen';
let dgCooldownUntil = 0;
let dgWarnAt = 0;
function dgWarn(msg) {
  const now = Date.now();
  if (now - dgWarnAt < 60000) return;
  dgWarnAt = now;
  console.warn('[central] ⚠️ Deepgram:', msg);
}
let sttFails = 0;
let sttEngineLogged = false;

// Silencio que corta el turno de voz (1,5 s: menos corta palabras largas)
const SILENCE_MS = 750;    // 0,75 s: Deepgram transcribe rápido, no hace falta esperar    // 0,9 s: arranca antes la transcripción   // más rápido: 1,1 s de silencio cierra la frase
const MAX_UTTERANCE_MS = 30000;

const STATUS_CODES = [
  '10-5', '10-6', '10-7', '10-8', '10-11', '10-15',
  '10-23', '10-50', '10-80', '10-97', '10-98', '10-99', '10-100',
];
export const MSG_NO_SHIFT = 'Negativo, no has iniciado tu turno.';

// Lo que SIGNIFICA cada código (el mismo texto del MDT) para decirlo al hablar.
const CODE_LABELS = {
  '10-5': 'vigilancia',
  '10-6': 'ocupado',
  '10-7': 'fuera de servicio',
  '10-8': 'en servicio',
  '10-11': 'detención de tráfico',
  '10-15': 'persona bajo custodia',
  '10-23': 'llegó a la escena',
  '10-50': 'accidente grave',
  '10-80': 'persecución activa',
  '10-97': 'en ruta',
  '10-98': 'disponible',
  '10-99': 'oficial en apuros',
  '10-100': 'oficial caído, pánico',
};
export function labelFor(code) { return CODE_LABELS[code] || ''; }
/** "10-4, te marco en 10-11, detención de tráfico." */
export function replyFor(code, prefix = 'Copiado, te marco en ', tail = '') {
  const l = labelFor(code);
  const body = l ? `${prefix}${code}, ${l}.` : `${prefix}${code}.`;
  return body + (tail ? ' ' + tail : '');
}

// ── Texto (chat y voz) ──────────────────────────────────────────────
function normalizeCode(n) {
  const c = '10-' + String(n).replace(/^0+/, '');
  return STATUS_CODES.includes(c) ? c : null;
}

/** Minúsculas, sin acentos y espacios simples (para comparar lo que dice whisper). */
function normalizeVoice(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // ── correcciones de lo que suele transcribir whisper ──
    .replace(/\bparacentral\b/g, 'para central')
    .replace(/\bcentr(?:arlo|arle|amos|ales|ando|ado|ar|al|o)\b/g, 'central')
    .replace(/\bdiaz\b/g, 'diez')
    .replace(/\bmuetrame\b|\bmueteme\b|\bmuetime\b/g, 'muestra')
    .replace(/\bpersecusion\b/g, 'persecucion')
    .replace(/\bambualncia\b|\bambulansia\b/g, 'ambulancia')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dicho en español → código 10-x (whisper-tiny a veces no aclara los números). */
const PHRASE_TO_CODE = [
  [/fuera\s+de\s+servicio/, '10-7'],
  [/en\s+servicio/, '10-8'],
  [/vigilanc/, '10-5'],
  [/detencion|detenid|aprehendid/, '10-11'],
  [/sospechos|bajo custodia|custodia/, '10-15'],
  [/accidente|choque/, '10-50'],
  [/persecucion|persecution/, '10-80'],
  [/en\s+ruta|\bcamino\b|\bruta\b|yendo/, '10-97'],
  [/llegue|en\s+el\s+lugar|en\s+escena/, '10-23'],
  [/ocupad/, '10-6'],
  [/disponible/, '10-98'],
  [/apuros/, '10-99'],
  [/oficial\s+caid|panico/, '10-100'],
];

/** Acepta "10-8", "10 8", "diez ocho" y (en voz) frases hechas. */
export function extractStatusCode(text, fromVoice) {
  if (!text) return null;

  const direct = String(text).match(/\b10\s*(?:[-\u2013\u2014.,]|\s*(?:o|u|y|e)\s*)?\s*(\d{1,3})\b/i);
  if (direct) {
    const c = normalizeCode(direct[1]);
    if (c) return c;
  }

  const words = normalizeVoice(text).replace(/\bdiaz\b/g, 'diez').match(/\bdiez\s*[-\u2013\u2014]?\s*([\w-]+)/);
  if (words) {
    // "diez 8", "diez-8", "diez ocho"…
    if (/^\d{1,3}$/.test(words[1])) {
      const cd = normalizeCode(words[1]);
      if (cd) return cd;
    }
    const map = { ocho: '8', siete: '7', cinco: '5', seis: '6', once: '11', quince: '15',
      veintitres: '23', cincuenta: '50', noventasiete: '97', noventayocho: '98',
      noventinueve: '99', cien: '100' };
    const c = map[words[1]];
    if (c) return normalizeCode(c);
  }

  if (fromVoice) {
    const t = normalizeVoice(text);
    for (const [re, code] of PHRASE_TO_CODE) {
      if (re.test(t)) return code;
    }
  }
  return null;
}

/** Pide ATENCIÓN MÉDICA. */
export function wantsMedical(text) {
  if (!text) return false;
  const t = normalizeVoice(text);
  return /\batencion\s+medica\b|\bmedico\b|\bambulancia\b|\bparamedico\b|\bherid|\bpaciente\b|\bems\b|\basistencia\s+medica\b|\bnecesito\s+un\s+medico\b/.test(t);
}

/** Pide GRÚA / auxilio mecánico. */
export function wantsTow(text) {
  if (!text) return false;
  const t = normalizeVoice(text);
  return /\bgrua\b|\bremolque\b|\btow\b|\bgruero\b|\bauxilio\s+mecanico\b|\bvarad/.test(t);
}

/**
 * "Disparos, disparos, disparos" / "Shot's fired" = PÁNICO (10-100).
 */
export function esDisparos(text) {
  if (!text) return false;
  const t = normalizeVoice(text);
  if (/\bshot['’]?s?\s*fired\b/.test(t)) return true;
  const d = (t.match(/\bdisparos?\b|\bdisparand\w*/g) || []).length;
  if (d >= 2) return true;
  if (d >= 1 && /\bayuda|urgent|nos\s+disparan|bajen|disparand|fuego|tiros/.test(t)) return true;
  return false;
}

/** ¿Le está hablando a central? Tolera lo que transcribe whisper-tiny. */
export function wantsCentral(text, fromVoice) {
  if (!text) return false;
  const plain = normalizeVoice(text);
  if (/\bpara\s*centr/.test(plain)) return true;     // "para central", "para centrarlo"
  if (fromVoice) {
    if (/\bcentral\b/.test(plain)) return true;        // "central" (palabra exacta)
    if (/\bpara\s+centr\w*/.test(plain)) return true;  // "para centrar…" (errores de STT)
    if (/\bpara\s+entr\w*/.test(plain)) return true;   // "para entrar" ≈ "para central"
  }
  return /\bcentral\s*,/i.test(text);
}

// ── Ubicación del oficial (la pide por voz o chat) ──────────────────
const PRC_KEY = process.env.PRC_SERVER_KEY || process.env.ERLC_SERVER_KEY || '';
const PRC_BASE = (process.env.PRC_BASE_URL || 'https://api.erlc.gg').replace(/\/$/, '');

export function wantsLocation(text) {
  if (!text) return false;
  const t = normalizeVoice(text);
  return /\bdonde estoy\b|\bdonde me encuentro\b|\bmi ubicacion\b|\ben que zona\b|\bque calle\b|\bque postal\b|\bcual es mi postal\b|\bdonde me encuentras\b/.test(t);
}

/** Discord → fila de characters (roblox / roblox_id). */
async function findCharacter(discordId) {
  const url = `${SUPABASE_URL}/rest/v1/characters?user_discord=eq.${encodeURIComponent(discordId)}&select=roblox,roblox_id&limit=1`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) throw new Error('characters HTTP ' + res.status);
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) throw new Error('NO_FICHA');
  return rows[0];
}

/** Ubicación en vivo del oficial desde la API de ER:LC. */
export async function locationOf(discordId) {
  if (!PRC_KEY) throw new Error('falta PRC_SERVER_KEY');
  const char = await findCharacter(discordId);   // lanza NO_FICHA si no existe

  const res = await fetch(`${PRC_BASE}/v2/server?Players=true`, {
    headers: { 'server-key': PRC_KEY },
  });
  if (!res.ok) throw new Error('ERLC HTTP ' + res.status);
  const data = await res.json();
  const players = Array.isArray(data.Players) ? data.Players : [];

  const rid = char.roblox_id ? String(char.roblox_id) : null;
  const raw = char.roblox ? String(char.roblox) : '';
  const parts = raw.split(':');
  const rname = parts[0] ? parts[0].toLowerCase().trim() : '';
  const ridFromName = parts[1] ? parts[1].trim() : null;

  for (const p of players) {
    const ps = String(p.Player || '');
    const [pname, pid] = ps.split(':');
    if (rid && pid && String(pid) === rid) return p.Location || null;
    if (ridFromName && pid && String(pid) === ridFromName) return p.Location || null;
    if (rname && pname && pname.toLowerCase().trim() === rname) return p.Location || null;
  }
  return null;
}

/** "código postal 404, Independence Parkway" (sin acentos raros para el TTS). */
function locationPhrase(loc) {
  if (!loc) return '';
  const postal = loc.PostalCode ? `código postal ${loc.PostalCode}` : '';
  const street = [loc.BuildingNumber, loc.StreetName].filter(Boolean).join(' ');
  return [postal, street].filter(Boolean).join(', ');
}

function locationReply(loc) {
  if (!loc) return 'Negativo, no te encuentro en el servidor.';
  const p = locationPhrase(loc);
  return p ? `Estás en ${p}.` : 'Negativo, no tengo tu ubicación ahora mismo.';
}

/**
 * "código 4" / "cod 4" / "code 4" = la escena quedó BAJO CONTROL.
 * (Ojo: NO confundir con "10-4", que es un simple acuse.)
 */
export function esCodigo4(text) {
  if (!text) return false;
  const t = normalizeVoice(text);
  if (/\b10\s*-/.test(t)) return false;   // "10-4", "10-40"… no son código 4

  // "código 4" / "codigo 4" / "code 4" / "código cuatro"
  if (/\bcod(?:e|igo|i)?\s*[-–—.]?\s*(4|cuatro)\b/.test(t)) return true;

  // "la escena ya está en 4" / "todo en código 4"
  if (/\b(escena|situacion|lugar|sitio|todo)\b[^.]{0,30}\ben\s+(?:cod(?:e|igo|i)?\s*[-–—.]?\s*)?(4|cuatro)\b/.test(t)) return true;

  // "ya nos podemos retirar de la escena" (escena resuelta)
  if (/\bretir\w*/.test(t) && /\bescena|situacion|todo\s+bien|ya\s+esta\s+bien/.test(t)) return true;

  return false;
}

const COD4_REPLIES = [
  () => 'Copiado, código 4: escena bajo control, todo en orden.',
  () => 'Recibido: código 4. Ya está todo bien, pueden retirarse de la escena.',
  () => 'Copiado. Escena en código 4: situación normal, todo bajo control.',
  () => 'Perfecto, código 4. Todo en orden, pueden retirarse.',
  () => 'Anotado: código 4. Pasó de mal a bien: escena bajo control.',
];
let cod4Rot = 0;
function variedCod4() {
  return COD4_REPLIES[cod4Rot++ % COD4_REPLIES.length]();
}

/** Variantes para no decir siempre lo mismo (respaldo sin IA). */
const CODE_REPLIES = [
  (c, l) => `Copiado, te marco en ${c}, ${l}.`,
  (c, l) => `Recibido: ${c}, ${l}. Ya te marco.`,
  (c, l) => `Copiado. Anoto ${c}, ${l}.`,
  (c, l) => `Perfecto, ${c} ${l}. Queda registrado.`,
  (c, l) => `Anotado: ${c} ${l}. Central en línea.`,
];
let replyRot = 0;
function variedReply(code) {
  const l = labelFor(code);
  const f = CODE_REPLIES[replyRot++ % CODE_REPLIES.length];
  return f(code, l);
}

export function extractCallsign(text) {
  const found = String(text || '').match(/\b[0-9A-Za-z]{1,3}-\d{1,4}\b/g) || [];
  for (const raw of found) {
    if (/^10-\d+$/.test(raw)) continue;
    return raw.toUpperCase();
  }
  return null;
}

// ── Supabase (turnos) ───────────────────────────────────────────────
function sbHeaders(extra) {
  return Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  }, extra || {});
}

const shiftCache = new Map();   // discordId → { at, shift } (45 s)

export async function findActiveShift(discordId) {
  const hit = shiftCache.get(discordId);
  if (hit && (Date.now() - hit.at) < 45000) return hit.shift;

  const url = `${SUPABASE_URL}/rest/v1/police_shift_sessions` +
    `?discord_id=eq.${encodeURIComponent(discordId)}` +
    `&status=in.(active,break)&order=id.desc&limit=1`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) throw new Error('Supabase GET ' + res.status);
  const rows = await res.json();
  const shift = Array.isArray(rows) && rows.length ? rows[0] : null;
  shiftCache.set(discordId, { at: Date.now(), shift: shift });
  return shift;
}

export async function setStatus(shiftId, code) {
  const url = `${SUPABASE_URL}/rest/v1/police_shift_sessions?id=eq.${encodeURIComponent(shiftId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({ status_code: code }),
  });
  if (!res.ok) throw new Error('Supabase PATCH ' + res.status);
  shiftCache.clear();          // cambió un estado: refrescamos lo leído
  return true;
}

// ── Voz de SALIDA (TTS) ─────────────────────────────────────────────
let audioPlayer = null;
let readyClient = null;

function ffmpegPath() {
  return (ffmpegStatic && String(ffmpegStatic).length) ? ffmpegStatic : 'ffmpeg';
}

function ttsUrl(text) {
  const q = encodeURIComponent(String(text).slice(0, 200));
  return 'https://translate.google.com/translate_tts?ie=UTF-8&q=' + q +
    '&tl=es&total=1&idx=0&textlen=' + String(text).length + '&client=tw-ob&ttsspeed=1';
}

function guildOf(client) {
  return (GUILD_ID && client.guilds.cache.get(GUILD_ID)) || client.guilds.cache.first() || null;
}

export function peopleInChannel(client) {
  const guild = guildOf(client);
  const ch = guild && guild.channels.cache.get(VOICE_CHANNEL_ID);
  if (!ch || !ch.members) return 0;
  return ch.members.filter(m => !m.user || !m.user.bot).size;
}

export function isCentralActive(client) {
  return peopleInChannel(client) > MIN_PEOPLE;
}

function centralChannel(client) {
  const guild = guildOf(client);
  return (guild && guild.channels.cache.get(VOICE_CHANNEL_ID)) || null;
}

// ── Avisos visibles en el CHAT del canal (diagnóstico sin abrir la consola) ──
const announced = {};
function sendChat(client, text) {
  const ch = centralChannel(client);
  if (!ch || typeof ch.send !== 'function') return;
  ch.send(text).catch((e) => console.warn('[central] aviso:', e.message));
}
function announce(client, key, text) {
  if (announced[key] === text) return;      // solo avisa cuando CAMBIA
  announced[key] = text;
  sendChat(client, text);
}
/** ¿Le está hablando a central aunque whisper haya descuadrado la frase? */
function looksAddressed(t) {
  const x = normalizeVoice(t);
  return /\b(centr|entr|codigo|muestra|muestrame|oficial|estado|servicio|turno|placa)\w*/.test(x)
    || /\b10\b/.test(x);
}
const lastNoEntendi = new Map();

export function ensureCentralVoice(client) {
  const guild = guildOf(client);
  if (!guild) return null;

  const existing = getVoiceConnection(guild.id);
  const gateOpen = peopleInChannel(client) > MIN_PEOPLE;
  const hay911Reciente = lastCallAt && (Date.now() - lastCallAt) < 120000;

  if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
    const chId = existing.joinConfig && existing.joinConfig.channelId;
    if (String(chId) === String(VOICE_CHANNEL_ID)) {
      // Sin suficientes oficiales en la voz → el bot SALE del canal
      // (salvo que haya una llamada 911 reciente, que no se interrumpe).
      if (!gateOpen && !hay911Reciente) {
        stopAllListeners('gate cerrado: me voy de la voz');
        announce(client, 'voice', '⏸ Central fuera de la voz: no hay suficientes oficiales conectados.');
        console.log('[central] ⏸ gate cerrado → salgo del canal de voz');
        try { existing.destroy(); } catch {}
        return null;
      }
      syncListeners(client);   // sigue en central → mantiene el oído abierto
      return existing;
    }
    // Está en OTRO canal (p. ej. una sesión 911): no lo molestamos y dejamos
    // de escuchar (los streams mueren con la conexión anterior).
    stopAllListeners('el bot salió del canal central');
    console.log(`[central] voz ocupada en otro canal (${chId}), no me muevo`);
    announce(readyClient || client, 'voice', '⚠️ Central está en OTRO canal de voz (sesión 911): no puedo escucharte hasta volver.');
    return existing;
  }

  // Sin gente en la voz el bot NO entra (se une recién con 3+ oficiales).
  if (!gateOpen && !hay911Reciente) return null;

  const channel = guild.channels.cache.get(VOICE_CHANNEL_ID);
  if (!channel || !channel.isVoiceBased()) return null;

  try {
    const conn = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });
    audioPlayer = audioPlayer || createAudioPlayer();
    if (!audioPlayer._centralErrorHook) {
      audioPlayer._centralErrorHook = true;
      audioPlayer.on('error', (e) => console.warn('[central] ❌ error del reproductor de audio:', e.message));
    }
    conn.subscribe(audioPlayer);

    conn.on(VoiceConnectionStatus.Ready, () => {
      console.log('[central] ✅ conexión de voz lista');
      announce(readyClient || client, 'voice', '🎧 Central conectado a la voz del canal — escuchando.');
      updateActivation(readyClient || client);
      syncListeners(readyClient || client);
    });
    conn.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log('[central] ⚠️ voz desconectada, intentando volver…');
      try {
        await entersState(conn, VoiceConnectionStatus.Ready, 8000);
      } catch {
        try { conn.destroy(); } catch {}
        setTimeout(() => ensureCentralVoice(readyClient || client), 5000);
      }
    });
    conn.on(VoiceConnectionStatus.Destroyed, () => {
      stopAllListeners('conexión destruida');
      const gente = peopleInChannel(readyClient || client);
      const porGate = gente <= MIN_PEOPLE;  // salí yo a propósito: no es un fallo
      console.log('[central] ⚠️ conexión destruida' + (porGate ? ' (me fui del canal)' : ', reintentando en 5s…'));
      if (!porGate) announce(readyClient || client, 'voice', '⚠️ Central perdió la voz. Reintentando…');
      setTimeout(() => ensureCentralVoice(readyClient || client), 5000);
    });
    conn.on('error', (e) => console.warn('[central] voz error:', e.message));

    console.log(`[central] 🎧 conectado a la voz "${channel.name || channel.id}"`);
    return conn;
  } catch (e) {
    console.warn('[central] No pudo entrar a la voz:', e.message);
    return null;
  }
}

/** Entra / sale del silencio de la radio (10-80 → código 4). */
function setMute(client, on, why) {
  if (mute1080 === on) return;
  mute1080 = on;
  if (on) {
    console.log('[central] 🔇 radio en silencio por 10-80 (' + why + ')');
    const ch = centralChannel(client);
    if (ch && typeof ch.send === 'function') {
      ch.send('🔇 Radio en silencio: persecución activa (10-80). No interrumpo hasta código 4.')
        .catch(() => {});
    }
  } else {
    console.log('[central] 🔊 radio reanudada (' + why + ')');
  }
}

/**
 * CÓDIGO 4: saca el 10-80 de TODAS las unidades activas (vuelven a 10-8).
 * Sin esto, el chequeo periódico seguía viendo 10-80 en la web y el bot
 * volvía a silenciarse apenas decías "código 4".
 */
async function clear1080(client, why) {
  try {
    const url = SUPABASE_URL + '/rest/v1/police_shift_sessions' +
      '?status=in.(active,break)&status_code=eq.10-80';
    const res = await fetch(url, {
      method: 'PATCH',
      headers: sbHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({ status_code: '10-8' }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    const k = Array.isArray(rows) ? rows.length : 0;
    if (k > 0) console.log('[central] 🔓 ' + k + ' unidad(es) volvieron a 10-8 (' + why + ')');
    return k;
  } catch (e) {
    console.warn('[central] clear1080:', e.message);
    return 0;
  }
}

/** Si algún oficial está en 10-80 en la website, la radio queda en silencio. */
async function checkMuteByShifts(client) {
  if (mute1080) return;
  const now = Date.now();
  if (now - lastShiftCheck < 10000) return;
  lastShiftCheck = now;
  try {
    const url = SUPABASE_URL + '/rest/v1/police_shift_sessions' +
      '?status=in.(active,break)&status_code=eq.10-80&limit=1';
    const res = await fetch(url, { headers: sbHeaders() });
    if (!res.ok) return;
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length) setMute(client, true, '10-80 en la website');
  } catch (e) {
    console.warn('[central] chequeo 10-80:', e.message);
  }
}

/** Activa central: suena la señal y avisa a todas las unidades. */
let activoAnunciado = false;
function updateActivation(client) {
  const activo = peopleInChannel(client) > MIN_PEOPLE;
  if (!activo) { activoAnunciado = false; return; }
  if (activoAnunciado) return;
  if (!inCentralChannel()) return;            // espero a que esté dentro de la voz
  activoAnunciado = true;
  enqueueSound(CENTRAL_ACTIVO_FILE);          // 1) señal de activación
  respond(client, {                            // 2) aviso hablado + chat
    say: 'Central activo, a todas las unidades.',
    show: '🔊 **Central ACTIVO** — a todas las unidades.',
  });
  console.log('[central] 🔔 CENTRAL ACTIVO anunciado');
}

function inCentralChannel() {
  const g = readyClient && guildOf(readyClient);
  const conn = getVoiceConnection(GUILD_ID || (g && g.id));
  if (!conn || !conn.joinConfig) return false;
  return String(conn.joinConfig.channelId) === String(VOICE_CHANNEL_ID);
}

// ── Voz natural (Microsoft Edge neural, es-MX) con respaldo Google ─
// ── Voces (hombres, realistas). Se cambian en vivo escribiendo
//    "voz andrew" / "voz jorge" / "voz alvaro"… en el chat del canal.
//    La elección queda guardada en /utils/voice.json (sobrevive reinicios).
const VOICES = {
  andrew:      'en-US-AndrewMultilingualNeural',  // la más humana, habla español
  brian:       'en-US-BrianMultilingualNeural',   // cálida, multilingüe
  christopher: 'en-US-ChristopherNeural',         // firme, estilo despacho
  jorge:       'es-MX-JorgeNeural',               // mexicano (la original)
  alvaro:      'es-ES-AlvaroNeural',              // español de España
  tomas:       'es-AR-TomasNeural',               // argentino
  dalia:       'es-MX-DaliaNeural',               // femenina
};
const VOICE_FILE = path.join(__dirname, 'voice.json');
let currentVoice = process.env.CENTRAL_TTS_VOICE || VOICES.jorge;
try {
  if (fs.existsSync(VOICE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(VOICE_FILE, 'utf8'));
    if (saved && saved.voice) currentVoice = saved.voice;
  }
} catch (e) {}
const EDGE_RATE = process.env.CENTRAL_TTS_RATE || '+0%';   // ritmo natural
let EdgeTTS = null;
const ttsInstances = new Map();   // voz → instancia viva (velocidad)
let EdgeFormat = null;
let edgeFails = 0;
let edgeCooldownUntil = 0;
let voiceLogged = false;

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Sintetiza con la voz neural de Edge (la misma que usa el 911) → mp3. */
async function edgeMp3(text, voice, rate) {
  if (!EdgeTTS) {
    const mod = await import('msedge-tts');
    EdgeTTS = mod.MsEdgeTTS || (mod.default && mod.default.MsEdgeTTS);
    EdgeFormat = mod.OUTPUT_FORMAT || (mod.default && mod.default.OUTPUT_FORMAT);
  }
  if (!EdgeTTS || !EdgeFormat) throw new Error('msedge-tts no expone MsEdgeTTS');

  // Instancia REUTILIZADA por voz: abrir el websocket en cada frase costaba
  // ~0,5 s de más. (Se cierra solo si cambiás de voz.)
  let tts = ttsInstances.get(voice);
  if (!tts) {
    tts = new EdgeTTS();
    await tts.setMetadata(voice, EdgeFormat.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    ttsInstances.set(voice, tts);
  }
  const dir = path.join(os.tmpdir(), 'central-tts',
    Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  fs.mkdirSync(dir, { recursive: true });
  try {
    const { audioFilePath } = await tts.toFile(dir, escapeXml(text), { rate });
    const buf = fs.readFileSync(audioFilePath);
    return buf;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

async function googleMp3(text) {
  const res = await fetch(ttsUrl(text), { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('TTS HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

/** Devuelve mp3: Edge (voz humana) → si falla Google. */
async function synthesizeMp3(text) {
  if (Date.now() > edgeCooldownUntil) {
    for (const voice of [currentVoice, VOICES.jorge, VOICES.dalia]) {
      try {
        const buf = await edgeMp3(text, voice, EDGE_RATE);
        if (buf && buf.length > 400) {
          edgeFails = 0;
          if (!voiceLogged) { voiceLogged = true; console.log('[central] 🗣 voz: ' + voice + ' (Edge neural)'); }
          return buf;
        }
      } catch (e) {
        edgeFails++;
        if (edgeFails >= 3) {
          edgeCooldownUntil = Date.now() + 600000;
          console.warn('[central] ⚠️ Edge TTS no responde (10 min de pausa):', e.message);
        }
      }
    }
  }
  console.warn('[central] ⚠️ usando voz de respaldo (Google TTS)');
  return googleMp3(text);
}

/** Habla el texto en el canal central. Devuelve true si sonó. */
/** mp3/wav → PCM 48 kHz estéreo → reproductor. */
async function toPcm(buf) {
  const pcm = await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks = [];
    proc.stdout.on('data', d => chunks.push(d));
    proc.on('error', reject);
    proc.on('close', code => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('ffmpeg exit ' + code))));
    proc.stdin.on('error', () => {});
    proc.stdin.end(buf);
  });
  if (!pcm.length) throw new Error('PCM vacío');
  return pcm;
}

async function playBuffer(buf, label) {
  if (mute1080) return false;    // 🔇 10-80: la radio no se interrumpe
  const conn = getVoiceConnection(GUILD_ID || (readyClient && guildOf(readyClient) && guildOf(readyClient).id));
  if (!conn || !audioPlayer || !inCentralChannel()) {
    console.log('[central] ⚠️ sin voz (no estoy en el canal central) → solo texto');
    return false;
  }
  try {
    if (conn.state.status !== VoiceConnectionStatus.Ready) {
      await entersState(conn, VoiceConnectionStatus.Ready, 6000);
    }
    conn.subscribe(audioPlayer);

    const pcm = await toPcm(buf);
    const { Readable } = await import('node:stream');
    const resource = createAudioResource(Readable.from([pcm]), { inputType: StreamType.Raw });
    audioPlayer.play(resource);
    await entersState(audioPlayer, AudioPlayerStatus.Playing, 15000);
    await entersState(audioPlayer, AudioPlayerStatus.Idle, 60000);
    console.log(`[central] 🔊 audio enviado (${(pcm.length / 2 / 48000).toFixed(1)}s)${label ? ': ' + label : ''}`);
    return true;
  } catch (e) {
    console.warn('[central] ❌ audio falló:', e.message);
    return false;
  }
}

/** Habla el texto en el canal central. Devuelve true si sonó. */
export async function speak(text) {
  const mp3 = await synthesizeMp3(text);
  return playBuffer(mp3, text);
}

/** Sonido pregrabado (alerta de pánico). */
async function playSoundFile(file) {
  if (!fs.existsSync(file)) {
    console.warn('[central] audio no encontrado:', file);
    return false;
  }
  return playBuffer(fs.readFileSync(file), '🎵 ' + path.basename(file));
}

function enqueueSound(file) {
  const job = voiceQueue.then(() => playSoundFile(file)).catch(() => false);
  voiceQueue = job.catch(() => false);
  return job;
}

let voiceQueue = Promise.resolve();
function enqueueSpeak(text) {
  const job = voiceQueue.then(() => speak(text)).catch(() => false);
  voiceQueue = job.catch(() => false);
  return job;
}

/**
 * Respuesta: PRIMERO el texto en el chat (feedback instantáneo) y DESPUÉS
 * la voz. Así no esperás los 3-4 s del audio para ver que te marcaron.
 *   say  → lo que se HABLA (TTS)
 *   show → lo que se ESCRIBE (si falta, se escribe `say`)
 */
async function respond(client, { say = '', show = '', channel = null } = {}) {
  const chatText = show || say;
  const ch = channel || centralChannel(client);

  // 1) la VOZ se encola YA (empieza a sonar antes) y el chat sale en paralelo
  let spokenPromise = null;
  if (say && !mute1080) spokenPromise = enqueueSpeak(say);

  if (chatText && ch && typeof ch.send === 'function') {
    try {
      await ch.send(chatText);
    } catch (e) {
      console.warn('[central] no se pudo enviar el texto:', e.message);
    }
  }

  // 2) si la voz no pudo sonar, Discord la lee con TTS
  if (spokenPromise) {
    const spoken = await spokenPromise;
    if (!spoken && !mute1080 && ch && typeof ch.send === 'function') {
      try { await ch.send({ content: say, tts: true }); } catch {}
    }
  }
}

/** Manda el pedido al canal de atención médica o de grúas. */
async function routeRequest(client, channelId, titulo, discordId, tag, text) {
  try {
    const anyClient = client || readyClient;
    const target = anyClient && anyClient.channels && anyClient.channels.cache
      ? anyClient.channels.cache.get(channelId) : null;
    if (!target || typeof target.send !== 'function') {
      console.warn('[central] canal destino no encontrado:', channelId);
      return false;
    }
    let donde = '';
    try {
      const loc = await locationOf(discordId);
      if (loc) donde = locationPhrase(loc);
    } catch (e) {}
    const linea = titulo + ' — ' + (tag || 'oficial') + (donde ? ' · ' + donde : '')
      + (text ? ' · "' + String(text).slice(0, 90) + '"' : '');
    await target.send(linea);
    console.log('[central] 📤 ' + titulo + ' → canal ' + channelId);
    return true;
  } catch (e) {
    console.warn('[central] routeRequest:', e.message);
    return false;
  }
}

/**
 * Lo que usa el comando /central de Discord:
 * el oficial ESCRIBE y el bot le contesta POR VOZ en el canal central.
 * Devuelve { ok, reply } para que el comando pueda informarle.
 */
export async function centralFromText(client, { discordId, tag, text }) {
  if (!text || !String(text).trim()) {
    return { ok: false, reply: '❌ Escribí algo. Ej: /central texto:10-8 o código 4.' };
  }
  if (!inCentralChannel()) {
    return { ok: false, reply: '⚠️ No estoy conectado a la voz del canal central (¿hay 3+ oficiales?).' };
  }
  if (!isCentralActive(client)) {
    return { ok: false, reply: '⏸ Central pausado: necesito más de 2 oficiales en la voz del canal.' };
  }
  let handled = false;
  try {
    handled = await processCommand(client, {
      discordId,
      tag: tag || 'oficial',
      text: String(text),
      channel: null,          // la copia al chat va al canal de voz central
      fromVoice: false,       // es texto: se escribe limpio
      heardText: null,
    });
  } catch (e) {
    console.error('[central] /central error:', e.message);
    return { ok: false, reply: '❌ Error interno al procesar. Probá de nuevo.' };
  }
  if (!handled) {
    return {
      ok: false,
      reply: '❌ No entendí. Probá con: 10-8 · código 4 · cuál es mi ubicación · necesito médico · grúa',
    };
  }
  return { ok: true, reply: '🎙 Procesado. Te contesto por voz en el canal central.' };
}

// ── Núcleo de comandos (compartido por chat y voz) ──────────────────
async function processCommand(client, {
  discordId, tag, text, channel, fromVoice, heardText,
  llmCode, llmCentral, llmReply, llmReq,
}) {
  const location = wantsLocation(text);
  const escena4 = esCodigo4(text);
  const disparos = esDisparos(text);
  const reqMedico = (llmReq === 'medico') || wantsMedical(text);
  const reqGrua = (llmReq === 'grua') || wantsTow(text);

  // Si la IA ya interpretó el mensaje se usa su lectura; si no, el motor normal.
  const code = (llmCode !== undefined && llmCode !== null)
    ? llmCode
    : extractStatusCode(text, fromVoice);
  const central = (llmCentral !== undefined && llmCentral !== null)
    ? llmCentral
    : wantsCentral(text, fromVoice);
  if (!code && !central && !location && !escena4 && !reqMedico && !reqGrua && !disparos) return false;

  const people = peopleInChannel(client);
  if (people <= MIN_PEOPLE) {
    console.log(`[central] ⏸ gate cerrado: ${people} humanos en la voz (necesita más de ${MIN_PEOPLE}) → NO respondo`);
    return false;
  }

  // Lo que se escribe en el chat: primero lo que entendió, después la respuesta.
  const echo = (fromVoice && heardText) ? `🎙 Entendí: "${heardText}"\n` : '';

  // ── Escena en CÓDIGO 4 (bajo control) ──
  // Siempre tiene prioridad: aunque el mensaje traiga "10-80", el código 4
  // cierra la escena/reactiva la radio y NO marca ningún estado.
  if (escena4) {
    setMute(client, false, 'código 4');            // 🔊 vuelve a la normalidad
    await clear1080(client, 'código 4');           // y lo saca de la web para NO volver a silenciar
    const reply = llmReply || variedCod4();
    await respond(client, { say: reply, show: echo + reply, channel });
    console.log(`[central] 🟢 CÓDIGO 4 de ${tag || discordId} → escena bajo control`);
    return true;
  }

  // ── DISPAROS / SHOTS FIRED → alarma + aviso a TODAS las unidades ──
  if (disparos && !escena4) {
    await enqueueSound(ALERT_FILE);
    let donde = '';
    try {
      const loc = await locationOf(discordId);
      if (loc) donde = ', en ' + locationPhrase(loc);
    } catch {}
    const reply = 'Todas las unidades, disparos reportados. Respondan a la ubicación del oficial'
      + (donde || '') + '.';
    await respond(client, { say: reply, show: echo + '🚨 ' + reply, channel });
    try {
      const sh = await findActiveShift(discordId);
      if (sh) {
        await setStatus(sh.id, '10-100');
        console.log(`[central] 🔫 DISPAROS de ${tag || discordId} → 10-100 (turno #${sh.id})`);
      } else {
        console.log(`[central] 🔫 DISPAROS de ${tag || discordId} → sin turno: solo aviso`);
      }
    } catch (e) {
      console.warn('[central] disparos: no pude marcar 10-100:', e.message);
    }
    return true;
  }

  // ── Pedido de ubicación: se responde antes que nada ──
  if (location && !code) {
    let loc = null;
    let motivo = '';
    try {
      loc = await locationOf(discordId);
    } catch (e) {
      motivo = (e && e.message === 'NO_FICHA')
        ? 'Negativo, no tenés la ficha vinculada en la web. Hacelo desde tu perfil.'
        : 'Negativo, no pude consultar tu ubicación. Probá de nuevo en un momento.';
      console.warn('[central] ubicación:', e.message);
    }
    if (!motivo && !loc) {
      motivo = 'Negativo, no te encuentro en el servidor ahora mismo. ¿Estás en el juego?';
    }
    const reply = motivo || locationReply(loc);
    await respond(client, { say: reply, show: echo + reply, channel });
    console.log(`[central] 📍 ${tag || discordId} pidió ubicación →`,
      loc ? `${loc.PostalCode || '?'} ${loc.StreetName || ''}` : (motivo || 'sin datos'));
    return true;
  }

  // ── Pedido de ATENCIÓN MÉDICA o GRÚA: se deriva a su canal ──
  if (reqMedico || reqGrua) {
    await routeRequest(
      client,
      reqMedico ? MEDICAL_CHANNEL_ID : TOW_CHANNEL_ID,
      reqMedico ? '🚑 ATENCIÓN MÉDICA' : '🚚 GRÚA SOLICITADA',
      discordId, tag, text,
    );
    if (!code && !central) {
      const reply = llmReply || (reqMedico
        ? 'Copiado, pido atención médica a tu ubicación.'
        : 'Copiado, pido una grúa a tu ubicación.');
      await respond(client, { say: reply, show: echo + reply, channel });
      console.log(`[central] 🏥/🚚 pedido de ${reqMedico ? 'médico' : 'grúa'} de ${tag || discordId}`);
      return true;
    }
  }

  const callsign = fromVoice ? null : extractCallsign(text);
  let shift = null;
  try {
    shift = await findActiveShift(discordId);
  } catch (e) {
    console.warn('[central] error consultando turno:', e.message);
    await respond(client, { say: 'Disculpá, no pude consultar tu turno. Repetí, porfa.', show: echo + 'Disculpá, no pude consultar tu turno. Repetí, porfa.', channel });
    return true;
  }

  if (!shift) {
    await respond(client, { say: MSG_NO_SHIFT, show: echo + MSG_NO_SHIFT, channel });
    return true;
  }

  if (code) {
    // Supabase se escribe EN PARALELO: la voz y el chat NO esperan el PATCH.
    const patch = setStatus(shift.id, code)
      .then(() => { if (code === '10-100') lastMarkedPanic = shift.id; return null; })
      .catch(e => { console.warn('[central] error marcando estado:', e.message); return e; });
    const finishPatch = async () => {
      const err = await patch;
      if (err) {
        await respond(client, { say: 'Disculpá, no pude marcar tu estado. Repetí, porfa.', show: echo + 'Disculpá, no pude marcar tu estado. Repetí, porfa.', channel });
        return false;
      }
      if (code === '10-80') setMute(client, true, 'marcaron 10-80');
      return true;
    };
    console.log(`[central] ✅ ${tag || discordId} → ${code} (turno #${shift.id}) [en paralelo]`);

    // ── PÁNICO (10-100): alerta sonora + aviso a TODAS las unidades ──
    if (code === '10-100') {
      await enqueueSound(ALERT_FILE);              // 1) primero la alarma
      let donde = '';
      try {
        const loc = await locationOf(discordId);    // 2) ubicación en vivo
        if (loc) donde = ', en ' + locationPhrase(loc);
      } catch {}
      const reply = `Todas las unidades, tenemos pánico activo${donde}.`;
      await respond(client, { say: reply, show: echo + reply, channel });
      await finishPatch();
      console.log(`[central] 🚨 PÁNICO de ${tag || discordId}${donde ? ' →' + donde : ''}`);
      return true;
    }

    if (!central) {
      const reply = llmReply || variedReply(code);
      await respond(client, { say: reply, show: echo + reply, channel });
      await finishPatch();
      return true;
    }
  }

  if (code) await finishPatch();   // código + "para central" a la vez

  if (central) {
    const finalCode = code || shift.status_code || '10-8';
    const who = callsign ? callsign + ' ' : '';
    // Si no hay redacción de la IA: solo manda el estado si el mensaje era
    // puramente "para central"; si era una frase/report, contesta genérico.
    const soloDireccion = /^(para\s+)?(central|centr)[\s.,!]*$/i.test(normalizeVoice(text).trim());
    const reply = llmReply
      || (soloDireccion || code ? replyFor(finalCode, `Copiado, ${who}te marco en `) : 'Copiado, central recibe.');
    await respond(client, { say: reply, show: echo + reply, channel });
    if (code === '10-80') setMute(client, true, 'marcaron 10-80');
  }
  return true;
}

/**
 * IA genérica para otros módulos del bot (ej: asistente de tickets).
 * Devuelve el texto de respuesta o null si no hay IA / no está disponible.
 * Comparte la misma clave, el mismo espaciado y el mismo anti-429 que
 * la interpretación de voz.
 */
export async function askLLM(systemPrompt, userText) {
  if (!LLM_KEY) return null;
  const ahora = Date.now();
  if (ahora < llmCooldownUntil) return null;
  if (ahora - llmLastAt < 2500) return null;
  llmLastAt = ahora;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch(LLM_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_KEY}` },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.6,
        max_tokens: 320,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: String(userText || '').slice(0, 1500) },
        ],
      }),
    });
    if (res.status === 429) {
      llmCooldownUntil = Date.now() + 60000;
      llmWarn('límite de peticiones (429) → 60 s sin IA');
      return null;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    const raw = (((j.choices || [])[0] || {}).message || {}).content || '';
    const txt = String(raw).trim();
    return txt ? txt.slice(0, 700) : null;
  } catch (e) {
    llmWarn('askLLM: ' + e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Cambia la voz en vivo: "voz andrew", "cambiar la voz a jorge". */
async function tryVoiceSwitch(client, text, channel, echo) {
  const m = normalizeVoice(text).match(/^(?:cambiar\s+la\s+voz\s+a|cambia\s+la\s+voz\s+a|voz)\s+([a-z]+)$/i);
  if (!m) return false;
  const name = m[1].toLowerCase();
  const id = VOICES[name];
  if (!id) {
    await respond(client, {
      say: 'No conozco esa voz. Prueba con andrew, jorge, alvaro, brian o dalia.',
      show: (echo || '') + 'Voces disponibles: ' + Object.keys(VOICES).join(', '),
      channel,
    });
    return true;
  }
  currentVoice = id;
  voiceLogged = false;
  try { fs.writeFileSync(VOICE_FILE, JSON.stringify({ voice: id, name: name }, null, 2)); } catch (e) {}
  console.log('[central] 🎙 voz cambiada a ' + id);
  await respond(client, {
    say: 'Listo, pruebo con esta voz. ¿Qué tal se escucha?',
    show: (echo || '') + `🎙 Voz cambiada: ${name} → ${id}`,
    channel,
  });
  return true;
}

// ── Entrada por TEXTO (chat del canal de voz) ───────────────────────
export async function handleMessage(client, message) {
  if (!message || !message.author || message.author.bot) return;

  const text = message.content || '';
  const code = extractStatusCode(text);
  const central = wantsCentral(text, false);
  const escena4 = esCodigo4(text);          // "código 4" escrito también cuenta
  const locAsked = wantsLocation(text);     // "mi ubicación" escrito también cuenta

  if (String(message.channelId) !== String(VOICE_CHANNEL_ID)) {
    if (code || central) {
      console.log(`[central] ⚠️ "central/código" escrito en el canal ${message.channelId} ` +
        `(esperaba el canal de voz ${VOICE_CHANNEL_ID}) → "${String(text).slice(0, 70)}"`);
    }
    return;
  }

  if (await tryVoiceSwitch(client, text, message.channel, '')) return;

  if (!code && !central && !escena4 && !locAsked) return;

  console.log(`[central] 📥 ${message.author.tag}: "${String(text).slice(0, 70)}" → código=${code} central=${central} c4=${escena4} ubic=${locAsked}`);

  if (/\b(prueba de voz|test de voz|!voz)\b/i.test(text)) {
    await respond(client, { say: 'Prueba de voz. Central en línea.', channel: message.channel });
    return;
  }

  // Sin código pero le hablan a central → la IA redacta la respuesta.
  const ai = (LLM_KEY && central && !code) ? await llmInterpret(text) : null;

  const handled = await processCommand(client, {
    discordId: message.author.id,
    tag: message.author.tag,
    text,
    channel: message.channel,
    fromVoice: false,
    llmCode: ai ? ai.code : undefined,
    llmCentral: ai ? ai.central : undefined,
    llmReply: ai ? ai.reply : '',
  });
  if (!handled) return;
}

// ── Entrada por VOZ (whisper) ───────────────────────────────────────
// Reglas de oro para no romper el opus nativo:
//  1) NUNCA se llama decode() después de marcar la entrada como terminada.
//  2) NUNCA se libera un decodificador que todavía puede recibir audio.
//  3) Los decodificadores se REUTILIZAN por usuario (1 por persona, no 1
//     por frase): crear/borrar en cada frase corrompía la memoria WASM.
const listeners = new Map();   // userId -> { stream, chunks, timer, done }
const decoders = new Map();    // userId -> OpusScript (cacheado)

let lastOpusLog = 0;
function opusWarn(msg) {
  const now = Date.now();
  if (now - lastOpusLog < 30000) return;   // no spamear la consola
  lastOpusLog = now;
  console.warn('[central] ⚠️ opus:', msg);
}

/** Canales del paquete opus según su byte TOC (RFC 6716). */
function packetChannels(buf) {
  try {
    if (!buf || !buf.length) return 2;
    const code = (buf[0] >> 2) & 0x3;     // 0/1 → mono, 2/3 → estéreo
    if (code === 0 || code === 2) return 1;
    if (code === 1 || code === 3) return 2;
  } catch (e) {}
  return 2;
}

function getDecoder(userId, ch) {
  const key = userId + '#' + ch;
  const cached = decoders.get(key);
  if (cached) return cached;
  // poda segura: solo dejo caer decodificadores de usuarios SIN escucha activa
  if (decoders.size >= 10) {
    for (const [id, d] of Array.from(decoders.entries())) {
      if (listeners.has(String(id).split('#')[0])) continue;
      try { d.delete(); } catch (e) { opusWarn('delete: ' + (e && e.message)); }
      decoders.delete(id);
      break;
    }
  }
  const Ctor = loadOpus();
  let d;
  try {
    // wasm:false → heap PROPIO (asm.js), aislado del codificador del TTS
    d = new Ctor(48000, ch || 2, undefined, { wasm: false });
  } catch (e) {
    opusWarn('asm.js no arrancó: ' + (e && e.message) + ' → uso wasm');
    d = new Ctor(48000, ch || 2);
  }
  decoders.set(key, d);
  return d;
}

function freeAllDecoders() {
  for (const [id, d] of Array.from(decoders.entries())) {
    if (listeners.has(id)) continue;         // jamás uno en uso
    try { d.delete(); } catch (e) { opusWarn('delete: ' + (e && e.message)); }
    decoders.delete(id);
  }
}

function stopAllListeners(reason) {
  const entries = Array.from(listeners.values());
  if (!entries.length && !decoders.size) return;
  console.log(`[central] 🎙 dejando de escuchar (${reason})`);

  // 1) marcar como terminados ANTES de tocar nada (ningún 'data' tardío
  //    va a llamar a decode() sobre un decoder ya liberado)
  for (const e of entries) {
    e.done = true;
    clearTimeout(e.timer);
  }
  listeners.clear();

  // 2) recién ahora cierro los streams
  for (const e of entries) {
    try { e.stream.destroy(); } catch {}
  }

  // 3) y por último libero los decodificadores (ya sin escuchas)
  freeAllDecoders();
}

function dropStaleSubscription(conn, userId) {
  // La librería solo borra la suscripción en 'close': si queda un stream
  // muerto en el mapa, subscribe() te lo devuelve y nunca llega audio.
  try {
    const map = conn.receiver && conn.receiver.subscriptions;
    if (!map || typeof map.get !== 'function') return;
    const existing = map.get(userId);
    if (!existing) return;
    const stale = existing.readableEnded === true || existing.destroyed === true;
    if (!stale) return;
    map.delete(userId);
    try { existing.removeAllListeners('close'); } catch {}
    try { existing.destroy(); } catch {}
  } catch {}
}

function ensureUserListening(client, userId) {
  if (listeners.has(userId)) return;
  if (!inCentralChannel()) return;
  if (!isCentralActive(client)) return;

  const g = guildOf(client);
  const conn = getVoiceConnection(GUILD_ID || (g && g.id));
  if (!conn || !conn.receiver) return;

  // Si el sistema 911 (u otro) ya está escuchando a esa persona, cedemos:
  // no robamos su stream para no romper las llamadas de emergencia.
  try {
    if (conn.receiver.subscriptions && conn.receiver.subscriptions.has(userId)) {
      const cur = conn.receiver.subscriptions.get(userId);
      if (!(cur && (cur.readableEnded || cur.destroyed))) return;
      dropStaleSubscription(conn, userId);
    }
  } catch {}

  let stream;
  try {
    stream = conn.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE_MS },
    });
  } catch (e) {
    opusWarn('suscribir ' + userId + ': ' + e.message);
    return;
  }
  if (!stream) return;
  if (stream.readableEnded || stream.destroyed) {
    dropStaleSubscription(conn, userId);
    setTimeout(() => { try { ensureUserListening(client, userId); } catch {} }, 400);
    return;
  }

  let decoder;
  try {
    try {
      decoder = getDecoder(userId, 2);   // se pre-crea; el real se elige por paquete
    } catch (first) {
      // el heap puede estar abortado: recargo el módulo y reintento una vez
      reloadOpus('init: ' + ((first && first.message) || first));
      decoder = getDecoder(userId);
    }
  } catch (e) {
    opusWarn('init: ' + (e && e.message));
    announce(client, 'opus',
      '⚠️ El módulo de voz del bot falló. Si sigo sin escucharme, reiniciá el bot desde el panel de Cybrancee.');
    try { stream.destroy(); } catch {}
    return;
  }

  const entry = { stream, decoder, chunks: [], decodeErrors: 0, userId, done: false };
  listeners.set(userId, entry);

  // Idempotente: se ejecuta UNA sola vez y NUNCA borra el decoder
  // (se reutiliza en la próxima intervención del mismo usuario).
  entry.finish = (why) => {
    if (entry.done) return;
    entry.done = true;
    if (listeners.get(userId) === entry) listeners.delete(userId);
    clearTimeout(entry.timer);
    void why;

    // ★ REABRIR EL OÍDO DE INMEDIATO, antes de transcribir y de responder.
    //   Antes esperábamos a terminar la transcripción + el TTS (~7 s) y en
    //   ese lapso el bot estaba sordo: "10-8 para central" se perdía justo
    //   ahí y por eso "no entendía".
    try { ensureUserListening(client, userId); } catch {}
    setTimeout(() => { try { ensureUserListening(client, userId); } catch {} }, 450);

    handleVoiceUtterance(client, userId, entry).catch(e =>
      console.warn('[central] voz error:', e.message));
  };

  entry.timer = setTimeout(() => entry.finish('timeout'), MAX_UTTERANCE_MS);

  stream.on('data', (chunk) => {
    if (entry.done) return;                    // ← corta cualquier audio tardío
    try {
      const dec = getDecoder(userId, packetChannels(chunk));   // mono/stereo según el paquete
      const decoded = dec.decode(chunk);
      if (decoded && decoded.length) {
        entry.chunks.push(decoded);
        entry.pcmBytes = (entry.pcmBytes || 0) + decoded.length;
      }
      // tope: ~31 s de audio por intervención (no acumular sin límite)
      if (entry.pcmBytes > 6000000) entry.finish('demasiado largo');
    } catch (e) {
      const msg = (e && e.message) || '';
      entry.decodeErrors++;
      if (msg && !/Invalid packet/.test(msg)) opusWarn('decode: ' + msg);
      // El módulo nativo murió (aserción de libopus): se recarga entero y
      // el bot sigue andando solo. NO hace falta reiniciar.
      if (/Aborted|memory access|out of bounds|ASSERTIONS|Internal error/i.test(msg)) {
        reloadOpus(msg);
        entry.finish('módulo opus recargado');
        return;
      }
      // "Invalid packet" = frames sueltos (normal). Otros errores = decoder
      // corrupto: lo descarto SIN delete() y en la próxima se crea uno nuevo.
      if (msg && !/Invalid packet|Bad argument|Buffer too small|Invalid state/.test(msg)) {
        for (const k of Array.from(decoders.keys())) {
          if (String(k).split('#')[0] === String(userId)) decoders.delete(k);
        }
        console.warn('[central] ♻️ decoder descartado por error: ' + msg);
        entry.finish('decoder corrupto');
      }
    }
  });
  stream.on('end', () => entry.finish('silencio'));
  stream.on('close', () => entry.finish('cerrado'));
  stream.on('error', (e) => {
    console.warn('[central] stream de voz error:', e.message);
    entry.finish('error');
  });
}

function syncListeners(client) {
  if (!inCentralChannel() || !isCentralActive(client)) {
    if (listeners.size) stopAllListeners('sin condiciones para escuchar');
    return;
  }
  const g = guildOf(client);
  const ch = g && g.channels.cache.get(VOICE_CHANNEL_ID);
  if (!ch || !ch.members) return;
  for (const member of ch.members.values()) {
    if (member.user && member.user.bot) continue;
    ensureUserListening(client, member.id);
  }
}

/** Float32 (-1..1) mono 16 kHz → WAV 16 bits (para mandarlo a la nube). */
function floatToWav(samples, sampleRate) {
  const len = samples.length;
  const buf = new ArrayBuffer(44 + len * 2);
  const v = new DataView(buf);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, len * 2, true);
  let o = 44;
  for (let i = 0; i < len; i++, o += 2) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7FFF, true);
  }
  return new Uint8Array(buf);
}

/**
 * Transcribe: nube (si hay clave) y si falla o no hay clave, motor local.
 * Devuelve SIEMPRE texto plano.
 */
let sttCooldownUntil = 0;
let sttWarnAt = 0;
function sttWarn(msg) {
  const now = Date.now();
  if (now - sttWarnAt < 60000) return;
  sttWarnAt = now;
  console.warn('[central] ⚠️ STT nube:', msg);
}

/**
 * Transcripción con 3 niveles:
 *  1) Deepgram whisper-large (español perfecto, sin límite de peticiones)
 *  2) Groq whisper (si hay clave y no está en espera)
 *  3) motor local whisper-tiny
 */
async function stt(audio) {
  // ── 1) Deepgram ──
  if (DG_KEY && Date.now() > dgCooldownUntil) {
    try {
      const wav = floatToWav(audio, 16000);
      const q = new URLSearchParams({
        model: DG_MODEL, language: 'es', smart_format: 'true',
      });
      const t0 = Date.now();
      const res = await fetch(DG_URL + '?' + q.toString(), {
        method: 'POST',
        headers: { Authorization: 'Token ' + DG_KEY, 'Content-Type': 'audio/wav' },
        body: wav,
      });
      if (res.status === 429 || res.status === 402) {
        dgCooldownUntil = Date.now() + 60000;
        dgWarn('límite/crédito (' + res.status + ') → 60 s en el respaldo');
      } else if (!res.ok) {
        throw new Error('HTTP ' + res.status + ' ' + (await res.text().catch(() => '')).slice(0, 100));
      } else {
        const j = await res.json();
        const t = (((j.results || {}).channels || [{}])[0].alternatives || [{}])[0];
        const txt = t && t.transcript ? String(t.transcript).trim() : '';
        if (txt) {
          if (!sttEngineLogged) { sttEngineLogged = true; console.log('[central] 🧠 STT: Deepgram · ' + DG_MODEL); }
          console.log('[central] ⏱ STT ' + (Date.now() - t0) + 'ms');
          return txt;
        }
        throw new Error('transcripción vacía');
      }
    } catch (e) {
      dgWarn(e.message);
    }
  }

  // ── 2) Groq ──
  if (STT_KEY && Date.now() > sttCooldownUntil) {
    try {
      if (!sttEngineLogged) { sttEngineLogged = true; console.log(`[central] 🧠 STT: nube · ${STT_MODEL}`); }
      const wav = floatToWav(audio, 16000);
      const fd = new FormData();
      fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
      fd.append('model', STT_MODEL);
      fd.append('language', 'es');
      fd.append('response_format', 'json');
      const res = await fetch(STT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${STT_KEY}` },
        body: fd,
      });
      if (res.status === 429) {
        sttCooldownUntil = Date.now() + 60000;
        sttWarn('límite de peticiones (429) → 60 s en el motor local');
        return (await transcribe(audio, { language: 'spanish' })).trim();
      }
      if (!res.ok) {
        const body = (await res.text().catch(() => '')).slice(0, 120);
        throw new Error('HTTP ' + res.status + ' ' + body);
      }
      const j = await res.json();
      const t = String((j && j.text) || '').trim();
      if (t) return t;
      throw new Error('respuesta vacía');
    } catch (e) {
      sttWarn(e.message);
    }
  }

  // ── 3) motor local ──
  return (await transcribe(audio, { language: 'spanish' })).trim();
}

// ── IA de interpretación y redacción (Groq) ─────────────────────────
// Se usa SOLO cuando el motor de reglas no encontró código: entiende frases
// rotas, redacta respuestas distintas cada vez y contesta cualquier pregunta.
// Anti-cuota: máx. 1 consulta cada 2,5 s y 60 s de espera tras un 429.
const LLM_KEY = process.env.LLM_API_KEY || process.env.STT_API_KEY || process.env.GROQ_API_KEY || '';
const LLM_URL = process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'qwen/qwen3.8-27b';
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 6000);
let llmFails = 0;
let llmLogged = false;
let llmWarnAt = 0;
let llmCooldownUntil = 0;
let llmLastAt = 0;
const chatHistory = [];   // últimas respuestas (para no repetirse)

function llmWarn(msg) {
  const now = Date.now();
  if (now - llmWarnAt < 60000) return;      // como mucho 1 aviso por minuto
  llmWarnAt = now;
  console.warn('[central] ⚠️ IA:', msg);
}

const LLM_SYSTEM = [
  'Sos "CENTRAL", el operador de despacho de radio de la policía de roleplay de Houston RP.',
  'Te hablan los oficiales por VOZ (transcripción con errores) o por chat, en español neutro.',
  'Respondé SIEMPRE con un solo objeto JSON, sin texto fuera del JSON:',
  '{"code":"<codigo valido o null>","central":<true|false>,"req":"medico|grua|null","reply":"<respuesta corta>"}',
  '',
  'CODIGOS validos y su significado:',
  '10-5 vigilancia, 10-6 ocupado, 10-7 fuera de servicio, 10-8 en servicio,',
  '10-11 detencion de trafico, 10-15 persona bajo custodia, 10-23 llego a la escena,',
  '10-50 accidente grave, 10-80 persecucion activa, 10-97 en ruta, 10-98 disponible,',
  '10-99 oficial en apuros, 10-100 oficial caido (panico).',
  'Pon code SOLO si el oficial cambia o pide cambiar su estado (si no se entiende el codigo, null).',
  'central=true si le habla a central, reporta algo, confirma algo o hace cualquier pregunta.',
  'req="medico" si pide atención médica (ambulancia, heridos, paramédico, paciente, EMS).',
  'req="grua" si pide grúa o auxilio mecánico (remolque, tow, varado). Sino req=null.',
  "DISPAROS o SHOT FIRED (repetido o urgente) = PANICO: code 10-100.",
  '',
  'CÓDIGO 4 (dicen "escena código 4", "pasó a código 4", "todo código 4") = la escena está',
  'BAJO CONTROL / todo en orden. Confirmalo siempre con "Copiado" y decí que está bajo control.',
  'CONTESTÁ LO QUE SEA: significados de códigos, dudas, saludos, reportes de escena, clima,',
  'horarios, chistes cortos de policía… siempre breve y en tu rol de central.',
  'NUNCA repitas textualmente una respuesta que ya hayas dado: variá las palabras cada vez',
  '(cambiá sinónimos y el orden), sin perder el "Copiado" al confirmar.',
  'REGLAS DE reply (máximo 130 caracteres, tono de central: cortés, seguro, profesional):',
  '- SIEMPRE empezá con "Copiado" cuando confirmes algo. Nunca digas "10-4" ni "quedo atento".',
  '- Si cambió un código: "Copiado, te marco en 10-8, en servicio."',
  '- Si reporta algo (ej: "escena código 4 finalizando, pasó a bajo control"): confirmalo y resumilo.',
  '- Si pregunta: contestala corto y claro.',
  '- Nunca inventes códigos que no estén en la lista. Nunca finjas ser humano.',
  'EJEMPLOS REALES de lo que dicen (así hay que interpretarlos):',
  '"que lo ser uno para centrarlo" → central=true',
  '"para central mostrarme 10 o 8" → code="10-8", central=true',
  '"muestrame en diaz ocho para central" → code="10-8" ("diaz ocho" = diez ocho)',
  '"dios, hay un herido" → req="medico"',
  '"se me quedó el carro, mando grúa" → req="grua"',
  '"disparos disparos disparos" → code="10-100"',
  '"la escena pasó a código cuatro" → central=true (bajo control, pueden retirarse)',
  'Si no se entiende NADA: {"code":null,"central":false,"reply":""}',
].join(' ');

async function llmInterpret(transcript) {
  if (!LLM_KEY) return null;
  const ahora = Date.now();
  if (ahora < llmCooldownUntil) return null;      // tras un 429: 60 s de espera
  if (ahora - llmLastAt < 2500) return null;      // máx. 1 consulta cada 2,5 s
  llmLastAt = ahora;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch(LLM_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_KEY}` },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.4,
        max_tokens: 220,
        messages: [
          { role: 'system', content: LLM_SYSTEM },
          ...(chatHistory.length
            ? [{
                role: 'system',
                content: 'Ya respondiste (NO repitas esto, varía la redacción):\n' +
                  chatHistory.map(h => '- dijiste: "' + h.out + '"').join('\n'),
              }]
            : []),
          { role: 'user', content: transcript },
        ],
      }),
    });
    if (res.status === 429) {
      llmCooldownUntil = Date.now() + 60000;
      llmWarn('límite de peticiones (429) → 60 s con el motor de reglas');
      return null;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    const raw = (((j.choices || [])[0] || {}).message || {}).content || '';
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('sin JSON: ' + raw.slice(0, 80));
    const o = JSON.parse(m[0]);
    if (!llmLogged) { llmLogged = true; console.log('[central] 🤖 IA de redacción: ' + LLM_MODEL); }
    llmFails = 0;
    const replyTxt = typeof o.reply === 'string' ? o.reply.trim() : '';
    if (replyTxt) {
      chatHistory.push({ in: transcript, out: replyTxt });
      if (chatHistory.length > 6) chatHistory.shift();
    }
    return {
      code: o.code ? normalizeCode(String(o.code)) : null,
      central: !!o.central,
      req: (o.req === 'medico' || o.req === 'grua') ? o.req : null,
      reply: replyTxt.slice(0, 220),
    };
  } catch (e) {
    llmFails++;
    llmWarn('no respondió (' + llmFails + '): ' + e.message + ' → uso reglas');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function handleVoiceUtterance(client, userId, entry) {
  const audio = pcm48kToWhisper16k(entry.chunks);
  entry.chunks = null;                        // libera ~6 MB enseguida
  const secs = audio.length / 16000;
  if (secs < 0.4) return;                     // ruido / clics

  let text = '';
  try {
    text = await stt(audio);
  } catch (e) {
    console.warn('[central] transcripción falló:', e.message);
    return;
  }
  if (!text) return;

  let tag = userId;
  try {
    const g = guildOf(client);
    const m = g && await g.members.fetch(userId);
    if (m) tag = m.user.tag;
  } catch {}

  // 1) Motor de reglas primero (rápido y gratis).
  const ruleCentral = wantsCentral(text, true);
  // Números ("10-8", "diez ocho"): siempre. Frases ("en servicio"): solo si
  // le habla a central → evita respuestas espontáneas en la charla.
  let ruleCode = extractStatusCode(text, false);
  if (!ruleCode && ruleCentral) ruleCode = extractStatusCode(text, true);
  // 2) La IA solo interviene si las reglas detectaron que le hablan: así
  //    NUNCA contesta por su cuenta y no quemamos cuota de Groq.
  // La IA SOLO interviene en frases largas sin código (ahorra 0,5-1 s en
  // cada comando normal: "10-8 para central" se responde con reglas al toque).
  const palabras = normalizeVoice(text).trim().split(/\s+/).filter(Boolean).length;
  const ai = (LLM_KEY && ruleCentral && !ruleCode && palabras > 8)
    ? await llmInterpret(text)
    : null;
  const heardCode = (ai && ai.code) || ruleCode;
  const heardCentral = ruleCentral || (ai && ai.central);
  const aiReq = (ai && ai.req) || null;
  const llmReply = (ai && ai.reply) || '';
  console.log(`[central] 🎙 ${tag} dijo (${secs.toFixed(1)}s): "${text}"` +
    ` → código=${heardCode || '—'} central=${heardCentral ? 'sí' : 'no'} c4=${esCodigo4(text)}` +
    (ai ? ` · IA ✓` : ``));

  // En silencio (10-80) y NO es un código 4 → avisa cómo reactivarlo.
  if (mute1080 && !esCodigo4(text)) {
    const ahora = Date.now();
    if (ahora - lastSilentNote > 60000) {
      lastSilentNote = ahora;
      respond(client, { show: '🔇 Sigo en silencio por el 10-80 — decí (o escribí) **"código 4"** para reactivarme.' });
      console.log('[central] 🔇 avisé que sigo en silencio');
    }
  }
  if (!heardCode && !heardCentral) {
    console.log('[central] 💬 sin comando reconocido (decí "... para central" o "en servicio para central")');
    const now = Date.now();
    const yaLoEntendi = esCodigo4(text) || wantsLocation(text);
    if (!yaLoEntendi && looksAddressed(text) && now - (lastNoEntendi.get(userId) || 0) > 15000) {
      lastNoEntendi.set(userId, now);
      sendChat(client, `🎙 No entendí: "${text}"\nEjemplos: "10-6 para central" · "en servicio para central" · "fuera de servicio"`);
    }
  }

  if (/\b(prueba de voz|test de voz)\b/i.test(text)) {
    await respond(client, { say: 'Prueba de voz. Central en línea.' });
    return;
  }

  if (await tryVoiceSwitch(client, text, null, '🎙 Entendí: "' + text + '"' + '\n')) return;

  await processCommand(client, {
    discordId: userId,
    tag,
    text,
    channel: null,
    fromVoice: true,
    heardText: text,
    llmCode: heardCode,
    llmCentral: heardCentral,
    llmReply,
    llmReq: (ai && ai.req) || null,
  });

  // volvemos a abrir el oído para la siguiente intervención
  setTimeout(() => {
    try { ensureUserListening(client, userId); } catch {}
  }, 700);
}

// ── Llamadas 911 entrantes: ringtone + aviso (sin tocar el 911) ──
// Se detectan con la API de ER:LC. NO se modifica utils/emergency911.js.
const seenCalls = new Set();
let lastCallCheck = 0;

function callKey(c) {
  return String(c.CallNumber || c.id || ((c.StartedAt || '') + '|' + (c.Caller || '')));
}

async function announce911(client, call) {
  const desc = String(call.Description || '').trim();
  const where = String(call.PositionDescriptor || '').trim();
  const num = call.CallNumber ? ' #' + call.CallNumber : '';

  const chat = '📞 Llamada 911' + num + (desc ? ': ' + desc : '') + (where ? ' — ' + where : '');
  const spoken = where
    ? 'Llamada 911 entrante, ' + where + '.'
    : (desc ? 'Llamada 911 entrante: ' + desc + '.' : 'Llamada 911 entrante.');

  await enqueueSound(SOUND_911_FILE);                 // 1) ringtone
  await respond(client, { say: spoken, show: chat });  // 2) aviso hablado + chat
  lastCallAt = Date.now();
  console.log('[central] 📞 Llamada 911' + num + ' → ' + (desc || where || '(sin detalle)'));
}

let lastPanicCheck = 0;
const panicSeen = new Set();
/**
 * Si alguien marca 10-100 en la WEBSITE (botón de pánico del MDT o del
 * Dispatch), el bot dispara la alarma y avisa a todas las unidades.
 * (La API de ERLC NO expone el botón de pánico del juego: verificado.)
 */
async function checkPanicShifts(client) {
  const now = Date.now();
  if (now - lastPanicCheck < 8000) return;
  lastPanicCheck = now;
  try {
    const url = SUPABASE_URL + '/rest/v1/police_shift_sessions' +
      '?status=in.(active,break)&status_code=eq.10-100&select=id,discord_id,username';
    const res = await fetch(url, { headers: sbHeaders() });
    if (!res.ok) return;
    const rows = await res.json();
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      const k = String(r.id);
      if (panicSeen.has(k)) continue;
      panicSeen.add(k);
      if (panicSeen.size > 40) { const a = Array.from(panicSeen); for (let i = 0; i < a.length - 20; i++) panicSeen.delete(a[i]); }
      // Solo si el bot NO fue quien lo marcó (para no repetir la alarma)
      if (lastMarkedPanic === r.id) continue;
      await enqueueSound(ALERT_FILE);
      let donde = '';
      try {
        const loc = await locationOf(r.discord_id);
        if (loc) donde = ', en ' + locationPhrase(loc);
      } catch {}
      const reply = 'Todas las unidades, tenemos pánico activo' + (donde || '') + '.';
      await respond(client, { say: reply, show: '🚨 Pánico de ' + (r.username || 'oficial') + '. ' + reply });
      console.log('[central] 🚨 PÁNICO detectado en la website → ' + (r.username || r.id) + (donde || ''));
    }
  } catch (e) {
    console.warn('[central] chequeo de pánico:', e.message);
  }
}
let lastMarkedPanic = null;

async function checkEmergencyCalls(client) {
  if (!PRC_KEY) return;
  if (!isCentralActive(client) || !inCentralChannel()) return;
  const now = Date.now();
  if (now - lastCallCheck < 10000) return;            // como mucho cada 10 s
  lastCallCheck = now;
  try {
    const res = await fetch(PRC_BASE + '/v2/server?EmergencyCalls=true', {
      headers: { 'server-key': PRC_KEY },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const calls = Array.isArray(data.EmergencyCalls) ? data.EmergencyCalls : [];
    if (seenCalls.size === 0) {
      for (const c of calls) seenCalls.add(callKey(c));  // primer chequeo: no spamear
      return;
    }
    for (const c of calls) {
      const k = callKey(c);
      if (seenCalls.has(k)) continue;
      seenCalls.add(k);
      await announce911(client, c);
    }
    if (seenCalls.size > 80) {
      const arr = Array.from(seenCalls);
      for (let i = 0; i < arr.length - 40; i++) seenCalls.delete(arr[i]);
    }
  } catch (e) {
    console.warn('[central] chequeo de llamadas 911:', e.message);
  }
}

// ── Arranque ────────────────────────────────────────────────────────
export function initCentral(client) {
  readyClient = client;
  const guild = guildOf(client);
  console.log(`[central] 📡 Canal de voz ${VOICE_CHANNEL_ID} | activo si hay más de ${MIN_PEOPLE} humanos ` +
    `| ahora: ${peopleInChannel(client)} | entrada: VOZ + chat`);

  client.on('messageCreate', (message) => {
    handleMessage(client, message).catch(e => console.warn('[central] msg error:', e.message));
  });

  // ── CHEQUEO DE INTEGRIDAD: si falta algún bloque, se ve AL TOQUE ──
  try {
    const okIA = (typeof LLM_KEY === 'string') && (typeof llmInterpret === 'function') && (typeof LLM_SYSTEM === 'string');
    console.log(okIA
      ? '[central] ✅ IA integrada (interpretación + redacción)'
      : '[central] ❌ FALTA EL BLOQUE DE IA (LLM_KEY/llmInterpret)');
    console.log('[central] ✅ STT: Deepgram=' + (typeof DG_KEY === 'string' && DG_KEY ? 'sí' : 'no') +
      ' · Groq=' + (typeof STT_KEY === 'string' && STT_KEY ? 'sí' : 'no') +
      ' · local=siempre');
    console.log('[central] ✅ códigos=' + STATUS_CODES.length + ' · disparos=' +
      (typeof esDisparos === 'function') + ' · médico/grúa=' + (typeof wantsMedical === 'function') +
      ' · pánico-web=' + (typeof checkPanicShifts === 'function'));
  } catch (e) {
    console.error('[central] ❌ CHEQUEO DE INTEGRIDAD:', e.message);
  }

  const bootMsg = peopleInChannel(client) > MIN_PEOPLE
    ? '🎙 **Central en línea** — podés hablarme en la voz o escribir en este canal (ej: "10-6 para central").'
    : '🎙 **Central en línea** — necesito más de ' + MIN_PEOPLE + ' humanos en la voz para activarme.';
  announce(client, 'boot', bootMsg);

  ensureCentralVoice(client);
  // Deja el oído abierto y sincroniza la gente que entra/sale.
  setInterval(() => {
    ensureCentralVoice(client);
    try { syncListeners(client); } catch (e) { console.warn('[central] sync:', e.message); }
    try { updateActivation(client); } catch (e) { console.warn('[central] activación:', e.message); }
    checkEmergencyCalls(client).catch(e => console.warn('[central] 911:', e.message));
    checkMuteByShifts(client).catch(e => console.warn('[central] 10-80:', e.message));
  }, 5000);

  let lastCount = null;
  client.on('voiceStateUpdate', () => {
    const n = peopleInChannel(client);
    if (n !== lastCount) {
      lastCount = n;
      console.log(`[central] 👥 humanos en la voz: ${n} → ${n > MIN_PEOPLE ? 'ACTIVO' : 'inactivo'}`);
      announce(readyClient || client, 'gate',
        n > MIN_PEOPLE
          ? `▶ Central ACTIVO: ${n} humanos en la voz.`
          : `⏸ Central pausado: ${n} humano(s) en la voz — necesito más de ${MIN_PEOPLE}.`);
    }
    setTimeout(() => { try { syncListeners(readyClient || client); } catch {} }, 500);
  });

  client.on('voiceStateUpdate', (oldState, newState) => {
    const me = guild && guild.members.me;
    if (!me || oldState.id !== me.id) return;
    if (!newState.channelId) setTimeout(() => ensureCentralVoice(readyClient || client), 2000);
  });

  void guild;
}
