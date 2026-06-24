import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import db from '../db.js';
import { authRequired, resolveTenantId, assertTenantAccess } from '../middleware/auth.js';
import { buildMobileConfig, defaultDeviceConfig, saveDeviceConfig } from '../configBuilder.js';

const router = Router({ mergeParams: true });

router.use(authRequired);

router.get('/', (req, res) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !assertTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied to this client network' });
  }

  const devices = db.prepare(`
    SELECT d.*, dc.updated_at AS config_updated_at
    FROM devices d
    LEFT JOIN device_configs dc ON dc.device_id = d.id
    WHERE d.tenant_id = ?
    ORDER BY d.created_at DESC
  `).all(tenantId);

  res.json(devices.map(formatDeviceSummary));
});

router.post('/', (req, res) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !assertTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied to this client network' });
  }

  const { name } = req.body || {};
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Device name is required' });
  }

  const id = uuid();
  const deviceToken = crypto.randomBytes(32).toString('hex');

  db.prepare(`
    INSERT INTO devices (id, tenant_id, name, device_token) VALUES (?, ?, ?, ?)
  `).run(id, tenantId, name.trim(), deviceToken);

  saveDeviceConfig(db, id, defaultDeviceConfig());

  const tenantContacts = db.prepare('SELECT id FROM contacts WHERE tenant_id = ?').all(tenantId);
  const link = db.prepare('INSERT INTO device_contacts (device_id, contact_id) VALUES (?, ?)');
  for (const contact of tenantContacts) {
    link.run(id, contact.id);
  }

  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  res.status(201).json({
    ...formatDeviceSummary({ ...device, config_updated_at: null }),
    deviceToken,
    config: buildMobileConfig(db, id),
  });
});

router.get('/:deviceId', (req, res) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !assertTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied to this client network' });
  }

  const device = db.prepare('SELECT * FROM devices WHERE id = ? AND tenant_id = ?').get(req.params.deviceId, tenantId);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  res.json({
    ...formatDeviceSummary(device),
    config: buildMobileConfig(db, device.id),
  });
});

router.put('/:deviceId/config', (req, res) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !assertTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied to this client network' });
  }

  const device = db.prepare('SELECT * FROM devices WHERE id = ? AND tenant_id = ?').get(req.params.deviceId, tenantId);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  if (Array.isArray(req.body?.contactIds)) {
    if (req.body.contactIds.length > 0) {
      const placeholders = req.body.contactIds.map(() => '?').join(',');
      const valid = db.prepare(`
        SELECT id FROM contacts WHERE tenant_id = ? AND id IN (${placeholders})
      `).all(tenantId, ...req.body.contactIds);
      if (valid.length !== req.body.contactIds.length) {
        return res.status(400).json({ error: 'One or more contacts do not belong to this client network' });
      }
    }
  }

  saveDeviceConfig(db, device.id, req.body || {});
  res.json(buildMobileConfig(db, device.id));
});

router.post('/:deviceId/regenerate-token', (req, res) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !assertTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied to this client network' });
  }

  const device = db.prepare('SELECT * FROM devices WHERE id = ? AND tenant_id = ?').get(req.params.deviceId, tenantId);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const deviceToken = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE devices SET device_token = ? WHERE id = ?').run(deviceToken, device.id);
  res.json({ deviceToken });
});

router.delete('/:deviceId', (req, res) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !assertTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied to this client network' });
  }

  const result = db.prepare('DELETE FROM devices WHERE id = ? AND tenant_id = ?').run(req.params.deviceId, tenantId);
  if (!result.changes) return res.status(404).json({ error: 'Device not found' });
  res.status(204).send();
});

function formatDeviceSummary(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    configUpdatedAt: row.config_updated_at,
  };
}

export default router;
