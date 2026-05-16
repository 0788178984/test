const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../src');
const SKIP = new Set([
  'db/connection.js',
  'db/postgres.js',
  'db/pool.js',
  'db/sqlTranslate.js',
  'db/constants.js',
]);

function walk(dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (n.endsWith('.js')) out.push(p);
  }
  return out;
}

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (SKIP.has(rel)) continue;

  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes('db.prepare') && !s.includes('db.transaction')) continue;

  const before = s;
  if (!s.includes('await db.prepare')) {
    s = s.replace(/(?<!await )db\.prepare\(/g, 'await db.prepare(');
    s = s.replace(/await await db\.prepare\(/g, 'await db.prepare(');
  }
  if (s.includes('db.transaction')) {
    s = s.replace(/(?<!await )db\.transaction\(/g, 'await db.transaction(');
    s = s.replace(/await await db\.transaction\(/g, 'await db.transaction(');
    s = s.replace(/await db\.transaction\(\(\) => \{/g, 'await db.transaction(async (tx) => {');
    s = s.replace(/await db\.transaction\(async \(\) => \{/g, 'await db.transaction(async (tx) => {');
    s = s.replace(/\}\)\(\);/g, '});');
  }
  s = s.replace(/\(req, res\) =>/g, 'async (req, res) =>');
  s = s.replace(/async async \(req, res\)/g, 'async (req, res)');

  if (s !== before) fs.writeFileSync(file, s);
}
console.log('pg-convert done');
