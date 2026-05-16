const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function walk(dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (n.endsWith('.js')) out.push(p);
  }
  return out;
}

let failed = 0;
for (const f of walk(path.join(__dirname, '../src'))) {
  try {
    execSync(`node --check "${f}"`, { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.log(path.relative(path.join(__dirname, '..'), f));
    console.log(String(e.stderr || e.stdout).split('\n').slice(0, 3).join('\n'));
  }
}
process.exit(failed ? 1 : 0);
