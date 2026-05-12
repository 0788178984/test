/**
 * Validates seeded PIN logins against the DB and optionally POST /api/auth/login.
 * Run from project root: node scripts/validate-auth.cjs [--http]
 */
const path = require('path');
const http = require('http');

const serverRoot = path.join(__dirname, '..', 'server');

const db = require(path.join(serverRoot, 'src/db/connection'));
const bcrypt = require('bcryptjs');

const pins = { admin: '1234', manager: '5678', cashier: '9012' };

function validatePins() {
  const cashiers = db
    .prepare(
      `SELECT id, name FROM users WHERE role = 'cashier' AND deleted_at IS NULL`
    )
    .all();
  console.log('Cashier account(s):', cashiers.length);
  cashiers.forEach((c) => console.log(' ', c.id, c.name));

  let ok = true;

  for (const role of ['admin', 'manager', 'cashier']) {
    const rows = db
      .prepare(
        `SELECT id, pin FROM users WHERE role = ? AND is_active = 1 AND deleted_at IS NULL`
      )
      .all(role);

    if (rows.length === 0) {
      console.error(`FAIL: no active user for role "${role}"`);
      ok = false;
      continue;
    }

    let matched = false;
    for (const row of rows) {
      if (bcrypt.compareSync(pins[role], row.pin)) {
        matched = true;
        console.log(`OK PIN ${role}: matched user ${row.id}`);
        break;
      }
    }
    if (!matched) {
      console.error(
        `FAIL PIN ${role}: expected PIN ${pins[role]} did not match any of ${rows.length} user(s)`
      );
      ok = false;
    }
    if (rows.length > 1) {
      console.warn(
        `WARN: ${rows.length} users with role "${role}" — use distinct PINs per user or prefer web login`
      );
    }
  }

  return ok;
}

function httpLogin(role, pin) {
  const body = JSON.stringify({ pin, role });
  const opts = {
    hostname: '127.0.0.1',
    port: Number(process.env.PORT || 4000),
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data || '{}') });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpRequest(opts, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data || '{}') });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function validateHttp() {
  const basePort = Number(process.env.PORT || 4000);
  console.log(`HTTP checks against http://127.0.0.1:${basePort} ...`);
  let cashierToken = '';
  for (const role of ['admin', 'manager', 'cashier']) {
    const { status, json } = await httpLogin(role, pins[role]);
    if (status !== 200 || !json.token) {
      console.error(`HTTP FAIL ${role}:`, status, json);
      process.exit(1);
    }
    console.log(`HTTP OK login ${role}`);
    if (role === 'cashier') cashierToken = json.token;
  }

  const authHeaders = (token) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const sum = await httpRequest({
    hostname: '127.0.0.1',
    port: basePort,
    path: '/api/sales/today-summary',
    method: 'GET',
    headers: authHeaders(cashierToken),
  });
  if (sum.status !== 200 || sum.json?.error) {
    console.error('HTTP FAIL GET /api/sales/today-summary (cashier):', sum.status, sum.json || sum.raw);
    process.exit(1);
  }
  console.log('HTTP OK GET /api/sales/today-summary');

  const bc = await httpRequest({
    hostname: '127.0.0.1',
    port: basePort,
    path: '/api/products/barcode/1234567890123',
    method: 'GET',
    headers: authHeaders(cashierToken),
  });
  if (bc.status !== 200 || !bc.json?.product) {
    console.error('HTTP FAIL GET /api/products/barcode/...:', bc.status, bc.json || bc.raw);
    process.exit(1);
  }
  console.log('HTTP OK GET /api/products/barcode/:code');

  const cat = await httpRequest({
    hostname: '127.0.0.1',
    port: basePort,
    path: '/api/products/categories/list',
    method: 'GET',
    headers: authHeaders(cashierToken),
  });
  if (cat.status !== 200 || !Array.isArray(cat.json?.categories)) {
    console.error('HTTP FAIL GET /api/products/categories/list:', cat.status, cat.json || cat.raw);
    process.exit(1);
  }
  console.log('HTTP OK GET /api/products/categories/list');
}

async function main() {
  const ok = validatePins();
  db.close();

  if (!ok) {
    console.error('\nRun: npm run setup   (from project root) to seed the database.');
    process.exit(1);
  }
  console.log('PIN validation: all roles OK');

  if (process.argv.includes('--http')) {
    await validateHttp();
    console.log('HTTP login: all roles OK');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
