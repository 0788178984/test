/**
 * One-time: prefix db.prepare( with await (skip if already awaited).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../src');
const SKIP = new Set([
  path.normalize('db/facade.js'),
  path.normalize('db/connection.js'),
  path.normalize('db/constants.js'),
]);

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
  s = s.replace(/(?<!await )db\.prepare\(/g, 'await db.prepare(');
  s = s.replace(/await await db\.prepare\(/g, 'await db.prepare(');
  s = s.replace(/(?<!await )db\.transaction\(/g, 'await db.transaction(');
  s = s.replace(/await await db\.transaction\(/g, 'await db.transaction(');

  if (s !== before) {
    fs.writeFileSync(file, s);
    console.log('updated', rel);
  }
}
