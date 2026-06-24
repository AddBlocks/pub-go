import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id || null,
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

export function deviceAuth(db) {
  return (req, res, next) => {
    const token = req.headers['x-device-token'];
    if (!token) {
      return res.status(401).json({ error: 'Device token required' });
    }

    const device = db.prepare(`
      SELECT d.*, t.is_active AS tenant_active
      FROM devices d
      JOIN tenants t ON t.id = d.tenant_id
      WHERE d.device_token = ?
    `).get(token);

    if (!device || !device.tenant_active) {
      return res.status(401).json({ error: 'Invalid device token' });
    }

    req.device = device;
    next();
  };
}

export function resolveTenantId(req) {
  const paramTenantId = req.params.tenantId || req.body?.tenantId || req.query?.tenantId || null;

  if (req.user.role === 'superadmin') {
    return paramTenantId || req.user.tenantId;
  }

  if (paramTenantId && paramTenantId !== req.user.tenantId) {
    return null;
  }

  return req.user.tenantId;
}

export function assertTenantAccess(req, tenantId) {
  if (!tenantId) return false;
  if (req.user.role === 'superadmin') return true;
  return req.user.tenantId === tenantId;
}
