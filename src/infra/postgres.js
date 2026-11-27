/**
 * PostgreSQL pool (HLD primary store). Disabled until DATABASE_URL is set;
 * `query` then throws so callers can't silently skip money writes.
 *
 *   const pg = require('../../infra/postgres');
 *   const { rows } = await pg.query('select 1');
 *   await pg.tx(async (c) => { await c.query(...); });
 */
const env = require('../config/env');
const logger = require('./logger');

let pool = null;

function getPool() {
  if (!env.features.postgres) return null;
  if (!pool) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: env.postgres.url,
      max: env.postgres.poolMax,
      ssl: env.postgres.ssl ? { rejectUnauthorized: false } : false,
    });
    pool.on('error', (err) => logger.error('postgres pool error', { err: err.message }));
  }
  return pool;
}

async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error('Postgres is not configured (set DATABASE_URL)');
  return p.query(text, params);
}

async function tx(fn) {
  const p = getPool();
  if (!p) throw new Error('Postgres is not configured (set DATABASE_URL)');
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function health() {
  if (!env.features.postgres) return 'disabled';
  await query('select 1');
  return 'ok';
}

async function close() {
  if (pool) await pool.end();
  pool = null;
}

module.exports = { getPool, query, tx, health, close, enabled: () => env.features.postgres };
