import * as m from './central.js';

let bad = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) bad++; };

console.log('— transcripciones REALES del servidor —');
// lo que whisper-tiny devolvió en las pruebas de ayer
ok(m.wantsCentral('que lo ser uno para centrarlo.', true) === true, 'centrarlo → central');
ok(m.wantsCentral('1,000 kilómetros de 1 para entrar en la misma manera.', true) === true, '"para entrar" → central');
ok(m.wantsCentral('a la vez como que me detectó 1 km de uno para entrar en el mismo manera. ¿Cói?', true) === true, 'otro "para entrar" → central');
ok(m.wantsCentral('Entonces, también es un problema.', true) === false, 'charla común → ignora');
ok(m.wantsCentral('paste en video', true) === false, 'ruido → ignora');

console.log('— frases en español mexicano (sin números) —');
ok(m.extractStatusCode('en servicio para central', true) === '10-8', '"en servicio" → 10-8');
ok(m.extractStatusCode('fuera de servicio central', true) === '10-7', '"fuera de servicio" → 10-7');
ok(m.extractStatusCode('voy ocupado para central', true) === '10-6', '"ocupado" → 10-6');
ok(m.extractStatusCode('de camino al sitio para central', true) === '10-97', '"de camino" → 10-97');
ok(m.extractStatusCode('hay accidente para central', true) === '10-50', '"accidente" → 10-50');
ok(m.extractStatusCode('sospechoso en el lugar para central', true) === '10-15', '"sospechoso" → 10-15');
ok(m.extractStatusCode('en vigilancia para central', true) === '10-5', '"vigilancia" → 10-5');

console.log('— números como los escribe whisper —');
ok(m.extractStatusCode('10-8 para central', true) === '10-8', '"10-8"');
ok(m.extractStatusCode('estoy en 10 8 para central', true) === '10-8', '"10 8" sin guion');
ok(m.extractStatusCode('10.7 central', true) === '10-7', '"10.7"');
ok(m.extractStatusCode('diez ocho para central', true) === '10-8', '"diez ocho"');
ok(m.extractStatusCode('10-100 para central', true) === '10-100', '"10-100"');

console.log('— chat (sin cambios raros) —');
ok(m.extractStatusCode('1K-01 Muestrame en 10-8 en servicio', false) === '10-8', 'chat 10-8');
ok(m.extractStatusCode('ya estoy en servicio', false) === null, 'chat: frase NO mapea (solo voz)');
ok(m.wantsCentral('1K-01 para central', false) === true, 'chat "para central"');
ok(m.wantsCentral('estoy en la central', false) === false, 'chat: "en la central" no dispara');

console.log('- respuestas (Copiado, sin 10-4 ni "quedo atento") -');
ok(m.replyFor('10-5') === 'Copiado, te marco en 10-5, vigilancia.', 'reply 10-5 → Copiado + significado');
ok(m.replyFor('10-8', 'Copiado, 1K-01 te marco en ') === 'Copiado, 1K-01 te marco en 10-8, en servicio.', 'reply con placa');
ok(!/10-4/.test(m.replyFor('10-6')), 'ya no dice 10-4');
ok(!/atento/i.test(m.replyFor('10-11')), 'ya no dice "quedo atento"');
ok(/Negativo/.test(m.MSG_NO_SHIFT), 'sin turno → Negativo');
ok(!/10-2/.test(m.MSG_NO_SHIFT), 'sin turno: ya no dice 10-2');

console.log('- ubicación y 10-97 -');
ok(m.wantsLocation('¿dónde estoy para central?') === true, 'pide "dónde estoy"');
ok(m.wantsLocation('mi ubicación') === true, 'pide "mi ubicación"');
ok(m.wantsLocation('¿qué postal tengo?') === true, 'pide "qué postal"');
ok(m.wantsLocation('10-8 para central') === false, 'un código no es ubicación');
ok(m.labelFor('10-97') === 'en ruta', '10-97 = "en ruta"');
ok(m.replyFor('10-97') === 'Copiado, te marco en 10-97, en ruta.', 'reply 10-97 con "en ruta"');
ok(m.labelFor('10-15') === 'persona bajo custodia', '10-15 = "persona bajo custodia"');
ok(m.replyFor('10-15') === 'Copiado, te marco en 10-15, persona bajo custodia.', 'reply 10-15 con "bajo custodia"');
ok(m.extractStatusCode('bajo custodia para central', true) === '10-15', 'voz: "bajo custodia" → 10-15');
ok(m.extractStatusCode('10-80 para central', true) === '10-80', '10-80 directo');
ok(m.extractStatusCode('hay persecución activa', true) === '10-80', 'voz: "persecución" → 10-80');
ok(m.labelFor('10-80') === 'persecución activa', '10-80 = "persecución activa"');
ok(m.replyFor('10-80') === 'Copiado, te marco en 10-80, persecución activa.', 'reply 10-80');

console.log('- código 4 (escena bajo control) -');
ok(m.esCodigo4('la escena pasó a código 4') === true, '"pasó a código 4"');
ok(m.esCodigo4('central muestra la escena codigo 4 finalizando') === true, '"codigo 4" sin acento');
ok(m.esCodigo4('todo en code 4') === true, '"code 4"');
ok(m.esCodigo4('escena en CODIGO 4') === true, 'mayúsculas');
ok(m.esCodigo4('10-4 recibido') === false, '"10-4" NO es código 4');
ok(m.esCodigo4('codigo 40') === false, '"codigo 40" no cuenta');

console.log('- médico / grúa (derivación de canal) -');
ok(m.wantsMedical('necesito atención médica para central') === true, 'atención médica');
ok(m.wantsMedical('hay un herido en la escena') === true, 'herido');
ok(m.wantsMedical('ambulancia por favor') === true, 'ambulancia');
ok(m.wantsMedical('10-8 para central') === false, 'un código no es médico');
ok(m.wantsTow('necesito una grúa acá') === true, 'grúa');
ok(m.wantsTow('me quedé varado, remolque') === true, 'varado/remolque');
ok(m.wantsTow('atención médica urgente') === false, 'médico no es grúa');

console.log('- disparos / shots fired (pánico) -');
ok(m.esDisparos('disparos disparos disparos') === true, '"disparos" x3');
ok(m.esDisparos("shot's fired, shot's fired") === true, '"shot\'s fired"');
ok(m.esDisparos('Shots Fired') === true, 'mayúsculas');
ok(m.esDisparos('nos están disparando, ayuda') === true, 'urgencia con 1 disparo');
ok(m.esDisparos('los disparos de ayer') === false, 'mención casual NO dispara');

console.log(bad ? `\n${bad} FALLOS` : '\nTODO OK');
process.exitCode = bad ? 1 : 0;
