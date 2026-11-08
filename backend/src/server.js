import { connect } from './db.js';
import { app } from './app.js';
import { recoverScans } from './scanner/worker.js';

const { PORT = 4000, NODE_ENV, DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  if (NODE_ENV === 'production') throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  console.warn('DATABASE_URL is not set, using an in-memory database. Data is lost when the server stops.');
}

await connect(DATABASE_URL);
const interrupted = await recoverScans();
if (interrupted) console.log(`Marked ${interrupted} interrupted scan(s) as failed.`);
app.listen(PORT, () => console.log(`Cyberlens API on http://localhost:${PORT}`));
