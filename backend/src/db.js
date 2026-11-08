import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

// With DATABASE_URL this is a real Postgres (Neon). Without it, PGlite runs Postgres in memory for dev and tests.
let db;
let inMemory = false;

// created_at -> createdAt
const camel = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
const runner = (client) => async (text, params) => (await client.query(text, params)).rows.map(camel);

export const sql = (text, params) => runner(db)(text, params);
export const tx = (fn) => transaction((client) => fn(runner(client)));

async function transaction(fn) {
  if (inMemory) return db.transaction(fn);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function connect(url) {
  if (url) {
    db = new pg.Pool({ connectionString: url, max: 5 });
    // Neon closes idle connections now and then; an unhandled 'error' event would crash the API
    db.on('error', (e) => console.error('Postgres connection error:', e.message));
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    db = new PGlite();
    inMemory = true;
  }
  await migrate();
}

export const close = () => (inMemory ? db.close() : db.end());

const MIGRATIONS = path.join(import.meta.dirname, '..', 'migrations');

// Runs each migrations/*.sql file once, in name order.
// TODO: take an advisory lock here if several API instances can start at the same time
async function migrate() {
  await db.query('CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY, run_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await sql('SELECT name FROM migrations')).map((m) => m.name));
  const files = (await fs.readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
  for (const name of files.filter((f) => !done.has(f))) {
    const text = await fs.readFile(path.join(MIGRATIONS, name), 'utf8');
    await transaction(async (client) => {
      await (inMemory ? client.exec(text) : client.query(text));
      await client.query('INSERT INTO migrations (name) VALUES ($1)', [name]);
    });
  }
}
