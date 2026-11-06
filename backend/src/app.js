import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import scanRoutes from './routes/scans.js';
import findingRoutes from './routes/findings.js';
import adminRoutes from './routes/admin.js';

export const app = express();

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1); // real client IPs for rate limits behind the host's proxy
app.use(helmet());
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/findings', findingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// One deploy: when STATIC_DIR points at the built frontend, the API serves it too (same origin, so the login cookie just works).
if (process.env.STATIC_DIR) {
  const dir = path.resolve(process.env.STATIC_DIR);
  app.use(express.static(dir));
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(dir, 'index.html')) : next())); // any other page is the React app
}

app.use((err, req, res, next) => {
  if (err.expose) return res.status(err.status).json({ error: err.message }); // e.g. malformed JSON body
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});
