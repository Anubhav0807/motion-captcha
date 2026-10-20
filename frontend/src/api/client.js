import { ApiError } from './errors';

const API_BASE = '/api';

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
 * Every dashboard call goes through here. Auth is an HttpOnly session cookie
 * set by the backend, so no token is ever handled in JavaScript.
 * A 401 broadcasts `auth:expired` so the app returns to the sign-in page.
 */
export async function request(method, path, { body, query, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_BASE}${path}${buildQuery(query)}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('Can’t reach the server. Check your connection.', 0);
  }

  if (res.status === 204) return null;
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) window.dispatchEvent(new Event('auth:expired'));
    const message = data?.error?.message || data?.detail || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data, data?.error?.code);
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
