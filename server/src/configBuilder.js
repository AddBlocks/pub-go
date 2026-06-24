const DEFAULT_SMS_MESSAGE =
  'SOS EMERGENCY: I need help immediately. This is an automated alert from Press2Safety.';

export function defaultDeviceConfig() {
  return {
    enabled: false,
    smsMessage: DEFAULT_SMS_MESSAGE,
    recordingDurationSeconds: 60,
    locationShareIntervalSeconds: 30,
    locationShareDurationMinutes: 30,
    triggerButtons: ['VOLUME_UP', 'VOLUME_DOWN'],
    pressesRequired: 3,
    pressWindowMs: 2000,
    includeLocationInInitialSms: true,
  };
}

export function buildMobileConfig(db, deviceId) {
  const device = db.prepare(`
    SELECT d.*, t.name AS tenant_name, t.slug AS tenant_slug
    FROM devices d
    JOIN tenants t ON t.id = d.tenant_id
    WHERE d.id = ?
  `).get(deviceId);

  if (!device) return null;

  const configRow = db.prepare('SELECT * FROM device_configs WHERE device_id = ?').get(deviceId);
  const config = configRow
    ? {
        enabled: Boolean(configRow.enabled),
        smsMessage: configRow.sms_message,
        recordingDurationSeconds: configRow.recording_duration_seconds,
        locationShareIntervalSeconds: configRow.location_share_interval_seconds,
        locationShareDurationMinutes: configRow.location_share_duration_minutes,
        triggerButtons: JSON.parse(configRow.trigger_buttons),
        pressesRequired: configRow.presses_required,
        pressWindowMs: configRow.press_window_ms,
        includeLocationInInitialSms: Boolean(configRow.include_location_in_initial_sms),
      }
    : defaultDeviceConfig();

  const contacts = db.prepare(`
    SELECT c.*
    FROM contacts c
    JOIN device_contacts dc ON dc.contact_id = c.id
    WHERE dc.device_id = ?
    ORDER BY c.name
  `).all(deviceId);

  const smsContacts = contacts.filter((c) => c.receive_sms).map((c) => c.phone);
  const whatsAppContacts = contacts.filter((c) => c.receive_whatsapp).map((c) => c.phone);
  const locationShareContacts = contacts.filter((c) => c.receive_location).map((c) => c.phone);

  return {
    deviceId: device.id,
    deviceName: device.name,
    tenantId: device.tenant_id,
    tenantName: device.tenant_name,
    tenantSlug: device.tenant_slug,
    configVersion: configRow?.updated_at || device.created_at,
    ...config,
    smsContacts,
    whatsAppContacts,
    locationShareContacts: locationShareContacts.length ? locationShareContacts : smsContacts,
    contacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      receiveSms: Boolean(c.receive_sms),
      receiveWhatsapp: Boolean(c.receive_whatsapp),
      receiveLocation: Boolean(c.receive_location),
      notes: c.notes,
    })),
  };
}

export function saveDeviceConfig(db, deviceId, payload) {
  const defaults = defaultDeviceConfig();
  const merged = { ...defaults, ...payload };

  db.prepare(`
    INSERT INTO device_configs (
      device_id, enabled, sms_message, recording_duration_seconds,
      location_share_interval_seconds, location_share_duration_minutes,
      trigger_buttons, presses_required, press_window_ms,
      include_location_in_initial_sms, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(device_id) DO UPDATE SET
      enabled = excluded.enabled,
      sms_message = excluded.sms_message,
      recording_duration_seconds = excluded.recording_duration_seconds,
      location_share_interval_seconds = excluded.location_share_interval_seconds,
      location_share_duration_minutes = excluded.location_share_duration_minutes,
      trigger_buttons = excluded.trigger_buttons,
      presses_required = excluded.presses_required,
      press_window_ms = excluded.press_window_ms,
      include_location_in_initial_sms = excluded.include_location_in_initial_sms,
      updated_at = datetime('now')
  `).run(
    deviceId,
    merged.enabled ? 1 : 0,
    merged.smsMessage,
    merged.recordingDurationSeconds,
    merged.locationShareIntervalSeconds,
    merged.locationShareDurationMinutes,
    JSON.stringify(merged.triggerButtons),
    merged.pressesRequired,
    merged.pressWindowMs,
    merged.includeLocationInInitialSms ? 1 : 0
  );

  if (Array.isArray(payload.contactIds)) {
    db.prepare('DELETE FROM device_contacts WHERE device_id = ?').run(deviceId);
    const insert = db.prepare('INSERT INTO device_contacts (device_id, contact_id) VALUES (?, ?)');
    for (const contactId of payload.contactIds) {
      insert.run(deviceId, contactId);
    }
  }
}
