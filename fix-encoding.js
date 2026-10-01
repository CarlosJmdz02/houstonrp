const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const ROOT = __dirname;
const SKIP = new Set(['node_modules', '.git', 'supabase', '.temp']);
const EXT = /\.(html|js|css)$/i;

const CP1252_CHARS = (() => {
  let chars = '';
  for (let cp = 0x80; cp <= 0xFF; cp++) chars += String.fromCharCode(cp);
  for (const cp of [0x0152,0x0153,0x0160,0x0161,0x0178,0x017D,0x017E,0x0192,0x02C6,0x02DC,0x2013,0x2014,0x2018,0x2019,0x201A,0x201C,0x201D,0x201E,0x2020,0x2021,0x2022,0x2026,0x2030,0x2039,0x203A,0x20AC,0x2122]) chars += String.fromCharCode(cp);
  return chars;
})();

const RUN_RE = new RegExp('[' + CP1252_CHARS.replace(/[-\]\\]/g, '\\$&') + ']+', 'g');

const SPECIAL = {0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F};

function encodeRun(run) {
  const bytes = [];
  for (const ch of run) {
    const cp = ch.codePointAt(0);
    if (cp <= 0xFF) bytes.push(cp);
    else if (SPECIAL[cp] !== undefined) bytes.push(SPECIAL[cp]);
    else return null;
  }
  return Buffer.from(bytes);
}

function tryFixRun(run) {
  const R = String.fromCharCode(0xFFFD);
  const buf = encodeRun(run);
  if (!buf) return run;
  const dec = iconv.decode(buf, 'utf8');
  if (dec.includes(R) || dec === run) return run;
  if (!iconv.encode(dec, 'utf8').equals(buf)) return run;
  return dec;
}

function fixContent(content) {
  let cur = content;
  for (let pass = 0; pass < 3; pass++) {
    const next = cur.replace(RUN_RE, tryFixRun);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) walk(path.join(dir, entry.name));
    } else if (EXT.test(entry.name)) {
      const file = path.join(dir, entry.name);
      const original = fs.readFileSync(file, 'utf8');
      const fixed = fixContent(original);
      if (fixed !== original) {
        fs.writeFileSync(file, fixed, 'utf8');
        console.log('fixed', path.relative(ROOT, file));
      }
    }
  }
}

walk(ROOT);
console.log('done');
