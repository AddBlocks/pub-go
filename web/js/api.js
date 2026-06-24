const API_BASE = '';

export function getToken() {
  return localStorage.getItem('p2s_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('p2s_token', token);
  else localStorage.removeItem('p2s_token');
}

export function getSelectedTenantId() {
  return localStorage.getItem('p2s_tenant');
}

export function setSelectedTenantId(tenantId) {
  if (tenantId) localStorage.setItem('p2s_tenant', tenantId);
  else localStorage.removeItem('p2s_tenant');
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export const api = {
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  me: () => request('/api/auth/me'),

  listTenants: () => request('/api/tenants'),

  createTenant: (payload) =>
    request('/api/tenants', { method: 'POST', body: JSON.stringify(payload) }),

  listContacts: (tenantId) => request(`/api/tenants/${tenantId}/contacts`),

  createContact: (tenantId, payload) =>
    request(`/api/tenants/${tenantId}/contacts`, { method: 'POST', body: JSON.stringify(payload) }),

  updateContact: (tenantId, contactId, payload) =>
    request(`/api/tenants/${tenantId}/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteContact: (tenantId, contactId) =>
    request(`/api/tenants/${tenantId}/contacts/${contactId}`, { method: 'DELETE' }),

  listDevices: (tenantId) => request(`/api/tenants/${tenantId}/devices`),

  getDevice: (tenantId, deviceId) => request(`/api/tenants/${tenantId}/devices/${deviceId}`),

  createDevice: (tenantId, payload) =>
    request(`/api/tenants/${tenantId}/devices`, { method: 'POST', body: JSON.stringify(payload) }),

  updateDeviceConfig: (tenantId, deviceId, payload) =>
    request(`/api/tenants/${tenantId}/devices/${deviceId}/config`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  regenerateDeviceToken: (tenantId, deviceId) =>
    request(`/api/tenants/${tenantId}/devices/${deviceId}/regenerate-token`, { method: 'POST' }),

  deleteDevice: (tenantId, deviceId) =>
    request(`/api/tenants/${tenantId}/devices/${deviceId}`, { method: 'DELETE' }),

  listUsers: (tenantId) => request(`/api/tenants/${tenantId}/users`),

  createUser: (tenantId, payload) =>
    request(`/api/tenants/${tenantId}/users`, { method: 'POST', body: JSON.stringify(payload) }),

  updateUser: (tenantId, userId, payload) =>
    request(`/api/tenants/${tenantId}/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteUser: (tenantId, userId) =>
    request(`/api/tenants/${tenantId}/users/${userId}`, { method: 'DELETE' }),
};
