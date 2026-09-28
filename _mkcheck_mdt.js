const fs = require('fs');
const h = fs.readFileSync('mdt.html', 'utf8');

// Extract the main inline <script> ... </script> (the last large one, after the .js includes)
const m = h.match(/<script>\s*\(function\(\)\s*\{[\s\S]*?<\/script>/);
if (!m) { console.error('ERROR: main script block not found'); process.exit(1); }
const body = m[0].replace(/^<script>/, '').replace(/<\/script>$/, '');

try {
  // eslint-disable-next-line no-new-func
  new Function(body);
  console.log('SYNTAX OK — main <script> block (', body.length, 'chars ) parses cleanly.');
} catch (e) {
  console.error('SYNTAX ERROR in main <script>:', e.message);
  process.exit(1);
}
