/**
 * Database layer — Supabase PostgreSQL only (DATABASE_URL required).
 */
const { getPool } = require('./pool');

function assertDatabaseUrl() {
  const url = process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL is required. Add your Supabase Session pooler URI to .env (see .env.example).'
    );
  }
  if (process.env.DB_BACKEND === 'sqlite' || process.env.DB_PATH) {
    throw new Error(
      'SQLite is not supported. Remove DB_BACKEND, DB_PATH, and LOCAL_SQLITE_FALLBACK from .env — use DATABASE_URL (Supabase) only.'
    );
  }
  try {
    const parsed = new URL(url.replace(/^postgresql:\/\//, 'http://'));
    const host = parsed.hostname;
    if (!host || host.startsWith('postgres.') || host === 'postgres') {
      throw new Error(
        `DATABASE_URL hostname looks wrong ("${host}"). Use the pooler host from Supabase → Connect → Session pooler, e.g. aws-0-eu-west-1.pooler.supabase.com`
      );
    }
  } catch (e) {
    if (e.message.includes('hostname')) throw e;
    throw new Error(`DATABASE_URL is not a valid connection string: ${e.message}`);
  }
}

let _impl = null;

const ready = (async () => {
  assertDatabaseUrl();
  _impl = await require('./postgres').init();
  return _impl;
})();

const db = {
  get ready() {
    return ready;
  },
  get dialect() {
    return _impl?.dialect;
  },
  get isPostgres() {
    return !!_impl?.isPostgres;
  },
  get name() {
    return _impl?.name ?? 'initializing';
  },
  prepare(sql) {
    return {
      get: (...params) => ready.then((d) => d.prepare(sql).get(...params)),
      all: (...params) => ready.then((d) => d.prepare(sql).all(...params)),
      run: (...params) => ready.then((d) => d.prepare(sql).run(...params)),
    };
  },
  transaction(fn) {
    return ready.then((d) => d.transaction(fn));
  },
  exec(sql) {
    return ready.then((d) => d.exec(sql));
  },
  close() {
    return ready.then((d) => d.close());
  },
  ensureSchema() {
    return ready.then((d) => (d.ensureSchema ? d.ensureSchema() : undefined));
  },
};

module.exports = db;
module.exports.getPool = getPool;
