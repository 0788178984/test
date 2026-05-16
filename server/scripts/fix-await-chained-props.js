/**
 * Fix: await db.prepare(...).get(x).count  →  (await db.prepare(...).get(x)).count
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../src');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const re =
  /await (db[\s\S]*?\.get\([^)]*\))\.(count|last_sync|total|last_sync_at)/g;

for (const file of walk(ROOT)) {
  let s = fs.readFileSync(file, 'utf8');
  const before = s;
  s = s.replace(re, '(await $1).$2');
  if (s !== before) {
    fs.writeFileSync(file, s);
    console.log('fixed', path.relative(ROOT, file));
  }
}

console.log('done');
