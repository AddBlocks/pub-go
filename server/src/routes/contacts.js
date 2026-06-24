import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authRequired, resolveTenantId, assertTenantAccess } from '../middleware/auth.js';

const router = Router({ mergeParams: true });

router.use(authRequired);

router.get('/', (req, res) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !assertTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied to this client network' });
  }

  const contacts = db.prepare(`
    SELECT * FROM contacts WHERE tenant_id = ? ORDER BY name
  `).all(tenantId);

  res.json(contacts.map(formatContact));
});

router.post('/', (req, res) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !assertTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied to this client network' });
  }

  const { name, phone, receiveSms = true, receiveWhatsapp = false, receiveLocation = true, notes = '' } = req.body || {};
  if (!name?.trim() || !phone?.trim()) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }

  const id = uuid();
  try {
    db.prepare(`
      INSERT INTO contacts (id, tenant_id, name, phone, receive_sms, receive_whatsapp, receive_location, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      tenantId,
      name.trim(),
      phone.trim(),
      receiveSms ? 1 : 0,
      receiveWhatsapp ? 1 : 0,
      receiveLocation ? 1 : 0,
      notes.trim()
    );
  } catch (error) {
    if (String(error).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Contact phone already exists for this client' });
    }
    throw error;
  }

  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  res.status(201).json(formatContact(contact));
});

router.put('/:contactId', (req, res) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !assertTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied to this client network' });
  }

  const existing = db.prepare('SELECT * FROM contacts WHERE id = ? AND tenant_id = ?').get(req.params.contactId, tenantId);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  const {
    name = existing.name,
    phone = existing.phone,
    receiveSms = Boolean(existing.receive_sms),
    receiveWhatsapp = Boolean(existing.receive_whatsapp),
    receiveLocation = Boolean(existing.receive_location),
    notes = existing.notes || '',
  } = req.body || {};

  db.prepare(`
    UPDATE contacts
    SET name = ?, phone = ?, receive_sms = ?, receive_whatsapp = ?, receive_location = ?, notes = ?
    WHERE id = ? AND tenant_id = ?
  `).run(
    name.trim(),
    phone.trim(),
    receiveSms ? 1 : 0,
    receiveWhatsapp ? 1 : 0,
    receiveLocation ? 1 : 0,
    notes.trim(),
    existing.id,
    tenantId
  );

  res.json(formatContact(db.prepare('SELECT * FROM contacts WHERE id = ?').get(existing.id)));
});

router.delete('/:contactId', (req, res) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId || !assertTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied to this client network' });
  }

  const result = db.prepare('DELETE FROM contacts WHERE id = ? AND tenant_id = ?').run(req.params.contactId, tenantId);
  if (!result.changes) return res.status(404).json({ error: 'Contact not found' });
  res.status(204).send();
});

function formatContact(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    phone: row.phone,
    receiveSms: Boolean(row.receive_sms),
    receiveWhatsapp: Boolean(row.receive_whatsapp),
    receiveLocation: Boolean(row.receive_location),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export default router;
