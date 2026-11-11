/**
 * API client for Pronto Server
 */

const API_BASE = '';

function getAuthHeader() {
  const token = localStorage.getItem('pronto_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleForbiddenSuspension(res, err) {
  if (res.status === 403 && (err?.isBanned || err?.error?.toLowerCase().includes('suspend') || err?.error?.toLowerCase().includes('banned'))) {
    window.dispatchEvent(new CustomEvent('pronto:account-banned', { detail: err }));
  }
}

export const api = {
  async getImage(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, { headers: getAuthHeader(), credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!res.headers.get('content-type')?.startsWith('image/')) throw new Error('Invalid image response');
    return res.blob();
  },
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
      handleForbiddenSuspension(res, err);
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
      handleForbiddenSuspension(res, err);
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
      handleForbiddenSuspension(res, err);
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
  },

  async delete(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE', headers: { ...getAuthHeader() }, credentials: 'include'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      handleForbiddenSuspension(res, err);
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
      handleForbiddenSuspension(res, err);
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
  }
};

