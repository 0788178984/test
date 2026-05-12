/**
 * After `npm install`, verify better-sqlite3 matches this Node's ABI; if not, reinstall once.
 */
const { execSync } = require('child_process');
const path = require('path');

function tryLoad() {
  try {
    const Database = require('better-sqlite3');
    const d = new Database(':memory:');
    d.prepare('SELECT 1').get();
    d.close();
    return true;
  } catch {
    return false;
  }
}

if (tryLoad()) process.exit(0);

console.warn(
  '[postinstall] better-sqlite3 failed to load for Node',
  process.version,
  '— running reinstall:sqlite …'
);
execSync(`node "${path.join(__dirname, 'reinstall-better-sqlite3.cjs')}"`, {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});

if (!tryLoad()) {
  console.error(
    '[postinstall] better-sqlite3 still fails. Use Node 22 LTS (see .nvmrc) or install VS Build Tools and run: npm run reinstall:sqlite'
  );
  process.exit(1);
}
