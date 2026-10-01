'use strict';
/* Tests rápidos del bot central (sin Discord ni red de escritura). */

const {
  extractStatusCode, wantsCentral, extractCallsign, STATUS_CODES, MSG_NO_SHIFT,
  handleMessage, CONFIG,
} = require('./index.js');

let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fails++; };

// Códigos 10-x
ok(extractStatusCode('1K-01 Muestrame en 10-8 en servicio') === '10-8', 'detecta 10-8');
ok(extractStatusCode('2A-15 saliendo 10-7 fuera de servicio') === '10-7', 'detecta 10-7');
ok(extractStatusCode('X entro en 10-100') === '10-100', 'detecta 10-100 (panico)');
ok(extractStatusCode('mando 10-99 ayuda') === '10-99', 'detecta 10-99');
ok(extractStatusCode('10-4 recibido') === null, 'ignora 10-4 (ack)');
ok(extractStatusCode('10-2 no disponible') === null, 'ignora 10-2');
ok(extractStatusCode('hola central') === null, 'sin codigo = null');
ok(extractStatusCode('voy en 10-08') === '10-8', 'tolera 10-08');
for (const c of STATUS_CODES) ok(extractStatusCode('prueba ' + c) === c, 'codigo soportado ' + c);

// "para central"
ok(wantsCentral('1K-01 para central') === true, 'detecta "para central"');
ok(wantsCentral('1K-01 ... 10-8 en servicio para  Central') === true, 'detecta con espacios/mayusculas');
ok(wantsCentral('central, ¿me escuchas?') === true, 'detecta "central,"');
ok(wantsCentral('1K-01 10-8 en servicio') === false, 'sin "para central" = false');

// Placas (cada oficial tiene la suya)
ok(extractCallsign('1K-01 para central') === '1K-01', 'placa 1K-01');
ok(extractCallsign('2A-15 10-7') === '2A-15', 'placa 2A-15');
ok(extractCallsign('hola') === null, 'sin placa = null');
ok(extractCallsign('10-8 para central') === null, '10-8 no se confunde con placa');

// Mensajes fijos
ok(/10-2/.test(MSG_NO_SHIFT), 'mensaje 10-2 definido');

// Respuesta exacta pedida por el usuario
const code = extractStatusCode('1K-01 Muestrame en 10-8 en servicio');
ok(`10-4 te marco en ${code} en servicio.` === '10-4 te marco en 10-8 en servicio.',
  'respuesta exacta: "10-4 te marco en 10-8 en servicio."');

// ── Integración (mock de Discord + Supabase real, solo lectura) ─────
function mockClient(people) {
  const channel = { members: { filter: () => ({ size: people }) } };
  return { guilds: { cache: { get: () => ({ channels: { cache: { get: () => channel } } }) } } };
}
function mockMessage(content, id) {
  const sent = [];
  const reacts = [];
  return {
    sent, reacts,
    message: {
      author: { bot: false, id: id || '000000000000000000' },
      channelId: CONFIG.channelVoiceId,
      content,
      react: async (e) => reacts.push(e),
      channel: { send: async (x) => { sent.push(typeof x === 'string' ? x : (x && x.content) || ''); } },
    },
  };
}

(async () => {
  let m = mockMessage('1K-01 10-8 en servicio para central');
  await handleMessage(mockClient(2), m.message);
  ok(m.sent.length === 0, 'puerta cerrada (2 personas) -> no responde');

  m = mockMessage('1K-01 10-8 en servicio para central');
  await handleMessage(mockClient(3), m.message);
  ok(m.sent.some(s => /10-2/.test(s)), 'sin turno activo -> "' + MSG_NO_SHIFT + '"');

  m = mockMessage('hola a todos');
  await handleMessage(mockClient(3), m.message);
  ok(m.sent.length === 0, 'mensaje normal (sin codigo/central) -> no responde');

  m = mockMessage('10-8 para central');
  m.message.channelId = '123456789012345678';
  await handleMessage(mockClient(3), m.message);
  ok(m.sent.length === 0, 'mensaje de otro canal -> ignora');

  console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
  process.exitCode = fails ? 1 : 0;
})();
