import * as m from 'file:///C:/Users/13462/OneDrive/Desktop/houston-web1ww/central-bot/integration/_localtest/central.js';

const casos = [
  ["shot's fired, shot's fired", true],
  ['Shots Fired', true],
  ["Shot's Fired", true],
  ['shots fired', true],
];
let bad = 0;
for (const [t, want] of casos) {
  const got = m.esDisparos(t);
  console.log((got === want ? 'PASS ' : 'FAIL ') + JSON.stringify(t) + ' → ' + got);
  if (got !== want) bad++;
}
console.log(bad ? bad + ' fallos' : 'todo OK');
