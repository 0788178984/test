const fs = require('fs');
const files = ['sales.js', 'products.js', 'customers.js', 'inventory.js'].map((f) =>
  require('path').join(__dirname, '../src/routes', f)
);

for (const file of files) {
  let s = fs.readFileSync(file, 'utf8');
  s = s.replace(
    /await db\.transaction\(async \(tx\) => \{([\s\S]*?)\n    \}\);/g,
    (_, body) =>
      `await db.transaction(async (tx) => {${body.replace(/await db\.prepare\(/g, 'await tx.prepare(')}\n    });`
  );
  fs.writeFileSync(file, s);
  console.log('fixed', require('path').basename(file));
}
