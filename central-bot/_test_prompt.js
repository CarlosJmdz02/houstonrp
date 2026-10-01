const fs = require('fs');
const KEY = process.env.GROQ_KEY;
const src = fs.readFileSync('C:/Users/13462/OneDrive/Desktop/houston-web1ww/central-bot/integration/central.js', 'utf8');

// extraigo el LLM_SYSTEM tal cual del bot (misma fuente que usa en producción)
const i = src.indexOf('const LLM_SYSTEM = [');
const j = src.indexOf("].join(' ');", i) + "].join(' ')".length;
const SYSTEM = eval('(' + src.slice(i + 'const LLM_SYSTEM = '.length, j) + ')');
console.log('prompt cargado:', SYSTEM.length, 'chars\n');

const CASES = [
  'central muestra la escena codigo 4 finalizando que la escena paso a bajo control',
  '1kilo01 para central muestrame 10-80',
  'central ¿qué significa el 10-11?',
  'central buenas noches',
  'central ¿cuántos códigos conoces?',
  'que lo ser uno para centrarlo.',
];

(async () => {
  for (const user of CASES) {
    const t0 = Date.now();
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b', temperature: 0.3, max_tokens: 220,
          messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
        }),
      });
      const ms = Date.now() - t0;
      if (!r.ok) { console.log(`  HTTP ${r.status} | "${user}"`); continue; }
      const j = await r.json();
      const txt = (j.choices[0].message.content || '').replace(/\s+/g, ' ').trim();
      console.log(`${ms}ms | "${user}"\n        → ${txt.slice(0, 220)}\n`);
    } catch (e) {
      console.log('ERR ' + e.message + ' | ' + user);
    }
  }
})();
