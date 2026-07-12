// API client — calls relative /api paths (vite proxies to the backend).
// Token lives in module memory only; never persisted to storage.

let _token = null;
let _onUnauthorized = null;

export function setToken(token) { _token = token; }
export function setUnauthorizedHandler(fn) { _onUnauthorized = fn; }

async function parseDetail(res) {
  let detail = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (body && body.detail) {
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    }
  } catch { /* non-JSON error body — keep generic message */ }
  return detail;
}

/**
 * api('/dashboard')
 * api('/goals', { method:'POST', body:{...} })
 * api('/participations/1/proof', { method:'POST', form: formData })
 */
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (_token) headers.Authorization = `Bearer ${_token}`;
  let payload;
  if (form) {
    payload = form; // browser sets multipart boundary
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  if (res.status === 401) {
    if (_onUnauthorized) _onUnauthorized();
    throw new Error('Session expired — please sign in again');
  }
  if (!res.ok) {
    const err = new Error(await parseDetail(res));
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Fetch a binary resource with the auth header and return it as a Blob. */
export async function apiBlob(path) {
  const headers = {};
  if (_token) headers.Authorization = `Bearer ${_token}`;
  const res = await fetch(`/api${path}`, { headers });
  if (res.status === 401) {
    if (_onUnauthorized) _onUnauthorized();
    throw new Error('Session expired — please sign in again');
  }
  if (!res.ok) {
    const err = new Error(await parseDetail(res));
    err.status = res.status;
    throw err;
  }
  return res.blob();
}

/** Fetch a file with the auth header and trigger a browser download. */
export async function apiDownload(path, filename) {
  const blob = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
