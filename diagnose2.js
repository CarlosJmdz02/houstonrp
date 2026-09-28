const fs = require('fs');
const iconv = require('iconv-lite');

// Check one file in detail
const content = fs.readFileSync('licencias.html', 'utf8');

// Find all the garbled emoji sequences in the raw content
// Emoji garbled sequences start with 'ð' (U+00F0) followed by other high chars
const garbledMatches = content.match(/ð./g) || [];
console.log('Garbled emoji-like sequences in licencias.html:');
const unique = new Set();
for (const m of garbledMatches) {
  unique.add(m);
}
for (const m of unique) {
  const codes = [...m].map(c => 'U+' + c.codePointAt(0).toString(16).padStart(4, '0').toUpperCase());
  console.log(`  "${m}" (${codes.join(' ')})`);
}

// Now try reverse encoding and see where replacement chars appear
const winBytes = iconv.encode(content, 'windows-1252');
const fixed = iconv.decode(winBytes, 'utf-8');

// Find replacement characters and their context
const fffdPositions = [];
for (let i = 0; i < fixed.length; i++) {
  if (fixed.charCodeAt(i) === 0xFFFD) {
    fffdPositions.push(i);
  }
}

if (fffdPositions.length > 0) {
  console.log(`\n${fffdPositions.length} replacement characters found in fixed text`);
  for (const pos of fffdPositions.slice(0, 10)) {
    console.log(`  Context: "${fixed.slice(Math.max(0, pos-20), pos+20)}"`);
  }
} else {
  console.log('\nNo replacement characters - reverse encoding worked perfectly!');
}

// Check if there are remaining garbled characters (double-encoded text not reversed)
const remainingGarbled = fixed.match(/[\u00C0-\u0FFFD]/g) || [];
const nonAsciiNonEmoji = remainingGarbled.filter(c => {
  const code = c.codePointAt(0);
  // Keep valid extended ASCII and emoji
  return false;
});

// Check for remaining mojibake patterns like Ã, ð, â
const mojibake = fixed.match(/[\u00C3\u00C2\u00C2\u00F0\u00EF\u00FA\u00ED\u00E1\u00E9]/g) || [];
if (mojibake.length > 0) {
  console.log(`\nStill ${mojibake.length} mojibake characters remaining`);
  console.log('Sample:', JSON.stringify(mojibake.slice(0, 10)));
} else {
  console.log('\nNo mojibake characters remaining - encoding fully fixed!');
}
