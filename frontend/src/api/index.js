import { http } from './client';

/** Every backend endpoint the dashboard uses (FastAPI, /api prefix). */
export const api = {
  auth: {
    me: () => http.get('/auth/me'),
    login: (email, password) => http.post('/auth/login', { email, password }),
    signup: (data) => http.post('/auth/signup', data),
    logout: () => http.post('/auth/logout'),
    logoutAll: () => http.post('/auth/logout-all'),
    changePassword: (current_password, new_password) => http.post('/auth/change-password', { current_password, new_password }),
    forgotPassword: (email) => http.post('/auth/forgot-password', { email }),
    resetPassword: (token, password) => http.post('/auth/reset-password', { token, password }),
    inviteInfo: (token) => http.get(`/auth/invites/${encodeURIComponent(token)}`),
    acceptInvite: (data) => http.post('/auth/accept-invite', data),
  },

  keys: {
    list: (q) => http.get('/keys', q),
    create: (data) => http.post('/keys', data), // -> { key, secret }
    update: (id, data) => http.patch(`/keys/${id}`, data),
    rollSecret: (id) => http.post(`/keys/${id}/roll-secret`), // -> { key, secret }
    revoke: (id) => http.post(`/keys/${id}/revoke`),
    remove: (id) => http.del(`/keys/${id}`),
  },

  usage: {
    timeseries: (q) => http.get('/usage/timeseries', q),
    byKey: (q) => http.get('/usage/by-key', q),
  },

  quota: {
    get: () => http.get('/quota'),
    setAlerts: (data) => http.put('/quota/alerts', data),
  },

  rateLimits: {
    get: () => http.get('/rate-limits'),
    requestIncrease: (data) => http.post('/rate-limits/increase-requests', data),
  },

  logs: {
    list: (q) => http.get('/logs', q),
    get: (id) => http.get(`/logs/${id}`),
  },

  billing: {
    plans: () => http.get('/billing/plans'),
    account: () => http.get('/billing/account'),
    checkout: (plan) => http.post('/billing/checkout', { plan }), // -> { url }
    portal: () => http.post('/billing/portal'), // -> { url }
    invoices: () => http.get('/billing/invoices'),
  },

  notifications: {
    list: () => http.get('/notifications'),
    readAll: () => http.post('/notifications/read-all'),
  },

  team: {
    list: () => http.get('/team'),
    invite: (email, role) => http.post('/team/invites', { email, role }),
    revokeInvite: (id) => http.del(`/team/invites/${id}`),
    updateRole: (id, role) => http.patch(`/team/${id}`, { role }),
    remove: (id) => http.del(`/team/${id}`),
  },

  settings: {
    get: () => http.get('/settings'),
    update: (data) => http.patch('/settings', data),
  },
};
