import { http } from './client';

/**
 * Every backend endpoint the console uses. The README documents the
 * request/response shapes so your backend can implement the same contract.
 */
export const api = {
  auth: {
    login: (email, password) => http.post('/auth/login', { email, password }),
    signup: (name, email, password) => http.post('/auth/signup', { name, email, password }),
    me: () => http.get('/auth/me'),
    logout: () => http.post('/auth/logout'),
    logoutAll: () => http.post('/auth/logout-all'),
  },

  projects: {
    list: () => http.get('/projects'),
    create: (data) => http.post('/projects', data),
    update: (id, data) => http.patch(`/projects/${id}`, data),
    remove: (id) => http.del(`/projects/${id}`),
  },

  keys: {
    list: (q) => http.get('/keys', q),
    create: (data) => http.post('/keys', data), // -> { key, secret }  (secret shown once)
    update: (id, data) => http.patch(`/keys/${id}`, data),
    regenerate: (id) => http.post(`/keys/${id}/regenerate`), // -> { key, secret }
    revoke: (id) => http.post(`/keys/${id}/revoke`),
    remove: (id) => http.del(`/keys/${id}`),
  },

  usage: {
    timeseries: (q) => http.get('/usage/timeseries', q), // q: from,to,granularity,projectId,keyId
    breakdown: (q) => http.get('/usage/breakdown', q), // q: by=model|key + filters
  },

  rateLimits: {
    get: (projectId) => http.get('/rate-limits', { projectId }),
    requestIncrease: (data) => http.post('/rate-limits/increase-requests', data),
  },

  spend: {
    summary: (projectId) => http.get('/spend/summary', { projectId }),
    setCap: (projectId, amount) => http.put(`/projects/${projectId}/spend-cap`, { amount }),
  },

  budgets: {
    list: () => http.get('/budgets'),
    create: (data) => http.post('/budgets', data),
    update: (id, data) => http.patch(`/budgets/${id}`, data),
    remove: (id) => http.del(`/budgets/${id}`),
  },

  billing: {
    account: () => http.get('/billing/account'),
    // Backend creates a hosted checkout (e.g. Stripe Checkout) and returns { url }.
    checkout: (data) => http.post('/billing/checkout-session', data),
    // Backend creates a hosted billing portal session and returns { url }.
    portal: (data) => http.post('/billing/portal-session', data),
    invoices: () => http.get('/billing/invoices'),
    invoicePdf: (id) => http.get(`/billing/invoices/${id}/pdf`), // -> { url }
  },

  logs: {
    list: (q) => http.get('/logs', q), // cursor pagination -> { items, nextCursor }
    get: (id) => http.get(`/logs/${id}`),
    settings: (projectId) => http.get(`/projects/${projectId}/logging`),
    updateSettings: (projectId, data) => http.patch(`/projects/${projectId}/logging`, data),
  },

  notifications: {
    list: () => http.get('/notifications'),
    readAll: () => http.post('/notifications/read-all'),
  },

  team: {
    list: () => http.get('/team'),
    invite: (email, role) => http.post('/team/invites', { email, role }),
    updateRole: (id, role) => http.patch(`/team/${id}`, { role }),
    remove: (id) => http.del(`/team/${id}`),
  },

  settings: {
    get: () => http.get('/settings'),
    update: (data) => http.patch('/settings', data),
  },
};
