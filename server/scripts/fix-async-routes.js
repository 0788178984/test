const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, '../src/routes'),
  path.join(__dirname, '../src/services'),
  path.join(__dirname, '../src/sync'),
];

function patch(file) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes('await db.')) return;

  const before = s;
  s = s.replace(/\(req, res\) =>/g, 'async (req, res) =>');
  s = s.replace(/async async \(req, res\)/g, 'async (req, res)');
  s = s.replace(/await db\.transaction\(\(\) => \{/g, 'await db.transaction(async (tx) => {');
  s = s.replace(/await db\.transaction\(async \(\) => \{/g, 'await db.transaction(async (tx) => {');
  // Inside transaction callbacks, use tx connection
  s = s.replace(
    /await db\.transaction\(async \(tx\) => \{([\s\S]*?)\n    \}\)\(\);/g,
    (m, body) => `await db.transaction(async (tx) => {${body.replace(/await db\.prepare\(/g, 'await tx.prepare(')}\n    });`
  );
  s = s.replace(/\}\)\(\);/g, '});');

  if (s !== before) fs.writeFileSync(file, s);
}

for (const dir of dirs) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name.endsWith('.js')) patch(p);
  }
}
console.log('done');
