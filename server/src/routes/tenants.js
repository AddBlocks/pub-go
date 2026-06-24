import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import {
  authRequired,
  requireRole,
  resolveTenantId,
  assertTenantAccess,
} from '../middleware/auth.js';

const router = Router();

router.use(authRequired);

router.get('/', requireRole('superadmin'), (_req, res) => {
  const tenants = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count,
      (SELECT COUNT(*) FROM contacts c WHERE c.tenant_id = t.id) AS contact_count,
      (SELECT COUNT(*) FROM devices d WHERE d.tenant_id = t.id) AS device_count
    FROM tenants t
    ORDER BY t.created_at DESC
  `).all();

  res.json(tenants.map(formatTenant));
});

router.post('/', requireRole('superadmin'), (req, res) => {
  const { name, slug } = req.body || {};
  if (!name?.trim() || !slug?.trim()) {
    return res.status(400).json({ error: 'Name and slug are required' });
  }

  const normalizedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const id = uuid();

  try {
    db.prepare('INSERT INTO tenants (id, name, slug) VALUES (?, ?, ?)').run(id, name.trim(), normalizedSlug);
  } catch (error) {
    if (String(error).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Slug already exists' });
    }
    throw error;
  }

  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
  res.status(201).json(formatTenant(tenant));
});

router.get('/:tenantId', (req, res) => {
  const tenantId = req.params.tenantId;
  if (!assertTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied to this client network' });
  }

  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
  if (!tenant) return res.status(404).json({ error: 'Client not found' });
  res.json(formatTenant(tenant));
});

router.patch('/:tenantId', requireRole('superadmin'), (req, res) => {
  const { name, isActive } = req.body || {};
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.tenantId);
  if (!tenant) return res.status(404).json({ error: 'Client not found' });

  db.prepare(`
    UPDATE tenants SET name = ?, is_active = ? WHERE id = ?
  `).run(
    name?.trim() || tenant.name,
    typeof isActive === 'boolean' ? (isActive ? 1 : 0) : tenant.is_active,
    tenant.id
  );

  res.json(formatTenant(db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenant.id)));
});

function formatTenant(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    userCount: row.user_count,
    contactCount: row.contact_count,
    deviceCount: row.device_count,
  };
}

export default router;
