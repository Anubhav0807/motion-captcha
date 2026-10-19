import { API_BASE_URL, USE_MOCK } from '../config';
import { ApiError } from './errors';

const TOKEN_KEY = 'ks_console_token';

export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t) => {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
};

function buildQuery(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
  });
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Single entry point for every backend call.
 * - Sends the bearer token (if your backend uses cookie sessions instead,
 *   credentials: 'include' already forwards them and the token is simply absent).
 * - Normalises errors into ApiError { message, status, data }.
 * - Broadcasts `auth:expired` on 401 so the AuthProvider can sign the user out.
 */
export async function request(method, path, { body, query, signal } = {}) {
  if (USE_MOCK) {
    const { mockRequest } = await import('./mock');
    try {
      return await mockRequest(method, path, { body, query });
    } catch (e) {
      if (e.status === 401) window.dispatchEvent(new Event('auth:expired'));
      throw e;
    }
  }

  const headers = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}${buildQuery(query)}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('Network error — check your connection.', 0);
  }

  if (res.status === 204) return null;
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('auth:expired'));
    const message =
      (data && typeof data === 'object' && (data.error?.message || data.message)) ||
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }
  return data;
}

export const http = {
  get: (p, query, opts) => request('GET', p, { query, ...opts }),
  post: (p, body, opts) => request('POST', p, { body, ...opts }),
  patch: (p, body, opts) => request('PATCH', p, { body, ...opts }),
  put: (p, body, opts) => request('PUT', p, { body, ...opts }),
  del: (p, opts) => request('DELETE', p, opts),
};
