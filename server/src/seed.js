import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import db from './db.js';
import { defaultDeviceConfig, saveDeviceConfig } from './configBuilder.js';

const DEFAULT_PASSWORD = 'changeme123';

function upsertTenant(name, slug) {
  let tenant = db.prepare('SELECT * FROM tenants WHERE slug = ?').get(slug);
  if (!tenant) {
    const id = uuid();
    db.prepare('INSERT INTO tenants (id, name, slug) VALUES (?, ?, ?)').run(id, name, slug);
    tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
  }
  return tenant;
}

function upsertUser({ email, name, role, tenantId, password }) {
  let user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);
  const passwordHash = bcrypt.hashSync(password, 10);
  if (!user) {
    const id = uuid();
    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, tenantId, email.toLowerCase(), passwordHash, name, role);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
  return user;
}

function seedContacts(tenantId, contacts) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO contacts (id, tenant_id, name, phone, receive_sms, receive_whatsapp, receive_location, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const contact of contacts) {
    insert.run(
      uuid(),
      tenantId,
      contact.name,
      contact.phone,
      contact.receiveSms ? 1 : 0,
      contact.receiveWhatsapp ? 1 : 0,
      contact.receiveLocation ? 1 : 0,
      contact.notes || ''
    );
  }
}

function seedDevice(tenantId, name) {
  const existing = db.prepare('SELECT * FROM devices WHERE tenant_id = ? AND name = ?').get(tenantId, name);
  if (existing) return existing;

  const id = uuid();
  const token = uuid().replace(/-/g, '') + uuid().replace(/-/g, '');
  db.prepare('INSERT INTO devices (id, tenant_id, name, device_token) VALUES (?, ?, ?, ?)').run(id, tenantId, name, token);
  saveDeviceConfig(db, id, { ...defaultDeviceConfig(), enabled: true });

  const contacts = db.prepare('SELECT id FROM contacts WHERE tenant_id = ?').all(tenantId);
  const link = db.prepare('INSERT OR IGNORE INTO device_contacts (device_id, contact_id) VALUES (?, ?)');
  for (const contact of contacts) {
    link.run(id, contact.id);
  }

  return db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
}

const acme = upsertTenant('Acme Field Security', 'acme-security');
const hospital = upsertTenant('Metro Hospital Staff', 'metro-hospital');

upsertUser({
  email: 'admin@press2safety.local',
  name: 'Platform Super Admin',
  role: 'superadmin',
  tenantId: null,
  password: DEFAULT_PASSWORD,
});

upsertUser({
  email: 'admin@acme.example',
  name: 'Acme Admin',
  role: 'tenant_admin',
  tenantId: acme.id,
  password: DEFAULT_PASSWORD,
});

upsertUser({
  email: 'ops@acme.example',
  name: 'Acme Operations',
  role: 'tenant_admin',
  tenantId: acme.id,
  password: DEFAULT_PASSWORD,
});

upsertUser({
  email: 'admin@hospital.example',
  name: 'Hospital Admin',
  role: 'tenant_admin',
  tenantId: hospital.id,
  password: DEFAULT_PASSWORD,
});

seedContacts(acme.id, [
  { name: 'Control Room', phone: '+15550100001', receiveSms: true, receiveWhatsapp: true, receiveLocation: true },
  { name: 'Shift Supervisor', phone: '+15550100002', receiveSms: true, receiveWhatsapp: false, receiveLocation: true },
]);

seedContacts(hospital.id, [
  { name: 'Security Desk', phone: '+15550200001', receiveSms: true, receiveWhatsapp: true, receiveLocation: true },
  { name: 'On-call Nurse', phone: '+15550200002', receiveSms: true, receiveWhatsapp: true, receiveLocation: true },
]);

const acmeDevice = seedDevice(acme.id, 'Guard Phone #1');
const hospitalDevice = seedDevice(hospital.id, 'Ward Phone #3');

console.log('Seed complete.');
console.log('');
console.log('Super admin: admin@press2safety.local / changeme123');
console.log('Acme admin:  admin@acme.example / changeme123');
console.log('Acme ops:    ops@acme.example / changeme123');
console.log('Hospital admin: admin@hospital.example / changeme123');
console.log('');
console.log('Demo device tokens (enter in Android app):');
console.log(`  Acme:     ${acmeDevice.device_token}`);
console.log(`  Hospital: ${hospitalDevice.device_token}`);
