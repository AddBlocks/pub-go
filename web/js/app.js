import { api, getSelectedTenantId, getToken, setSelectedTenantId, setToken } from './api.js';

const app = document.getElementById('app');
let state = {
  user: null,
  tenants: [],
  tenantId: null,
  view: 'overview',
  selectedDeviceId: null,
};

const TRIGGER_BUTTONS = ['VOLUME_UP', 'VOLUME_DOWN', 'POWER'];

boot();

async function boot() {
  if (!getToken()) {
    renderLogin();
    return;
  }

  try {
    state.user = await api.me();
    if (state.user.role === 'superadmin') {
      state.tenants = await api.listTenants();
      state.tenantId = getSelectedTenantId() || state.tenants[0]?.id || null;
    } else {
      state.tenantId = state.user.tenantId;
    }
    renderApp();
  } catch {
    setToken(null);
    renderLogin('Session expired. Please sign in again.');
  }
}

function renderLogin(message = '') {
  app.innerHTML = `
    <div class="login-wrap">
      <div class="card login-card">
        <div class="brand">
          <div class="brand-badge">SOS</div>
          <div>
            <h1>Press2Safety</h1>
            <p>Admin dashboard</p>
          </div>
        </div>
        ${message ? `<div class="alert">${escapeHtml(message)}</div>` : ''}
        <form id="loginForm">
          <div class="field">
            <label>Email</label>
            <input name="email" type="email" required placeholder="admin@acme.example" />
          </div>
          <div class="field">
            <label>Password</label>
            <input name="password" type="password" required placeholder="••••••••" />
          </div>
          <button class="btn btn-primary" type="submit" style="width:100%">Sign in</button>
        </form>
        <p class="small muted" style="margin-top:16px">
          Demo: admin@acme.example / changeme123 (isolated client network)
        </p>
      </div>
    </div>
  `;

  document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      const result = await api.login(form.get('email'), form.get('password'));
      setToken(result.token);
      state.user = result.user;
      if (result.user.role === 'superadmin') {
        state.tenants = await api.listTenants();
        state.tenantId = state.tenants[0]?.id || null;
      } else {
        state.tenantId = result.user.tenantId;
      }
      renderApp();
    } catch (error) {
      renderLogin(error.message);
    }
  });
}

function renderApp() {
  const tenant = currentTenant();
  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        ${sidebarBrand(tenant)}
        ${navButton('overview', 'Overview')}
        ${navButton('contacts', 'Contacts')}
        ${navButton('devices', 'Smartphones')}
        ${navButton('users', 'Admin users')}
        ${state.selectedDeviceId ? navButton('device-config', 'Device config') : ''}
        ${state.user.role === 'superadmin' ? navButton('clients', 'Client networks') : ''}
        <button class="nav-btn" id="logoutBtn" style="margin-top:20px;color:#ffcdd2">Sign out</button>
      </aside>
      <main class="main" id="mainContent"></main>
    </div>
  `;

  document.getElementById('logoutBtn').onclick = () => {
    setToken(null);
    setSelectedTenantId(null);
    state = { user: null, tenants: [], tenantId: null, view: 'overview', selectedDeviceId: null };
    renderLogin();
  };

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.onclick = () => {
      state.view = button.dataset.view;
      if (state.view !== 'device-config') state.selectedDeviceId = null;
      renderApp();
    };
  });

  const tenantSelect = document.getElementById('tenantSelect');
  if (tenantSelect) {
    tenantSelect.onchange = (event) => {
      state.tenantId = event.target.value;
      setSelectedTenantId(state.tenantId);
      state.selectedDeviceId = null;
      state.view = 'overview';
      renderApp();
    };
  }

  renderView();
}

async function renderView() {
  const main = document.getElementById('mainContent');
  if (!main) return;

  try {
    if (state.view === 'overview') main.innerHTML = await renderOverview();
    else if (state.view === 'contacts') main.innerHTML = await renderContacts();
    else if (state.view === 'devices') main.innerHTML = await renderDevices();
    else if (state.view === 'users') main.innerHTML = await renderUsers();
    else if (state.view === 'device-config') main.innerHTML = await renderDeviceConfig();
    else if (state.view === 'clients') main.innerHTML = await renderClients();
    bindViewHandlers();
  } catch (error) {
    main.innerHTML = `<div class="alert">${escapeHtml(error.message)}</div>`;
  }
}

async function renderOverview() {
  if (!state.tenantId) {
    return topbar('Overview', 'Select a client network') + `<div class="empty card">No client selected.</div>`;
  }

  const [contacts, devices, users] = await Promise.all([
    api.listContacts(state.tenantId),
    api.listDevices(state.tenantId),
    api.listUsers(state.tenantId),
  ]);

  const tenant = currentTenant();
  return `
    ${topbar('Overview', tenant?.name || 'Client network')}
    <div class="grid grid-3">
      <div class="card"><div class="muted">Contacts</div><div class="stat-value">${contacts.length}</div></div>
      <div class="card"><div class="muted">Smartphones</div><div class="stat-value">${devices.length}</div></div>
      <div class="card"><div class="muted">Admin users</div><div class="stat-value">${users.length}</div></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>Isolated alarm network</h3>
      <p class="muted">
        Each client network is fully isolated. Contacts, devices, and SOS settings in
        <strong>${escapeHtml(tenant?.name || '')}</strong> are never shared with other clients.
      </p>
      <p class="small muted">Admins only see their own client unless they are platform super admins.</p>
    </div>
  `;
}

async function renderContacts() {
  if (!state.tenantId) return `<div class="empty card">Select a client network first.</div>`;

  const contacts = await api.listContacts(state.tenantId);
  return `
    ${topbar('Emergency contacts', currentTenant()?.name || '')}
    <div class="toolbar">
      <button class="btn btn-primary" id="addContactBtn">Add contact</button>
    </div>
    <div class="card">
      ${contacts.length ? `
        <table>
          <thead>
            <tr><th>Name</th><th>Phone</th><th>Channels</th><th>Notes</th><th></th></tr>
          </thead>
          <tbody>
            ${contacts.map((c) => `
              <tr>
                <td>${escapeHtml(c.name)}</td>
                <td>${escapeHtml(c.phone)}</td>
                <td>
                  ${c.receiveSms ? '<span class="tag sms">SMS</span>' : ''}
                  ${c.receiveWhatsapp ? '<span class="tag wa">WhatsApp</span>' : ''}
                  ${c.receiveLocation ? '<span class="tag loc">Location</span>' : ''}
                </td>
                <td class="small muted">${escapeHtml(c.notes || '')}</td>
                <td>
                  <button class="btn btn-secondary" data-edit-contact="${c.id}">Edit</button>
                  <button class="btn btn-danger" data-delete-contact="${c.id}">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `<div class="empty">No contacts yet. Add emergency contacts for this client network.</div>`}
    </div>
    <div id="contactModal"></div>
  `;
}

async function renderDevices() {
  if (!state.tenantId) return `<div class="empty card">Select a client network first.</div>`;

  const devices = await api.listDevices(state.tenantId);
  return `
    ${topbar('Smartphones', currentTenant()?.name || '')}
    <div class="toolbar">
      <button class="btn btn-primary" id="addDeviceBtn">Register smartphone</button>
    </div>
    <div class="card">
      ${devices.length ? `
        <table>
          <thead>
            <tr><th>Name</th><th>Last sync</th><th>Config updated</th><th></th></tr>
          </thead>
          <tbody>
            ${devices.map((d) => `
              <tr>
                <td>${escapeHtml(d.name)}</td>
                <td class="small muted">${escapeHtml(d.lastSeenAt || 'Never')}</td>
                <td class="small muted">${escapeHtml(d.configUpdatedAt || 'Default')}</td>
                <td>
                  <button class="btn btn-secondary" data-config-device="${d.id}">Configure</button>
                  <button class="btn btn-danger" data-delete-device="${d.id}">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `<div class="empty">No smartphones registered. Create one and paste the device token into the Android app.</div>`}
    </div>
    <div id="deviceModal"></div>
  `;
}

async function renderUsers() {
  if (!state.tenantId) return `<div class="empty card">Select a client network first.</div>`;

  const users = await api.listUsers(state.tenantId);
  return `
    ${topbar('Admin users', currentTenant()?.name || '')}
    <div class="card" style="margin-bottom:16px">
      <p class="muted">
        Manage dashboard administrators for this client network only.
        Each admin can manage contacts, smartphones, and SOS configuration within this isolated tenant.
      </p>
    </div>
    <div class="toolbar">
      <button class="btn btn-primary" id="addUserBtn">Add admin user</button>
    </div>
    <div class="card">
      ${users.length ? `
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Status</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            ${users.map((u) => `
              <tr>
                <td>
                  ${escapeHtml(u.name)}
                  ${u.id === state.user.id ? '<span class="tag">You</span>' : ''}
                </td>
                <td>${escapeHtml(u.email)}</td>
                <td>${u.isActive ? '<span class="tag sms">Active</span>' : '<span class="tag">Disabled</span>'}</td>
                <td class="small muted">${escapeHtml(u.createdAt || '')}</td>
                <td>
                  <button class="btn btn-secondary" data-edit-user="${u.id}">Edit</button>
                  ${u.id !== state.user.id ? `<button class="btn btn-danger" data-delete-user="${u.id}">Delete</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `<div class="empty">No admin users yet for this client network.</div>`}
    </div>
    <div id="userModal"></div>
  `;
}

async function renderDeviceConfig() {
  if (!state.tenantId || !state.selectedDeviceId) {
    return `<div class="empty card">Select a smartphone to configure.</div>`;
  }

  const [devicePayload, contacts] = await Promise.all([
    api.getDevice(state.tenantId, state.selectedDeviceId),
    api.listContacts(state.tenantId),
  ]);

  const config = devicePayload.config;
  const linkedIds = new Set((config.contacts || []).map((c) => c.id));

  return `
    ${topbar('Device configuration', devicePayload.name)}
    <form id="deviceConfigForm" class="card">
      <div class="field">
        <label><input type="checkbox" name="enabled" ${config.enabled ? 'checked' : ''} /> Enable SOS monitoring on device</label>
      </div>
      <div class="field">
        <label>SMS message</label>
        <textarea name="smsMessage">${escapeHtml(config.smsMessage || '')}</textarea>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label>Recording duration (seconds)</label>
          <input type="number" name="recordingDurationSeconds" min="10" max="600" value="${config.recordingDurationSeconds}" />
        </div>
        <div class="field">
          <label>Location interval (seconds)</label>
          <input type="number" name="locationShareIntervalSeconds" min="15" max="300" value="${config.locationShareIntervalSeconds}" />
        </div>
        <div class="field">
          <label>Tracking duration (minutes)</label>
          <input type="number" name="locationShareDurationMinutes" min="5" max="120" value="${config.locationShareDurationMinutes}" />
        </div>
        <div class="field">
          <label>Presses required</label>
          <input type="number" name="pressesRequired" min="2" max="5" value="${config.pressesRequired}" />
        </div>
        <div class="field">
          <label>Press window (ms)</label>
          <input type="number" name="pressWindowMs" min="1000" max="5000" step="100" value="${config.pressWindowMs}" />
        </div>
      </div>
      <div class="field">
        <label>Trigger buttons</label>
        <div class="checkbox-row">
          ${TRIGGER_BUTTONS.map((btn) => `
            <label>
              <input type="checkbox" name="triggerButtons" value="${btn}" ${(config.triggerButtons || []).includes(btn) ? 'checked' : ''} />
              ${btn.replace('_', ' ')}
            </label>
          `).join('')}
        </div>
      </div>
      <div class="field">
        <label><input type="checkbox" name="includeLocationInInitialSms" ${config.includeLocationInInitialSms ? 'checked' : ''} /> Include GPS in first SMS</label>
      </div>
      <div class="field">
        <label>Assigned contacts for this smartphone</label>
        <div class="checkbox-row" style="flex-direction:column;align-items:flex-start">
          ${contacts.map((c) => `
            <label>
              <input type="checkbox" name="contactIds" value="${c.id}" ${linkedIds.has(c.id) ? 'checked' : ''} />
              ${escapeHtml(c.name)} (${escapeHtml(c.phone)})
            </label>
          `).join('') || '<span class="muted">No contacts in this client network.</span>'}
        </div>
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" type="submit">Save & push config</button>
        <button class="btn btn-secondary" type="button" id="regenerateTokenBtn">Regenerate device token</button>
      </div>
      <div id="tokenArea"></div>
    </form>
  `;
}

async function renderClients() {
  const tenants = state.user.role === 'superadmin' ? await api.listTenants() : [];
  return `
    ${topbar('Client networks', 'Platform administration')}
    <div class="toolbar">
      <button class="btn btn-primary" id="addTenantBtn">Create client network</button>
    </div>
    <div class="card">
      <table>
        <thead>
          <tr><th>Name</th><th>Slug</th><th>Contacts</th><th>Devices</th><th>Admins</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          ${tenants.map((t) => `
            <tr>
              <td>${escapeHtml(t.name)}</td>
              <td>${escapeHtml(t.slug)}</td>
              <td>${t.contactCount || 0}</td>
              <td>${t.deviceCount || 0}</td>
              <td>${t.userCount || 0}</td>
              <td>${t.isActive ? 'Active' : 'Disabled'}</td>
              <td><button class="btn btn-secondary" data-open-tenant="${t.id}">Open</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div id="tenantModal"></div>
  `;
}

function bindViewHandlers() {
  const addContactBtn = document.getElementById('addContactBtn');
  if (addContactBtn) addContactBtn.onclick = () => openContactModal();

  document.querySelectorAll('[data-edit-contact]').forEach((button) => {
    button.onclick = async () => {
      const contacts = await api.listContacts(state.tenantId);
      const contact = contacts.find((c) => c.id === button.dataset.editContact);
      openContactModal(contact);
    };
  });

  document.querySelectorAll('[data-delete-contact]').forEach((button) => {
    button.onclick = async () => {
      if (!confirm('Delete this contact?')) return;
      await api.deleteContact(state.tenantId, button.dataset.deleteContact);
      renderView();
    };
  });

  const addDeviceBtn = document.getElementById('addDeviceBtn');
  if (addDeviceBtn) addDeviceBtn.onclick = () => openDeviceModal();

  document.querySelectorAll('[data-config-device]').forEach((button) => {
    button.onclick = () => {
      state.selectedDeviceId = button.dataset.configDevice;
      state.view = 'device-config';
      renderApp();
    };
  });

  document.querySelectorAll('[data-delete-device]').forEach((button) => {
    button.onclick = async () => {
      if (!confirm('Delete this smartphone registration?')) return;
      await api.deleteDevice(state.tenantId, button.dataset.deleteDevice);
      renderView();
    };
  });

  const addUserBtn = document.getElementById('addUserBtn');
  if (addUserBtn) addUserBtn.onclick = () => openUserModal();

  document.querySelectorAll('[data-edit-user]').forEach((button) => {
    button.onclick = async () => {
      const users = await api.listUsers(state.tenantId);
      const user = users.find((u) => u.id === button.dataset.editUser);
      openUserModal(user);
    };
  });

  document.querySelectorAll('[data-delete-user]').forEach((button) => {
    button.onclick = async () => {
      if (!confirm('Delete this admin user?')) return;
      await api.deleteUser(state.tenantId, button.dataset.deleteUser);
      renderView();
    };
  });

  const deviceConfigForm = document.getElementById('deviceConfigForm');
  if (deviceConfigForm) {
    deviceConfigForm.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(deviceConfigForm);
      const triggerButtons = [...deviceConfigForm.querySelectorAll('input[name="triggerButtons"]:checked')].map((el) => el.value);
      const contactIds = [...deviceConfigForm.querySelectorAll('input[name="contactIds"]:checked')].map((el) => el.value);

      await api.updateDeviceConfig(state.tenantId, state.selectedDeviceId, {
        enabled: form.has('enabled'),
        smsMessage: form.get('smsMessage'),
        recordingDurationSeconds: Number(form.get('recordingDurationSeconds')),
        locationShareIntervalSeconds: Number(form.get('locationShareIntervalSeconds')),
        locationShareDurationMinutes: Number(form.get('locationShareDurationMinutes')),
        pressesRequired: Number(form.get('pressesRequired')),
        pressWindowMs: Number(form.get('pressWindowMs')),
        includeLocationInInitialSms: form.has('includeLocationInInitialSms'),
        triggerButtons,
        contactIds,
      });

      alert('Configuration saved. The smartphone will receive it on next sync.');
      renderView();
    };

    const regenerateTokenBtn = document.getElementById('regenerateTokenBtn');
    if (regenerateTokenBtn) {
      regenerateTokenBtn.onclick = async () => {
        if (!confirm('Regenerate token? The phone must be updated with the new token.')) return;
        const result = await api.regenerateDeviceToken(state.tenantId, state.selectedDeviceId);
        document.getElementById('tokenArea').innerHTML = `
          <div class="info alert" style="margin-top:12px">
            <strong>New device token</strong>
            <div class="token-box">${escapeHtml(result.deviceToken)}</div>
          </div>
        `;
      };
    }
  }

  const addTenantBtn = document.getElementById('addTenantBtn');
  if (addTenantBtn) addTenantBtn.onclick = () => openTenantModal();

  document.querySelectorAll('[data-open-tenant]').forEach((button) => {
    button.onclick = () => {
      state.tenantId = button.dataset.openTenant;
      setSelectedTenantId(state.tenantId);
      state.view = 'overview';
      renderApp();
    };
  });
}

function openContactModal(contact = null) {
  const modal = document.getElementById('contactModal');
  modal.innerHTML = `
    <div class="card" style="margin-top:16px">
      <h3>${contact ? 'Edit contact' : 'Add contact'}</h3>
      <form id="contactForm">
        <div class="field"><label>Name</label><input name="name" required value="${escapeAttr(contact?.name || '')}" /></div>
        <div class="field"><label>Phone (international)</label><input name="phone" required value="${escapeAttr(contact?.phone || '')}" placeholder="+15550100001" /></div>
        <div class="checkbox-row">
          <label><input type="checkbox" name="receiveSms" ${contact?.receiveSms !== false ? 'checked' : ''} /> SMS</label>
          <label><input type="checkbox" name="receiveWhatsapp" ${contact?.receiveWhatsapp ? 'checked' : ''} /> WhatsApp</label>
          <label><input type="checkbox" name="receiveLocation" ${contact?.receiveLocation !== false ? 'checked' : ''} /> Location</label>
        </div>
        <div class="field"><label>Notes</label><textarea name="notes">${escapeHtml(contact?.notes || '')}</textarea></div>
        <div class="toolbar">
          <button class="btn btn-primary" type="submit">Save</button>
          <button class="btn btn-secondary" type="button" id="cancelContactBtn">Cancel</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('cancelContactBtn').onclick = () => { modal.innerHTML = ''; };
  document.getElementById('contactForm').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const payload = {
      name: form.get('name'),
      phone: form.get('phone'),
      receiveSms: form.has('receiveSms'),
      receiveWhatsapp: form.has('receiveWhatsapp'),
      receiveLocation: form.has('receiveLocation'),
      notes: form.get('notes'),
    };

    if (contact) await api.updateContact(state.tenantId, contact.id, payload);
    else await api.createContact(state.tenantId, payload);

    modal.innerHTML = '';
    renderView();
  };
}

function openDeviceModal() {
  const modal = document.getElementById('deviceModal');
  modal.innerHTML = `
    <div class="card" style="margin-top:16px">
      <h3>Register smartphone</h3>
      <form id="deviceForm">
        <div class="field"><label>Device name</label><input name="name" required placeholder="Guard Phone #1" /></div>
        <div class="toolbar">
          <button class="btn btn-primary" type="submit">Create</button>
          <button class="btn btn-secondary" type="button" id="cancelDeviceBtn">Cancel</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('cancelDeviceBtn').onclick = () => { modal.innerHTML = ''; };
  document.getElementById('deviceForm').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const result = await api.createDevice(state.tenantId, { name: form.get('name') });
    modal.innerHTML = `
      <div class="info alert" style="margin-top:16px">
        <strong>Device token — paste into Android app</strong>
        <div class="token-box">${escapeHtml(result.deviceToken)}</div>
        <p class="small muted">This token links the phone to <strong>${escapeHtml(currentTenant()?.name || '')}</strong> only.</p>
      </div>
    `;
    renderView();
  };
}

function openUserModal(user = null) {
  const modal = document.getElementById('userModal');
  const isEdit = Boolean(user);

  modal.innerHTML = `
    <div class="card" style="margin-top:16px">
      <h3>${isEdit ? 'Edit admin user' : 'Add admin user'}</h3>
      <form id="userForm">
        <div class="field">
          <label>Name</label>
          <input name="name" required value="${escapeAttr(user?.name || '')}" />
        </div>
        <div class="field">
          <label>Email</label>
          <input name="email" type="email" required ${isEdit ? 'readonly' : ''} value="${escapeAttr(user?.email || '')}" />
        </div>
        ${isEdit ? `
          <div class="field">
            <label><input type="checkbox" name="isActive" ${user.isActive ? 'checked' : ''} ${user.id === state.user.id ? 'disabled' : ''} /> Active</label>
          </div>
        ` : ''}
        <div class="field">
          <label>${isEdit ? 'New password (optional)' : 'Password'}</label>
          <input name="password" type="password" ${isEdit ? '' : 'required'} minlength="8" placeholder="${isEdit ? 'Leave blank to keep current password' : 'Minimum 8 characters'}" />
        </div>
        <div class="toolbar">
          <button class="btn btn-primary" type="submit">Save</button>
          <button class="btn btn-secondary" type="button" id="cancelUserBtn">Cancel</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('cancelUserBtn').onclick = () => { modal.innerHTML = ''; };
  document.getElementById('userForm').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const password = String(form.get('password') || '');

    if (isEdit) {
      const payload = {
        name: form.get('name'),
        isActive: form.has('isActive'),
      };
      if (password) payload.password = password;
      await api.updateUser(state.tenantId, user.id, payload);
    } else {
      if (password.length < 8) {
        alert('Password must be at least 8 characters');
        return;
      }
      await api.createUser(state.tenantId, {
        name: form.get('name'),
        email: form.get('email'),
        password,
      });
    }

    modal.innerHTML = '';
    renderView();
  };
}

function openTenantModal() {
  const modal = document.getElementById('tenantModal');
  modal.innerHTML = `
    <div class="card" style="margin-top:16px">
      <h3>Create client network</h3>
      <form id="tenantForm">
        <div class="field"><label>Client name</label><input name="name" required placeholder="Acme Field Security" /></div>
        <div class="field"><label>Slug</label><input name="slug" required placeholder="acme-security" /></div>
        <div class="toolbar">
          <button class="btn btn-primary" type="submit">Create</button>
          <button class="btn btn-secondary" type="button" id="cancelTenantBtn">Cancel</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('cancelTenantBtn').onclick = () => { modal.innerHTML = ''; };
  document.getElementById('tenantForm').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const tenant = await api.createTenant({ name: form.get('name'), slug: form.get('slug') });
    state.tenants = await api.listTenants();
    state.tenantId = tenant.id;
    setSelectedTenantId(tenant.id);
    modal.innerHTML = '';
    state.view = 'overview';
    renderApp();
  };
}

function sidebarBrand(tenant) {
  const tenantSwitcher =
    state.user.role === 'superadmin'
      ? `<div class="field" style="margin-bottom:18px">
          <label class="small">Client network</label>
          <select id="tenantSelect">
            ${state.tenants.map((t) => `
              <option value="${t.id}" ${t.id === state.tenantId ? 'selected' : ''}>${escapeHtml(t.name)}</option>
            `).join('')}
          </select>
        </div>`
      : `<div class="chip" style="margin-bottom:18px">${escapeHtml(tenant?.name || state.user.tenantName || 'Client')}</div>`;

  return `
    <div class="brand">
      <div class="brand-badge">SOS</div>
      <div>
        <h1>Press2Safety</h1>
        <p>${escapeHtml(state.user.name)}</p>
      </div>
    </div>
    ${tenantSwitcher}
  `;
}

function navButton(view, label) {
  return `<button class="nav-btn ${state.view === view ? 'active' : ''}" data-view="${view}">${label}</button>`;
}

function topbar(title, subtitle) {
  return `
    <div class="topbar">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <div class="muted">${escapeHtml(subtitle || '')}</div>
      </div>
      <div class="chip">${state.user.role === 'superadmin' ? 'Super admin' : 'Client admin'}</div>
    </div>
  `;
}

function currentTenant() {
  return state.tenants.find((t) => t.id === state.tenantId) || null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", '&#39;');
}
