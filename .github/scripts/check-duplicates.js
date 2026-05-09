// .github/scripts/check-duplicates.js
const fs   = require('fs');
const path = require('path');

const ids   = [];
const dupes = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory())                                  { walk(full); continue; }
    if (!f.name.endsWith('.json') || f.name.includes('test')) continue;
    const raw   = JSON.parse(fs.readFileSync(full, 'utf8'));
    const items = Array.isArray(raw) ? raw : [raw];
    for (const q of items) {
      if (!q.id) continue;
      if (ids.includes(q.id)) dupes.push({ id: q.id, file: full });
      else ids.push(q.id);
    }
  }
}

walk('questions/');

if (dupes.length > 0) {
  console.error('❌ Duplicate question IDs found:');
  dupes.forEach(d => console.error(`   ${d.id}  in  ${d.file}`));
  process.exit(1);
}
console.log(`✅ No duplicate IDs across ${ids.length} questions.`);
