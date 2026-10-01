#!/usr/bin/env node
'use strict';

/* ════════════════════════════════════════════════════════════════
   HOUSTON HUB — CENTRAL / DISPATCH (voz)
   ────────────────────────────────────────────────────────────────
   • Se queda SIEMPRE en el canal de voz "Law Enforcement"
     (por defecto 1285846829522616375).
   • Solo está activo cuando hay MÁS DE 2 personas conectadas
     en ese canal de voz (sin contar bots).
   • Lee el chat del canal de voz:
       "1K-01 Muestrame en 10-8 en servicio"  → marca 10-8 en la web
       "... para central"                     → responde por VOZ (TTS):
                                                "10-4 te marco en 10-8 en servicio."
       Sin turno activo                        → "10-2 no has iniciado tu turno"
   • NO toca el proyecto de 911 emergencias.
   ════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const voice = require('@discordjs/voice');
const { getAudioUrl } = require('google-tts-api');

// ── Carga de .env (panel de Cybrancee / archivo local) ──────────────
function loadEnv() {
  const candidates = [process.env.ENV_FILE, path.join(process.cwd(), '.env'), path.join(__dirname, '.env')];
  // carpetas vecinas (el token vive en houston-web1ww/houston-web1ww/.env)
  candidates.push(path.join(__dirname, '..', 'houston-web1ww', '.env'));
  candidates.push(path.join(__dirname, '..', '.env'));
  // sube directorios buscando un .env (ej: houston-web1ww/.env con el token)
  let dir = __dirname;
  for (let i = 0; i < 4; i++) {
    candidates.push(path.join(dir, '.env'));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const files = candidates.filter(Boolean);

  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const key = m[1];
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
      }
      break; // el primer .env encontrado manda
    } catch (e) {
      console.warn('[env] No se pudo leer', file, e.message);
    }
  }
}
loadEnv();

// ── Configuración ───────────────────────────────────────────────────
const CONFIG = {
  token: process.env.DISCORD_BOT_TOKEN || '',
  guildId: process.env.DISCORD_GUILD_ID || '1285846827463344209',
  channelVoiceId: process.env.CENTRAL_VOICE_CHANNEL_ID || '1285846829522616375',
  // Más de 2 personas = se activa. Se puede cambiar con CENTRAL_MIN_PEOPLE=2
  minPeople: Number(process.env.CENTRAL_MIN_PEOPLE || 2),
  supabaseUrl: (process.env.SUPABASE_URL || 'https://qqgtroxrkccftlrpqwsk.supabase.co').replace(/\/$/, ''),
  // Clave publishable (misma que usa la website en assets/auth.js)
  supabaseKey: process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_ZTcgdobN4BxLtxo59UUCuA_raeLls6H',
  tts: (process.env.CENTRAL_TTS || 'on').toLowerCase() !== 'off',
  // Modo prueba: conecta, imprime el estado y NO responde ni entra a la voz.
  dryRun: ['1', 'true', 'si', 'yes'].includes(String(process.env.CENTRAL_DRY_RUN || '').toLowerCase()),
};

// Códigos 10-x que existen en la website (misma lista que el MDT/Dispatch)
const STATUS_CODES = [
  '10-5', '10-6', '10-7', '10-8', '10-11', '10-15',
  '10-23', '10-50', '10-97', '10-98', '10-99', '10-100',
];

// Mensajes fijos
const MSG_NO_SHIFT = '10-2 no has iniciado tu turno';

// ── Utilidades de texto ─────────────────────────────────────────────
/** Devuelve el primer código 10-x válido del mensaje (o null). */
function normalizeCode(raw) {
  const n = String(raw).replace(/^10-0*(\d+)$/, '10-$1');
  return STATUS_CODES.includes(n) ? n : null;
}

function extractStatusCode(text) {
  if (!text) return null;
  const found = String(text).match(/10-\d{1,3}/g) || [];
  for (const raw of found) {
    const n = normalizeCode(raw);
    if (n) return n;
  }
  return null;
}

/** ¿El mensaje es una llamada a central? */
function wantsCentral(text) {
  if (!text) return false;
  return /\bpara\s+central\b/i.test(text) || /\bcentral\s*,/i.test(text);
}

/** Placa tipo 1K-01 / 2A-15 / A-12 (solo para mostrar en la respuesta). */
function extractCallsign(text) {
  const found = String(text || '').match(/\b[0-9A-Za-z]{1,3}-\d{1,4}\b/g) || [];
  for (const raw of found) {
    if (/^10-\d+$/.test(raw)) continue; // eso es un código, no una placa
    return raw.toUpperCase();
  }
  return null;
}

// ── Supabase (turnos) ───────────────────────────────────────────────
function sbHeaders(extra) {
  return Object.assign({
    apikey: CONFIG.supabaseKey,
    Authorization: `Bearer ${CONFIG.supabaseKey}`,
    'Content-Type': 'application/json',
  }, extra || {});
}

/** Turno activo (o en descanso) del oficial. */
async function findActiveShift(discordId) {
  const url = `${CONFIG.supabaseUrl}/rest/v1/police_shift_sessions` +
    `?discord_id=eq.${encodeURIComponent(discordId)}` +
    `&status=in.(active,break)&order=id.desc&limit=1`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase GET ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/** Marca el código de estado del turno en la website. */
async function setStatus(shiftId, code) {
  const url = `${CONFIG.supabaseUrl}/rest/v1/police_shift_sessions?id=eq.${encodeURIComponent(shiftId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({ status_code: code }),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${res.status}: ${await res.text()}`);
  return true;
}

// ── Voz (TTS) ───────────────────────────────────────────────────────
let audioPlayer = null;
let ffmpegPath = null;

function resolveFfmpeg() {
  if (ffmpegPath) return ffmpegPath;
  try {
    // binario estático (no requiere ffmpeg instalado en el servidor)
    const p = require('ffmpeg-static');
    if (p && fs.existsSync(p)) { ffmpegPath = p; return ffmpegPath; }
  } catch (e) {}
  ffmpegPath = 'ffmpeg'; // fallback: ffmpeg del sistema
  return ffmpegPath;
}

function getGuild(client) {
  return client.guilds.cache.get(CONFIG.guildId) || client.guilds.cache.first() || null;
}

/** Garantiza que el bot esté dentro del canal de voz central. */
function ensureVoice(client) {
  const guild = getGuild(client);
  if (!guild) return null;

  const channel = guild.channels.cache.get(CONFIG.channelVoiceId);
  if (!channel || !channel.isVoiceBased()) {
    console.warn('[voice] Canal de voz no encontrado:', CONFIG.channelVoiceId);
    return null;
  }

  const existing = voice.getVoiceConnection(guild.id);
  if (existing && existing.state.status !== voice.VoiceConnectionStatus.Destroyed) {
    return existing;
  }

  try {
    const conn = voice.joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    if (!audioPlayer) {
      audioPlayer = voice.createAudioPlayer();
      conn.subscribe(audioPlayer);
    } else {
      conn.subscribe(audioPlayer);
    }

    conn.on(voice.VoiceConnectionStatus.Disconnected, async () => {
      try {
        await voice.entersState(conn, voice.VoiceConnectionStatus.Ready, 8000);
      } catch (e) {
        try { conn.destroy(); } catch (_) {}
        setTimeout(() => ensureVoice(client), 5000);
      }
    });
    conn.on(voice.VoiceConnectionStatus.Destroyed, () => {
      setTimeout(() => ensureVoice(client), 5000);
    });
    conn.on('error', (e) => console.warn('[voice] error:', e.message));

    console.log('[voice] Conectado al canal', channel.name || channel.id);
    return conn;
  } catch (e) {
    console.warn('[voice] No se pudo conectar:', e.message);
    return null;
  }
}

/** Reproduce un texto por voz (TTS) en el canal de voz central. */
async function speak(text) {
  if (!CONFIG.tts) return false;
  const conn = voice.getVoiceConnection(CONFIG.guildId) || voice.getVoiceConnection();
  if (!conn || !audioPlayer) return false;
  try {
    const url = getAudioUrl(String(text), 'es', 1, 1000);
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error('TTS HTTP ' + res.status);
    const mp3 = Buffer.from(await res.arrayBuffer());

    const proc = spawn(resolveFfmpeg(), [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-f', 's16le', '-ar', '48000', '-ac', '2',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'ignore'] });

    const resource = voice.createAudioResource(proc.stdout, { inputType: voice.StreamType.Raw });
    proc.stdin.end(mp3);

    const spawnFail = new Promise((_, rej) => proc.once('error', rej));
    audioPlayer.play(resource);
    await Promise.race([
      voice.entersState(audioPlayer, voice.AudioPlayerStatus.Playing, 15000),
      spawnFail,
    ]);
    await voice.entersState(audioPlayer, voice.AudioPlayerStatus.Idle, 60000);
    return true;
  } catch (e) {
    console.warn('[voice] TTS falló:', e.message);
    return false;
  }
}

/** Umbral: más de CONFIG.minPeople personas (humanas) en el canal de voz. */
function peopleInChannel(client) {
  const guild = getGuild(client);
  const channel = guild && guild.channels.cache.get(CONFIG.channelVoiceId);
  if (!channel || !channel.members) return 0;
  return channel.members.filter(m => !m.user || !m.user.bot).size;
}
function isCentralActive(client) {
  return peopleInChannel(client) > CONFIG.minPeople;
}

// ── Respuestas ──────────────────────────────────────────────────────
async function reply(message, text, withVoice) {
  let spoken = false;
  if (withVoice) spoken = await speak(text);
  try {
    if (spoken) await message.channel.send(text);
    else await message.channel.send({ content: text, tts: !!withVoice });
  } catch (e) {
    console.warn('[reply] no se pudo responder:', e.message);
  }
}

/** Núcleo: procesa un mensaje del canal central. */
async function handleMessage(client, message) {
  if (!message || !message.author || message.author.bot) return;
  if (message.channelId !== CONFIG.channelVoiceId) return;
  if (!isCentralActive(client)) return; // gate: >2 personas en voz

  const text = message.content || '';
  const code = extractStatusCode(text);
  const central = wantsCentral(text);
  if (!code && !central) return;

  const callsign = extractCallsign(text);

  let shift = null;
  try {
    shift = await findActiveShift(message.author.id);
  } catch (e) {
    console.warn('[db] error consultando turno:', e.message);
    await reply(message, '10-9 Central no pudo consultar tu turno, repite.', central);
    return;
  }

  if (!shift) {
    await reply(message, MSG_NO_SHIFT, central);
    return;
  }

  if (code) {
    try {
      await setStatus(shift.id, code);
    } catch (e) {
      console.warn('[db] error marcando estado:', e.message);
      await reply(message, '10-9 no pude marcar tu estado, repite.', central);
      return;
    }
    if (!central) {
      // Marcado simple: confirmación corta en el chat (sin voz)
      try { await message.react('✅'); } catch (_) {}
      return;
    }
  }

  if (central) {
    const finalCode = code || shift.status_code || '10-8';
    const who = callsign ? callsign + ' ' : '';
    await reply(message, `10-4 ${who}te marco en ${finalCode} en servicio.`, true);
  }
}

// ── Arranque ────────────────────────────────────────────────────────
function main() {
  if (!CONFIG.token) {
    console.error('Falta DISCORD_BOT_TOKEN (panel de Cybrancee o archivo .env).');
    process.exitCode = 1;
    return;
  }
  if (!CONFIG.supabaseKey) {
    console.error('Falta SUPABASE_KEY (clave publishable/anon de Supabase).');
    process.exitCode = 1;
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Channel],
  });

  let started = false;
  const onReady = (c) => {
    if (started) return;
    started = true;
    const cli = c || client;
    console.log(`[bot] Conectado como ${cli.user.tag}`);
    console.log(`[bot] Guild: ${CONFIG.guildId} | Canal voz: ${CONFIG.channelVoiceId}`);
    console.log(`[bot] Personas en canal: ${peopleInChannel(client)} (activo si > ${CONFIG.minPeople})`);

    if (CONFIG.dryRun) {
      const guild = getGuild(client);
      const ch = guild && guild.channels.cache.get(CONFIG.channelVoiceId);
      console.log('[dry] Servidor:', guild ? guild.name : 'NO ENCONTRADO');
      console.log('[dry] Canal:', ch ? `${ch.name || '(sin nombre)'} tipo=${ch.type}` : 'NO ENCONTRADO');
      const me = guild && guild.members.me;
      if (ch && me) {
        const p = ch.permissionsFor(me);
        console.log('[dry] Permisos del bot:', JSON.stringify({
          Conectar: p.has('Connect'), Hablar: p.has('Speak'),
          VerCanal: p.has('ViewChannel'), EscribirChat: p.has('SendMessages'),
          UsarTTS: p.has('UseEmbeddedActivities') || null,
        }));
      }
      console.log('[dry] Intención MessageContent:', client.options.intents.has('MessageContent') ? 'activa' : 'INACTIVA');
      console.log('[dry] Personas conectadas:', peopleInChannel(client), `(activo si > ${CONFIG.minPeople})`);
      console.log('[dry] Mensajes que lleguen se imprimen, sin responder.');
      setTimeout(() => { try { client.destroy(); } catch (_) {} process.exitCode = 0; }, 15000);
      return;
    }

    ensureVoice(client);

    // Red de seguridad: si el bot es expulsado de la voz, vuelve solo.
    setInterval(() => ensureVoice(client), 30000);
  };
  client.once('clientReady', onReady);

  client.on('messageCreate', (message) => {
    if (CONFIG.dryRun) {
      if (message.channelId === CONFIG.channelVoiceId && !message.author.bot) {
        console.log(`[dry] ${message.author.tag}: "${message.content}"`);
        console.log(`[dry]   → código=${extractStatusCode(message.content)} central=${wantsCentral(message.content)}`);
      }
      return;
    }
    handleMessage(client, message).catch(e => console.warn('[msg] error:', e.message));
  });

  client.on('voiceStateUpdate', (oldState, newState) => {
    const me = getGuild(client) && getGuild(client).members.me;
    if (!me) return;
    const left = oldState.id === me.id && oldState.channelId && !newState.channelId;
    const moved = oldState.id === me.id && oldState.channelId !== newState.channelId;
    if (left || moved) setTimeout(() => ensureVoice(client), 2000);
  });

  process.on('unhandledRejection', (e) => console.warn('[process]', e && e.message));
  process.on('uncaughtException', (e) => console.error('[process]', e && e.stack));

  // Apagado limpio (sin process.exit para no romper los sockets)
  const shutdown = (sig) => {
    console.log(`[bot] ${sig}: cerrando…`);
    try { const c = voice.getVoiceConnection(CONFIG.guildId); if (c) c.destroy(); } catch (_) {}
    try { client.destroy(); } catch (_) {}
    setTimeout(() => { process.exitCode = 0; }, 500);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  client.login(CONFIG.token).catch(e => {
    console.error('[bot] Login falló:', e.message);
    process.exitCode = 1;
  });
}

if (require.main === module) main();

module.exports = {
  CONFIG,
  STATUS_CODES,
  MSG_NO_SHIFT,
  extractStatusCode,
  wantsCentral,
  extractCallsign,
  findActiveShift,
  setStatus,
  handleMessage,
  loadEnv,
};
