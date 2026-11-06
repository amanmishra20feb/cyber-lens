import { connect } from './db.js';
import { app } from './app.js';
import { recoverScans } from './scanner/worker.js';

const { PORT = 4000, NODE_ENV } = process.env;
const { DATABASE_URL } = process.env;
if (!DATABASE_URL && NODE_ENV === 'production') throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
// No database configured in development: a throwaway in-memory Postgres, so `npm run dev` works out of the box.
if (!DATABASE_URL) console.warn('DATABASE_URL is not set: using an in-memory database. Everything is lost when the server stops.');

await connect(DATABASE_URL);
const interrupted = await recoverScans();
if (interrupted) console.log(`Marked ${interrupted} interrupted scan(s) as failed.`);
app.listen(PORT, () => console.log(`Cyberlens API on http://localhost:${PORT}`));
