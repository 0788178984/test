/**
 * Idempotent schema patches applied on server start (and before developer store APIs).
 * Split statements so Supabase pooler / node-pg handle DDL reliably.
 */
async function applyBusinessTypePatch(pool) {
  if (!pool) return;

  const steps = [
    {
      sql: `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'supermarket'`,
      ignore: ['42701'],
    },
    {
      sql: `UPDATE businesses SET business_type = 'supermarket' WHERE business_type IS NULL OR trim(business_type) = ''`,
      ignore: [],
    },
    {
      sql: `ALTER TABLE businesses ALTER COLUMN business_type SET DEFAULT 'supermarket'`,
      ignore: [],
    },
  ];

  for (const { sql, ignore } of steps) {
    try {
      await pool.query(sql);
    } catch (e) {
      if (ignore.includes(e.code)) continue;
      console.warn('[schema] business_type step:', e.message);
    }
  }

  try {
    await pool.query(`ALTER TABLE businesses ALTER COLUMN business_type SET NOT NULL`);
  } catch (e) {
    if (e.code !== '23502') {
      console.warn('[schema] business_type NOT NULL:', e.message);
    }
  }

  try {
    await pool.query(`ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_business_type_check`);
    await pool.query(`
      ALTER TABLE businesses
      ADD CONSTRAINT businesses_business_type_check
      CHECK (business_type IN ('supermarket', 'clinic'))
    `);
  } catch (e) {
    if (e.code !== '42710') {
      console.warn('[schema] business_type check constraint:', e.message);
    }
  }
}

async function applyCreditSalesPatch(pool) {
  if (!pool) return;

  const columnSteps = [
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit DOUBLE PRECISION DEFAULT 0`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_balance DOUBLE PRECISION DEFAULT 0`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_enabled INTEGER DEFAULT 0`,
    `ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_type TEXT DEFAULT 'retail'`,
    `ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'paid'`,
    `ALTER TABLE sales ADD COLUMN IF NOT EXISTS balance_due DOUBLE PRECISION DEFAULT 0`,
    `ALTER TABLE sales ADD COLUMN IF NOT EXISTS credit_due_date TEXT`,
    `ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS is_wholesale INTEGER DEFAULT 0`,
  ];

  for (const sql of columnSteps) {
    try {
      await pool.query(sql);
    } catch (e) {
      if (e.code !== '42701') console.warn('[schema] credit column:', e.message);
    }
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_payments (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        sale_id TEXT REFERENCES sales(id),
        amount DOUBLE PRECISION NOT NULL CHECK (amount > 0),
        payment_method TEXT NOT NULL DEFAULT 'cash'
          CHECK (payment_method IN ('cash', 'mtn_momo', 'airtel_money', 'bank', 'other')),
        payment_reference TEXT,
        notes TEXT,
        recorded_by TEXT NOT NULL REFERENCES users(id),
        business_id TEXT REFERENCES businesses(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        sync_status TEXT DEFAULT 'pending'
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cart_audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        product_name TEXT,
        quantity DOUBLE PRECISION,
        line_amount DOUBLE PRECISION,
        cart_total DOUBLE PRECISION,
        meta TEXT DEFAULT '{}',
        business_id TEXT REFERENCES businesses(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (e) {
    console.warn('[schema] credit tables:', e.message);
  }

  try {
    await pool.query(`ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check`);
    await pool.query(`
      ALTER TABLE sales
      ADD CONSTRAINT sales_payment_method_check
      CHECK (payment_method IN ('cash', 'mtn_momo', 'airtel_money', 'mixed', 'credit'))
    `);
  } catch (e) {
    if (e.code !== '42710') console.warn('[schema] sales payment_method check:', e.message);
  }

  try {
    await pool.query(`ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_status_check`);
    await pool.query(`
      ALTER TABLE sales
      ADD CONSTRAINT sales_payment_status_check
      CHECK (payment_status IN ('paid', 'partial', 'credit'))
    `);
  } catch (e) {
    if (e.code !== '42710') console.warn('[schema] sales payment_status check:', e.message);
  }

  try {
    await pool.query(`ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_sale_type_check`);
    await pool.query(`
      ALTER TABLE sales
      ADD CONSTRAINT sales_sale_type_check
      CHECK (sale_type IN ('retail', 'wholesale'))
    `);
  } catch (e) {
    if (e.code !== '42710') console.warn('[schema] sales sale_type check:', e.message);
  }
}

async function applyAllSchemaPatches(pool) {
  await applyBusinessTypePatch(pool);
  await applyCreditSalesPatch(pool);
}

module.exports = { applyBusinessTypePatch, applyCreditSalesPatch, applyAllSchemaPatches };
