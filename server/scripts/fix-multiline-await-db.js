/**
 * Add await before db.prepare / db.transaction when split across lines:
 *   const x = db
 *     .prepare(...)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../src');
const SKIP = new Set(['db/connection.js', 'db/postgres.js', 'db/pool.js']);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (SKIP.has(rel)) continue;

  let s = fs.readFileSync(file, 'utf8');
  const before = s;

  s = s.replace(/(?<!await )db\s*\n(\s*)\.prepare\(/g, 'await db\n$1.prepare(');
  s = s.replace(/(?<!await )db\s*\n(\s*)\.transaction\(/g, 'await db\n$1.transaction(');
  s = s.replace(/await await db/g, 'await db');

  if (s !== before) {
    fs.writeFileSync(file, s);
    console.log('updated', rel);
  }
}

console.log('done');
