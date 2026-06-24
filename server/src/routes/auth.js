import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { signToken, authRequired } from '../middleware/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare(`
    SELECT u.*, t.name AS tenant_name, t.slug AS tenant_slug
    FROM users u
    LEFT JOIN tenants t ON t.id = u.tenant_id
    WHERE lower(u.email) = lower(?)
  `).get(email.trim());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.tenant_id) {
    const tenant = db.prepare('SELECT is_active FROM tenants WHERE id = ?').get(user.tenant_id);
    if (!tenant?.is_active) {
      return res.status(403).json({ error: 'Tenant account is disabled' });
    }
  }

  if (user.is_active === 0) {
    return res.status(403).json({ error: 'User account is disabled' });
  }

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenant_id,
      tenantName: user.tenant_name,
      tenantSlug: user.tenant_slug,
    },
  });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug
    FROM users u
    LEFT JOIN tenants t ON t.id = u.tenant_id
    WHERE u.id = ?
  `).get(req.user.sub);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenant_id,
    tenantName: user.tenant_name,
    tenantSlug: user.tenant_slug,
  });
});

export default router;
