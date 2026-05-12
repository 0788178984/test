/**
 * Remove every better-sqlite3 install under node_modules, then reinstall for the *current* Node ABI.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function removeBetterSqliteUnder(nmPath) {
  if (!fs.existsSync(nmPath)) return;
  const target = path.join(nmPath, 'better-sqlite3');
  if (fs.existsSync(target)) {
    console.log('Removing', target);
    fs.rmSync(target, { recursive: true, force: true });
  }
  let entries;
  try {
    entries = fs.readdirSync(nmPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === '.bin' || e.name.startsWith('.')) continue;
    const nested = path.join(nmPath, e.name, 'node_modules');
    if (fs.existsSync(nested)) removeBetterSqliteUnder(nested);
  }
}

removeBetterSqliteUnder(path.join(root, 'node_modules'));
removeBetterSqliteUnder(path.join(root, 'server', 'node_modules'));

console.log('Installing better-sqlite3 for Node', process.version, '...');
execSync(
  'npm install better-sqlite3@^12.9.0 -w uganda-supermarket-server --prefer-online --no-fund --no-audit',
  { cwd: root, stdio: 'inherit' }
);
