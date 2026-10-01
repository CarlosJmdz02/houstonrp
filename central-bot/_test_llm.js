const KEY = process.env.GROQ_KEY;

const SYSTEM = [
  'Sos el central de despacho de radio de una policia de roleplay (Houston RP), en espanol.',
  'Te llega la transcripcion de VOZ de un oficial; suele tener errores de reconocimiento.',
  'Responde SOLO con un objeto JSON, sin texto extra:',
  '{"code":"<codigo valido o null>","central":<true|false>,"reply":"<frase corta>"}',
  'Codigos validos: 10-5 vigilancia, 10-6 ocupado, 10-7 fuera de servicio, 10-8 en servicio,',
  '10-11 detencion de trafico, 10-15 persona sospechosa, 10-23 llego a la escena, 10-50 accidente grave,',
  '10-97 funcionario de bienes, 10-98 disponible, 10-99 oficial en apuros, 10-100 oficial caido (panico).',
  'central=true si le habla a central o pide cambiar su estado.',
  'reply: natural y corto (max 130 caracteres), empieza con "10-4", menciona el codigo y su significado.',
  'Si no se entiende nada: {"code":null,"central":false,"reply":""}',
].join(' ');

const CASES = [
  'para central mostrarme 10 o 8',
  'que lo ser uno para centrarlo.',
  'muestrame en diaz ocho para central',
  '1kilo01 para central estoy en 10-6',
  'buenas noches a todos',
];

const MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];

(async () => {
  for (const model of MODELS) {
    console.log('\n=== ' + model + ' ===');
    for (const user of CASES) {
      const t0 = Date.now();
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
          body: JSON.stringify({
            model, temperature: 0.2, max_tokens: 200,
            messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
          }),
        });
        const ms = Date.now() - t0;
        if (!r.ok) { console.log('  HTTP ' + r.status + ' en ' + ms + 'ms'); continue; }
        const j = await r.json();
        const txt = (j.choices[0].message.content || '').replace(/\s+/g, ' ').trim();
        console.log(`  ${ms}ms | "${user}" → ${txt.slice(0, 150)}`);
      } catch (e) {
        console.log('  ERR ' + e.message);
      }
    }
  }
})();
