const fs = require('fs');
const iconv = require('iconv-lite');

const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));

// First, let's see what garbled characters exist in the ORIGINAL files (before fix)
// by looking for non-ASCII characters that aren't part of normal HTML/CSS
const garbledChars = new Set();

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  // Look for the characteristic mojibake patterns: Ã, â€, etc.
  for (const ch of content) {
    const code = ch.charCodeAt(0);
    // Look for characters in the garbled range
    if (code >= 0xC0 && code <= 0xFF) {
      garbledChars.add(ch);
    }
  }
}

console.log('Garbled characters found in raw files:');
for (const ch of garbledChars) {
  console.log(`  '${ch}' U+${ch.codePointAt(0).toString(16).toUpperCase()}`);
}

// Now let's try the reverse encoding and see what happens for each file
console.log('\n--- Testing reverse encoding ---');
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  try {
    const winBytes = iconv.encode(content, 'windows-1252');awRecuada
    const fixed = iconv.decode(winBytes, 'utf-8');
    
    // Check for remaining garbled text or replacement characters
    const hasReplacement = fixed.includes('\uFFFD');
    const hasGarbled = /[\u00C0-\u00FF]{2,}[^a-zA-Z0-9]/.test(fixed);
    
    // Also count any remaining weird sequences
    const weirdSeq = fixed.match(/Ã[\u00C0-\u00FF]/g);
    
    if (hasReplacement || weirdSeq) {
      console.log(`${file}: hasReplacement=${hasReplacement}, weirdSeq=${weirdSeq ? weirdSeq.length : 0}`);
      if (weirdSeq) {
        console.log(`  Sample: ${JSON.stringify(weirdSeq.slice(0, 5))}`);
      }
    }
  } catch(e) {
    console.log(`${file}: ERROR - ${e.message}`);
  }
}
