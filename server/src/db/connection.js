const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'supermarket.db');
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
