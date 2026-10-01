import { execute } from './all_command_local.mjs';

// --- mocks ---
const results = { sent: 0, closed: 0, limited: 0, errors: [] };
function makeUser(i) {
  return {
    user: { id: 'u' + i, bot: false, system: false },
    roles: { cache: { has: () => false } },
    permissions: { has: () => true },
    async send(text) {
      if (i % 5 === 3) { const e = new Error('Cannot send messages to this user'); e.code = 50007; throw e; }
      if (i % 7 === 2 && !this._tried) { this._tried = true; const e = new Error('rate limited'); e.code = 429; e.retryAfter = 1; throw e; }
      results.sent++;
    },
  };
}
const membersList = Array.from({ length: 40 }, (_, i) => makeUser(i));
const guild = { members: { fetch: async () => new Map(membersList.map(m => [m.user.id, m])) } };

const channelMessages = [];
const progressMsg = {
  content: '',
  async edit(c) { this.content = c; channelMessages.push(c); },
};
let deferReplyCalled = false;
let editReplyFinal = null;
const interaction = {
  user: { id: '1', tag: 'tester#0001' },
  member: { permissions: { has: () => true }, roles: { cache: { has: () => false } } },
  guild,
  channel: { send: async (c) => { channelMessages.push(c); return progressMsg; } },
  async deferReply() { deferReplyCalled = true; },
  async editReply(c) { editReplyFinal = c; },
  options: { getString: () => 'hola a todos, evento a las 20:00' },
};

const t0 = Date.now();
await execute(interaction);
const secs = ((Date.now() - t0) / 1000).toFixed(1);

let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fails++; };

ok(deferReplyCalled, 'respondió al comando (defer)');
ok(channelMessages.length >= 1, 'publicó mensaje de progreso en el canal (' + channelMessages.length + ' ediciones)');
ok(/Enviando MD…|Enviando mensaje privado/.test(channelMessages[0] || ''), 'progreso inicial correcto');
console.log('   enviados=' + results.sent + ' en ' + secs + 's | última edición:', JSON.stringify((channelMessages[channelMessages.length - 1] || '').slice(0, 90)));
ok(/✅ \*\*Mensaje privado enviado a \d+/.test(channelMessages[channelMessages.length - 1] || ''), 'resumen final con enviados');
ok(/MD cerrados/.test(channelMessages[channelMessages.length - 1] || ''), 'resumen cuenta MD cerrados');
const finalText = typeof editReplyFinal === 'string' ? editReplyFinal : (editReplyFinal && editReplyFinal.content) || '';
ok(/Listo: \d+ enviados/.test(finalText), 'respuesta final al usuario: ' + JSON.stringify(finalText));
ok(results.sent > 0, 'envió al menos algunos (' + results.sent + ')');

console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
process.exitCode = fails ? 1 : 0;
