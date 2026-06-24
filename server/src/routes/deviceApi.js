import { Router } from 'express';
import db from '../db.js';
import { deviceAuth } from '../middleware/auth.js';
import { buildMobileConfig } from '../configBuilder.js';

const router = Router();

router.use(deviceAuth(db));

router.get('/config', (req, res) => {
  db.prepare(`UPDATE devices SET last_seen_at = datetime('now') WHERE id = ?`).run(req.device.id);
  const config = buildMobileConfig(db, req.device.id);
  res.json(config);
});

router.post('/heartbeat', (req, res) => {
  db.prepare(`UPDATE devices SET last_seen_at = datetime('now') WHERE id = ?`).run(req.device.id);
  res.json({ ok: true, serverTime: new Date().toISOString() });
});

export default router;
