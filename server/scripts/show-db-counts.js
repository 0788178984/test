/**
 * Row counts from Supabase (DATABASE_URL). Run: npm run db:counts
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Client } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}

let connectionString = url;
if (connectionString.includes('supabase.com') && !connectionString.includes('uselibpqcompat=')) {
  connectionString += (connectionString.includes('?') ? '&' : '?') + 'uselibpqcompat=true';
}

const tables = ['businesses', 'users', 'products', 'customers', 'sales', 'sale_items', 'suppliers'];

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== '0' },
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 30000),
  });
  await client.connect();
  console.log('Supabase (PostgreSQL) row counts:');
  try {
    const biz = await client.query(
      `SELECT id, business_code, name, COALESCE(business_type, 'supermarket') AS business_type
       FROM businesses ORDER BY name`
    );
    console.log('\nStores in database:');
    if (biz.rows.length === 0) console.log('  (none)');
    for (const row of biz.rows) {
      console.log(`  ${row.business_code} — ${row.name} [${row.business_type}] (${row.id})`);
    }
    console.log('');
  } catch (e) {
    console.log('  businesses list failed:', e.message);
  }
  for (const t of tables) {
    try {
      const res = await client.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
      console.log(`  ${t}: ${res.rows[0].c}`);
    } catch (e) {
      console.log(`  ${t}: (${e.message})`);
    }
  }
  await client.end();
}

main().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
