/**
 * Try common Supabase pooler URLs for project xmilhrvlmwkcphtheanx (eu-west-1).
 * Usage: set SUPABASE_DB_PASSWORD=yourpass && node scripts/try-supabase-urls.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Client } = require('pg');

const password =
  process.env.SUPABASE_DB_PASSWORD ||
  (() => {
    const u = process.env.DATABASE_URL;
    if (!u) return null;
    try {
      const parsed = new URL(u.replace(/^postgresql:\/\//, 'http://'));
      return decodeURIComponent(parsed.password || '');
    } catch {
      return null;
    }
  })();
if (!password) {
  console.error('Set SUPABASE_DB_PASSWORD=your_database_password');
  process.exit(1);
}

const ref = 'xmilhrvlmwkcphtheanx';
const urls = [
  `postgresql://postgres.${ref}:${password}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require`,
  `postgresql://postgres.${ref}:${password}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require`,
  `postgresql://postgres.${ref}:${password}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require`,
  `postgresql://postgres.${ref}:${password}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require`,
  `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/postgres?sslmode=require`,
];

async function tryUrl(url) {
  const safe = url.replace(/:([^:@/]+)@/, ':****@');
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    console.log('OK:', safe);
    return url;
  } catch (e) {
    console.log('FAIL:', safe, '—', e.message);
    try {
      await client.end();
    } catch (_) {}
    return null;
  }
}

(async () => {
  for (const url of urls) {
    const ok = await tryUrl(url);
    if (ok) {
      const fs = require('fs');
      const out = require('path').join(__dirname, '../.supabase-url.tmp');
      fs.writeFileSync(out, ok, 'utf8');
      console.log('\nWorking URL saved to server/.supabase-url.tmp');
      console.log(`set DATABASE_URL=${ok}`);
      process.exit(0);
    }
  }
  console.log('\nNo URL worked. Try: phone hotspot, disable VPN, or run migrate on Render Shell.');
  process.exit(1);
})();
