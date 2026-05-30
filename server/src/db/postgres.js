const fs = require('fs');
const path = require('path');
const { getPool, closePool } = require('./pool');
const { translateSql } = require('./sqlTranslate');

function prepareOn(client, sql) {
  const q = translateSql(sql);
  return {
    get: (...params) =>
      client.query(q, params).then((res) => {
        const verb = q.trim().split(/\s+/)[0].toUpperCase();
        if (verb === 'SELECT' || verb === 'WITH') return res.rows[0];
        return { changes: res.rowCount, rowCount: res.rowCount };
      }),
    all: (...params) => client.query(q, params).then((res) => res.rows),
    run: (...params) =>
      client.query(q, params).then((res) => {
        const row = res.rows && res.rows[0];
        const id = row && (row.id ?? row.ID);
        return {
          changes: res.rowCount,
          rowCount: res.rowCount,
          lastInsertRowid: id,
          rows: res.rows,
        };
      }),
  };
}

async function init() {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is required for PostgreSQL.');

  await pool.query('SELECT 1');

  const runMigration =
    process.env.PG_RUN_MIGRATION === '1' || process.env.PG_RUN_MIGRATION === 'true';
  if (runMigration) {
    const migration = fs.readFileSync(
      path.join(__dirname, 'migrations/001_init_postgres.sql'),
      'utf8'
    );
    await pool.query(migration);
    console.log('PostgreSQL schema migration applied (PG_RUN_MIGRATION).');
  }

  const expensesMigration = fs.readFileSync(
    path.join(__dirname, 'migrations/003_expenses_postgres.sql'),
    'utf8'
  );
  await pool.query(expensesMigration);

  const agentFloatMigration = fs.readFileSync(
    path.join(__dirname, 'migrations/005_agent_float_postgres.sql'),
    'utf8'
  );
  await pool.query(agentFloatMigration);

  const businessTypeMigration = fs.readFileSync(
    path.join(__dirname, 'migrations/006_business_type_postgres.sql'),
    'utf8'
  );
  await pool.query(businessTypeMigration);

  const db = {
    dialect: 'postgres',
    name: 'postgresql (Supabase)',
    isPostgres: true,
    pool,
    prepare: (sql) => prepareOn(pool, sql),
    exec(sql) {
      return pool.query(translateSql(sql));
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx = { prepare: (sql) => prepareOn(client, sql) };
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    close() {
      return closePool();
    },
  };

  console.log('Database: PostgreSQL (Supabase) — Render app, Supabase data only');
  return db;
}

module.exports = { init };
