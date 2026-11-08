import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import scanRoutes from './routes/scans.js';
import findingRoutes from './routes/findings.js';

export const app = express();

// behind the host's proxy, so rate limits see the real client IP
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/findings', findingRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// In production the API also serves the built frontend, so both share one origin and the cookie just works.
if (process.env.STATIC_DIR) {
  const dir = path.resolve(process.env.STATIC_DIR);
  app.use(express.static(dir));
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(dir, 'index.html')) : next()));
}

app.use((err, req, res, next) => {
  if (err.expose) return res.status(err.status).json({ error: err.message }); // e.g. broken JSON in the body
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});
