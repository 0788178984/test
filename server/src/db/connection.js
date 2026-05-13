const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * Single source of truth for the SQLite file path.
 * - If DB_PATH is set: when not absolute, resolved relative to the **repository root** (parent of `server/`), same as the default path, so `./data/supermarket.db` always means `<repo>/data/supermarket.db`.
 * - Otherwise: `<repo-root>/data/supermarket.db`.
 */
function resolveDbPath() {
  const repoRoot = path.join(__dirname, '../../..');
  const raw = process.env.DB_PATH && String(process.env.DB_PATH).trim();
  if (raw) {
    const resolved = path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    return resolved;
  }
  const dataDir = path.join(repoRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'supermarket.db');
}

const dbPath = resolveDbPath();
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Run migrations (idempotent SQL)
const migrationPath = path.join(__dirname, 'migrations/001_init.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
try {
  db.exec(migration);
  console.log('Database migrations completed');
} catch (err) {
  console.error('Migration error:', err);
}

const { migrate: migrateMultiTenant } = require('./multiTenantMigrate');
try {
  migrateMultiTenant(db);
} catch (err) {
  console.error('Multi-tenant migration error:', err);
}

module.exports = db;
