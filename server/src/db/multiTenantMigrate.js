/**
 * Idempotent migration: businesses, tenant columns, developer role, notifications v2.
 */
const crypto = require('crypto');
const DEFAULT_BUSINESS_ID = 'biz-default';

function tableExists(db, name) {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(name);
}

function columnNames(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function migrate(db) {
  db.exec(`
      CREATE TABLE IF NOT EXISTS businesses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        business_code TEXT NOT NULL UNIQUE,
        subscription_status TEXT NOT NULL DEFAULT 'trial'
          CHECK(subscription_status IN ('active','trial','suspended','expired')),
        subscription_expires_at TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    db.prepare(`
      INSERT OR IGNORE INTO businesses (id, name, business_code, subscription_status, subscription_expires_at)
      VALUES (?, 'Default Store', 'DEFAULT', 'active', NULL)
    `).run(DEFAULT_BUSINESS_ID);

    const businessCols = tableExists(db, 'businesses') ? columnNames(db, 'businesses') : [];
    if (tableExists(db, 'businesses') && !businessCols.includes('payment_config')) {
      db.exec(`ALTER TABLE businesses ADD COLUMN payment_config TEXT`);
    }

    if (!tableExists(db, 'mobile_money_transactions')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS mobile_money_transactions (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
          external_id TEXT NOT NULL UNIQUE,
          business_id TEXT REFERENCES businesses(id),
          reference TEXT,
          method TEXT NOT NULL,
          phone TEXT,
          amount REAL,
          status TEXT,
          provider_response TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT,
          sync_status TEXT DEFAULT 'pending'
        );
      `);
    } else {
      const mmCols = columnNames(db, 'mobile_money_transactions');
      if (!mmCols.includes('business_id')) {
        db.exec(`ALTER TABLE mobile_money_transactions ADD COLUMN business_id TEXT REFERENCES businesses(id)`);
      }
    }

    const tenantTables = [
      'suppliers',
      'products',
      'customers',
      'sales',
      'stock_adjustments',
      'loyalty_transactions',
    ];

    for (const t of tenantTables) {
      if (!tableExists(db, t)) continue;
      const cols = columnNames(db, t);
      if (!cols.includes('business_id')) {
        db.exec(`ALTER TABLE ${t} ADD COLUMN business_id TEXT REFERENCES businesses(id)`);
        db.prepare(`UPDATE ${t} SET business_id = ? WHERE business_id IS NULL`).run(DEFAULT_BUSINESS_ID);
      }
    }

    const userCols = tableExists(db, 'users') ? columnNames(db, 'users') : [];
    if (tableExists(db, 'users') && !userCols.includes('business_id')) {
      db.pragma('foreign_keys = OFF');
      db.exec(`
        CREATE TABLE users__migrated (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          pin TEXT NOT NULL,
          password_hash TEXT,
          role TEXT NOT NULL CHECK(role IN ('developer','admin','manager','cashier')),
          business_id TEXT REFERENCES businesses(id),
          is_active INTEGER DEFAULT 1,
          last_login TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          sync_status TEXT DEFAULT 'pending',
          deleted_at TEXT,
          CHECK (
            (role = 'developer' AND business_id IS NULL) OR
            (role != 'developer' AND business_id IS NOT NULL)
          )
        );
      `);
      db.prepare(`
        INSERT INTO users__migrated (
          id, name, email, phone, pin, password_hash, role, business_id,
          is_active, last_login, created_at, updated_at, sync_status, deleted_at
        )
        SELECT
          id, name, email, phone, pin, password_hash, role, ?,
          is_active, last_login, created_at, updated_at, sync_status, deleted_at
        FROM users
      `).run(DEFAULT_BUSINESS_ID);
      db.exec(`DROP TABLE users; ALTER TABLE users__migrated RENAME TO users;`);
      db.pragma('foreign_keys = ON');
    }

    if (!tableExists(db, 'support_requests')) {
      db.exec(`
        CREATE TABLE support_requests (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          business_id TEXT NOT NULL REFERENCES businesses(id),
          from_user_id TEXT NOT NULL REFERENCES users(id),
          subject TEXT NOT NULL,
          body TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed')),
          developer_notes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
    }

    const nCols = tableExists(db, 'notifications') ? columnNames(db, 'notifications') : [];
    if (tableExists(db, 'notifications') && !nCols.includes('deleted_at')) {
      db.exec(`ALTER TABLE notifications ADD COLUMN deleted_at TEXT`);
    }

    const nNotif = tableExists(db, 'notifications') ? columnNames(db, 'notifications') : [];
    if (tableExists(db, 'notifications') && (!nNotif.includes('business_id') || !nNotif.includes('sender_user_id'))) {
      db.pragma('foreign_keys = OFF');
      db.exec(`
        CREATE TABLE notifications__migrated (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          severity TEXT DEFAULT 'info' CHECK(severity IN ('info','warning','danger','success')),
          target_role TEXT,
          target_user_id TEXT,
          business_id TEXT REFERENCES businesses(id),
          sender_user_id TEXT REFERENCES users(id),
          is_read INTEGER DEFAULT 0,
          channels TEXT DEFAULT '[]',
          sent_via TEXT DEFAULT '[]',
          meta TEXT DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now')),
          sync_status TEXT DEFAULT 'pending',
          FOREIGN KEY (target_user_id) REFERENCES users(id)
        );
      `);
      db.prepare(`
        INSERT INTO notifications__migrated (
          id, type, title, message, severity, target_role, target_user_id,
          business_id, sender_user_id, is_read, channels, sent_via, meta, created_at, sync_status
        )
        SELECT
          id, type, title, message, severity, target_role, target_user_id,
          ?, NULL, is_read, channels, sent_via, meta, created_at, sync_status
        FROM notifications
      `).run(DEFAULT_BUSINESS_ID);
      db.exec(`DROP TABLE notifications; ALTER TABLE notifications__migrated RENAME TO notifications;`);
      db.pragma('foreign_keys = ON');
    }

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_staff_email
      ON users(business_id, lower(trim(email)))
      WHERE email IS NOT NULL AND deleted_at IS NULL AND role != 'developer';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_developer_email
      ON users(lower(trim(email)))
      WHERE email IS NOT NULL AND deleted_at IS NULL AND role = 'developer';

      CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
      CREATE INDEX IF NOT EXISTS idx_sales_business ON sales(business_id);
      CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);
      CREATE INDEX IF NOT EXISTS idx_suppliers_business ON suppliers(business_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_business ON notifications(business_id);
      CREATE INDEX IF NOT EXISTS idx_support_business ON support_requests(business_id);
    `);

    // Older bootstrap-admin inserts could omit id → NULL primary key; JWT then breaks every /api/* call (401 loop back to login).
    if (tableExists(db, 'users')) {
      const orphans = db
        .prepare(
          `SELECT rowid FROM users WHERE (id IS NULL OR trim(id) = '') AND deleted_at IS NULL`
        )
        .all();
      for (const { rowid } of orphans) {
        const newId = `usr-${crypto.randomBytes(12).toString('hex')}`;
        db.prepare(
          `UPDATE users SET id = ?, updated_at = datetime('now'), sync_status = 'pending' WHERE rowid = ?`
        ).run(newId, rowid);
      }
      if (orphans.length) {
        console.log(`Repaired ${orphans.length} user row(s) with missing id.`);
      }
    }

  console.log('Multi-tenant schema ready.');
}

module.exports = { migrate, DEFAULT_BUSINESS_ID };
