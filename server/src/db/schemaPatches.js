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

module.exports = { applyBusinessTypePatch };
