/**
 * Repair mismatched parentheses from fix-await-chained-props.js
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

for (const file of walk(ROOT)) {
  let s = fs.readFileSync(file, 'utf8');
  const before = s;

  // (await db.prepare(`...`).get();  →  await db.prepare(`...`).get();
  s = s.replace(/\(await (db\.prepare\(`[\s\S]*?`\)\.get\(\));/g, 'await $1;');

  // (await db ... .get(args);  →  (await db ... .get(args));
  s = s.replace(/(\(await db[\s\S]*?\.get\([^)]+\));/g, (m) => {
    if (m.endsWith('));')) return m;
    return m.slice(0, -1) + '));';
  });

  // await db ... .get(args)).count  →  (await db ... .get(args)).count
  s = s.replace(
    /(\n\s*(?:\w+ = )?)await (db[\s\S]*?\.get\([^)]+\))\)\.(count|last_sync)/g,
    '$1(await $2).$3'
  );

  // (await db.prepare(...).run(...);  →  await db.prepare(...).run(...);
  s = s.replace(/\(await (db\.prepare\([\s\S]*?\)\.run\([^)]*\));/g, 'await $1;');

  if (s !== before) {
    fs.writeFileSync(file, s);
    console.log('fixed', path.relative(ROOT, file));
  }
}

console.log('done');
