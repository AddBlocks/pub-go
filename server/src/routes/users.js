import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import {
  authRequired,
  requireRole,
  resolveTenantId,
  assertTenantAccess,
} from '../middleware/auth.js';

const router = Router({ mergeParams: true });

router.use(authRequired);
router.use(requireRole('superadmin', 'tenant_admin'));

function formatUser(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: Boolean(row.is_active ?? 1),
    createdAt: row.created_at,
  };
}

function countActiveAdmins(tenantId) {
  return db.prepare(`
    SELECT COUNT(*) AS count
    FROM users
    WHERE tenant_id = ? AND role = 'tenant_admin' AND is_active = 1
  `).get(tenantId).count;
}

router.get('/', (req, res) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !assertTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied to this client network' });
  }

  const users = db.prepare(`
    SELECT id, tenant_id, email, name, role, is_active, created_at
    FROM users
    WHERE tenant_id = ? AND role = 'tenant_admin'
    ORDER BY created_at ASC
  `).all(tenantId);

  res.json(users.map(formatUser));
});

router.post('/', (req, res) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !assertTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied to this client network' });
  }

  const tenant = db.prepare('SELECT id, is_active FROM tenants WHERE id = ?').get(tenantId);
  if (!tenant?.is_active) {
    return res.status(400).json({ error: 'Client network is disabled' });
  }

  const { email, name, password } = req.body || {};
  if (!email?.trim() || !name?.trim() || !password) {
    return res.status(400).json({ error: 'Email, name, and password are required' });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const id = uuid();
  const passwordHash = bcrypt.hashSync(String(password), 10);

  try {
    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_active)
      VALUES (?, ?, ?, ?, ?, 'tenant_admin', 1)
    `).run(id, tenantId, email.trim().toLowerCase(), passwordHash, name.trim());
  } catch (error) {
    if (String(error).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email is already registered' });
    }
    throw error;
  }

  const user = db.prepare(`
    SELECT id, tenant_id, email, name, role, is_active, created_at
    FROM users WHERE id = ?
  `).get(id);

  res.status(201).json(formatUser(user));
});

router.put('/:userId', (req, res) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !assertTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied to this client network' });
  }

  const existing = db.prepare(`
    SELECT * FROM users WHERE id = ? AND tenant_id = ? AND role = 'tenant_admin'
  `).get(req.params.userId, tenantId);

  if (!existing) {
    return res.status(404).json({ error: 'User not found in this client network' });
  }

  const { name, isActive, password } = req.body || {};
  const nextName = name?.trim() || existing.name;
  const nextActive = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : existing.is_active;

  if (existing.id === req.user.sub && nextActive === 0) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  if (existing.is_active === 1 && nextActive === 0 && countActiveAdmins(tenantId) <= 1) {
    return res.status(400).json({ error: 'Cannot deactivate the last active admin for this client' });
  }

  db.prepare(`
    UPDATE users SET name = ?, is_active = ? WHERE id = ? AND tenant_id = ?
  `).run(nextName, nextActive, existing.id, tenantId);

  if (password) {
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const passwordHash = bcrypt.hashSync(String(password), 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, existing.id);
  }

  const user = db.prepare(`
    SELECT id, tenant_id, email, name, role, is_active, created_at
    FROM users WHERE id = ?
  `).get(existing.id);

  res.json(formatUser(user));
});

router.delete('/:userId', (req, res) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !assertTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied to this client network' });
  }

  const existing = db.prepare(`
    SELECT * FROM users WHERE id = ? AND tenant_id = ? AND role = 'tenant_admin'
  `).get(req.params.userId, tenantId);

  if (!existing) {
    return res.status(404).json({ error: 'User not found in this client network' });
  }

  if (existing.id === req.user.sub) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  if (existing.is_active === 1 && countActiveAdmins(tenantId) <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last active admin for this client' });
  }

  db.prepare('DELETE FROM users WHERE id = ? AND tenant_id = ?').run(existing.id, tenantId);
  res.status(204).send();
});

export default router;
