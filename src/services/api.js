/**
 * API client for Pronto Server
 */

const API_BASE = '';

function getAuthHeader() {
  const token = localStorage.getItem('pronto_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  async get(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      credentials: 'include'
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
  },

  async post(endpoint, data = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      credentials: 'include',
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
  },

  async put(endpoint, data = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      credentials: 'include',
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
  },

  async uploadPhoto(blob, filename = 'photo.webp') {
    const formData = new FormData();
    formData.append('photo', blob, filename);

    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      headers: {
        ...getAuthHeader()
      },
      credentials: 'include',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
  }
};

