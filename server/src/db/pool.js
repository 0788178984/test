const { Pool } = require('pg');

let pool = null;

/**
 * PostgreSQL pool (Supabase). Only created when DATABASE_URL is set.
 * Supabase requires SSL; use ?sslmode=require in the URL or PGSSLMODE=require.
 */
function getPool() {
  if (pool) return pool;

  let connectionString = String(process.env.DATABASE_URL).trim();
  if (!connectionString) {
    return null;
  }

  if (
    connectionString.includes('supabase.com') &&
    !connectionString.includes('uselibpqcompat=')
  ) {
    const join = connectionString.includes('?') ? '&' : '?';
    connectionString += `${join}uselibpqcompat=true`;
  }

  const ssl =
    process.env.PGSSLMODE === 'disable'
      ? false
      : { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== '0' };

  pool = new Pool({
    connectionString,
    ssl,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 30000),
  });

  pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
  });

  return pool;
}

async function ping() {
  const p = getPool();
  if (!p) return false;
  await p.query('SELECT 1');
  return true;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, ping, closePool };
