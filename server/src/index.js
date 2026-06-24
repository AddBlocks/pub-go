import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import tenantRoutes from './routes/tenants.js';
import contactRoutes from './routes/contacts.js';
import deviceRoutes from './routes/devices.js';
import deviceApiRoutes from './routes/deviceApi.js';
import userRoutes from './routes/users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors({ origin: process.env.WEB_ORIGIN || true, credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'press2safety-server' });
});

app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/tenants/:tenantId/contacts', contactRoutes);
app.use('/api/tenants/:tenantId/devices', deviceRoutes);
app.use('/api/tenants/:tenantId/users', userRoutes);
app.use('/api/device', deviceApiRoutes);

const webRoot = path.join(__dirname, '../../web');
app.use(express.static(webRoot));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(webRoot, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Press2Safety server running at http://localhost:${port}`);
});
