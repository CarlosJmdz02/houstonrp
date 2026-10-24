/*
 * Supervisor del bot de Central.
 * ------------------------------------------------------------
 * El proceso puede morir con SIGABRT por una asercion interna de
 * libopus (opusscript comparte heap entre codificador y
 * decodificadores). Ese abort NO se puede atrapar desde el propio
 * proceso, asi que lo que hacemos aqui es reiniciarlo.
 *
 *   node start.js          -> arranca y vigila
 *   npm start               -> igual (package.json apunta aqui)
 *
 * Variables opcionales:
 *   RESTART_DELAY_MS   pausa inicial entre reinicios (default 2000)
 *   MAX_RESTARTS       reinicios consecutivos permitidos antes de
 *                      frenar para no entrar en bucle (default 30)
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ENTRY = path.join(__dirname, 'index.js');
const LOG = path.join(__dirname, 'bot-restart.log');
const START_DELAY = Number(process.env.RESTART_DELAY_MS || 2000);
const MAX_RESTARTS = Number(process.env.MAX_RESTARTS || 30);

let restarts = 0;
let lastCrash = 0;
let stopping = false;
let child = null;

function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(line) {
  const msg = `[${stamp()}] ${line}`;
  console.log(`[super] ${msg}`);
  try { fs.appendFileSync(LOG, msg + '\n'); } catch (_) {}
}

function start() {
  child = spawn(process.execPath, [ENTRY], {
    cwd: __dirname,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env,
  });

  log(`bot iniciado (pid ${child.pid})`);

  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) return;

    const now = Date.now();
    // Reinicio la cuenta si llevo mucho rato estable
    if (now - lastCrash > 120000) restarts = 0;
    lastCrash = now;
    restarts += 1;

    const why = signal ? `signal ${signal}` : `codigo ${code}`;
    log(`bot salio (${why}). Reinicio ${restarts}/${MAX_RESTARTS}`);

    if (restarts > MAX_RESTARTS) {
      log(`Demasiados reinicios seguidos: espero 60 s antes de reintentar.`);
      restarts = 0;
      setTimeout(start, 60000);
      return;
    }

    // Backoff suave: cuanto mas veces falle, mas espero
    const delay = Math.min(START_DELAY * restarts, 30000);
    log(`reinicio en ${Math.round(delay / 1000)} s`);
    setTimeout(start, delay);
  });
}

function shutdown() {
  stopping = true;
  log('apagando por senal...');
  if (child) {
    try { child.kill('SIGTERM'); } catch (_) {}
    setTimeout(() => { try { child && child.kill('SIGKILL'); } catch (_) {} }, 5000);
  }
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (e) => {
  log('excepcion no capturada en el supervisor: ' + (e && e.message));
});

if (!fs.existsSync(ENTRY)) {
  console.error('[super] no encuentro index.js en ' + ENTRY);
  process.exit(1);
}

log('supervisor arrancado (node ' + process.version + ')');
start();
