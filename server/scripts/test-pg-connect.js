require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Client } = require('pg');

let url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
if (url.includes('supabase.com') && !url.includes('uselibpqcompat=')) {
  url += (url.includes('?') ? '&' : '?') + 'uselibpqcompat=true';
}

const safe = url.replace(/:([^:@/]+)@/, ':****@');
console.log('Testing:', safe);

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== '0' },
  connectionTimeoutMillis: 20000,
});

client
  .connect()
  .then(() => client.query('SELECT 1 AS ok'))
  .then((r) => {
    console.log('OK:', r.rows[0]);
    return client.end();
  })
  .catch((e) => {
    console.error('FAIL:', e.message);
    process.exit(1);
  });
