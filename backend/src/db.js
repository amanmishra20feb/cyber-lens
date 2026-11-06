import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

// The whole app talks to Postgres through sql() and tx(). Values always go in params ($1, $2…), never into the SQL text.
// With a DATABASE_URL it is a real Postgres (Neon in production). Without one it is PGlite: real Postgres
// running inside Node, in memory, for `npm run dev` and the tests. Same SQL either way.
let db;
let inMemory = false;

// Columns are snake_case in the database and camelCase in the API: created_at -> createdAt.
const camel = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
const runner = (client) => async (text, params) => (await client.query(text, params)).rows.map(camel);

export const sql = (text, params) => runner(db)(text, params);

// Runs fn(sql) as one transaction: everything inside is saved together or not at all.
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
    await client.query('ROLLBACK').catch(() => {}); // the connection may already be gone; the error below is the one that matters
    throw e;
  } finally {
    client.release();
  }
}

export async function connect(url) {
  if (url) {
    db = new pg.Pool({ connectionString: url, max: 5 });
    // A hosted database closes idle connections now and then; without this handler that would crash the API.
    db.on('error', (e) => console.error('Postgres dropped an idle connection:', e.message));
  } else {
    const { PGlite } = await import('@electric-sql/pglite'); // dev dependency: never loaded in production
    db = new PGlite();
    inMemory = true;
  }
  await migrate();
}

export const close = () => (inMemory ? db.close() : db.end());

// Applies every migrations/NNN_name.sql not applied yet, in order, each in its own transaction.
// shortcut: assumes one API instance starts at a time; take a pg_advisory_lock here before running several.
const MIGRATIONS = path.join(import.meta.dirname, '..', 'migrations');
async function migrate() {
  await db.query('CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY, run_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await sql('SELECT name FROM migrations')).map((m) => m.name));
  const files = (await fs.readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
  for (const name of files.filter((f) => !done.has(f))) {
    const text = await fs.readFile(path.join(MIGRATIONS, name), 'utf8');
    await transaction(async (client) => {
      await (inMemory ? client.exec(text) : client.query(text)); // a file holds several statements
      await client.query('INSERT INTO migrations (name) VALUES ($1)', [name]);
    });
  }
}
