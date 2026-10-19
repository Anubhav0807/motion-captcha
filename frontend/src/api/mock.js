/**
 * In-browser mock backend. It implements the same REST contract as the real
 * API (see README) so the console is fully usable before your backend exists.
 * State persists in localStorage. Set VITE_USE_MOCK=false to disable.
 */
import { MODELS, TIERS, KEY_PREFIX } from '../config';
import { ApiError } from './errors';

const STORE = 'ks_mock_db_v2';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const iso = (t) => new Date(t).toISOString();
const delay = () => new Promise((r) => setTimeout(r, 180 + Math.random() * 220));
const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

function randomSecret(len = 40) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

const floorDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const floorHour = (t) => Math.floor(t / HOUR) * HOUR;

/* ------------------------------------------------------------------ seed */

function seed(user) {
  const now = Date.now();
  const projects = [
    {
      id: 'prj_prod', name: 'Production API', ref: 'kst-proj-0788796322', tier: 'tier1',
      billingEnabled: true, spendCap: 500, createdAt: iso(now - 190 * DAY),
      logging: { enabled: true, retentionDays: 30 },
    },
    {
      id: 'prj_play', name: 'playground', ref: 'kst-proj-0021837777', tier: 'free',
      billingEnabled: false, spendCap: null, createdAt: iso(now - 45 * DAY),
      logging: { enabled: false, retentionDays: 7 },
    },
  ];
  const mkKey = (o) => {
    const secret = KEY_PREFIX + randomSecret();
    return {
      status: 'active', revokedAt: null, expiresAt: null, lastUsedAt: iso(now - Math.random() * 6 * HOUR),
      restrictions: { models: [], ips: [], referrers: [] },
      prefix: KEY_PREFIX, last4: secret.slice(-4), ...o,
    };
  };
  const keys = [
    mkKey({ id: 'key_backend', name: 'backend-server', projectId: 'prj_prod', createdAt: iso(now - 180 * DAY),
      volume: 4200, mix: { 'nova-pro': 0.35, 'nova-flash': 0.55, 'nova-embed': 0.1 },
      restrictions: { models: [], ips: ['34.120.0.0/16'], referrers: [] } }),
    mkKey({ id: 'key_worker', name: 'batch-worker', projectId: 'prj_prod', createdAt: iso(now - 70 * DAY),
      volume: 1600, mix: { 'nova-flash': 0.4, 'nova-embed': 0.6 } }),
    mkKey({ id: 'key_play', name: 'local-dev', projectId: 'prj_play', createdAt: iso(now - 40 * DAY),
      volume: 140, mix: { 'nova-pro': 0.3, 'nova-flash': 0.7 }, expiresAt: iso(now + 50 * DAY) }),
    mkKey({ id: 'key_old', name: 'legacy-mobile', projectId: 'prj_prod', createdAt: iso(now - 160 * DAY),
      volume: 900, mix: { 'nova-flash': 1 }, status: 'revoked', revokedAt: iso(now - 20 * DAY),
      lastUsedAt: iso(now - 20 * DAY) }),
  ];
  const db = {
    user: { id: 'usr_1', name: user?.name || 'Alex Morgan', email: user?.email || 'you@company.com', avatarColor: '#0d7a5f' },
    projects, keys,
    budgets: [
      { id: 'bud_1', name: 'Monthly production budget', projectId: 'prj_prod', amount: 400,
        thresholds: [50, 90, 100], emails: [user?.email || 'you@company.com'], createdAt: iso(now - 60 * DAY) },
    ],
    team: [
      { id: 'mem_1', name: user?.name || 'Alex Morgan', email: user?.email || 'you@company.com', role: 'owner', status: 'active', joinedAt: iso(now - 190 * DAY) },
      { id: 'mem_2', name: 'Priya Natarajan', email: 'priya@company.com', role: 'admin', status: 'active', joinedAt: iso(now - 90 * DAY) },
      { id: 'mem_3', name: '', email: 'devops@company.com', role: 'developer', status: 'invited', joinedAt: iso(now - 2 * DAY) },
    ],
    notifications: [
      { id: 'n1', title: 'Budget 50% reached', body: 'Monthly production budget has used half of $400.', createdAt: iso(now - 3 * HOUR), read: false, tone: 'warn' },
      { id: 'n2', title: 'Key expiring soon', body: '“local-dev” expires in 50 days.', createdAt: iso(now - 26 * HOUR), read: false, tone: 'info' },
      { id: 'n3', title: 'Invoice paid', body: 'Last month’s invoice was paid successfully.', createdAt: iso(now - 9 * DAY), read: true, tone: 'ok' },
    ],
    settings: {
      notifications: { budgetAlerts: true, keyExpiry: true, rateLimitHits: false, productUpdates: true, weeklyReport: true },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    billing: {
      paymentMethod: { brand: 'Visa', last4: '4242', expMonth: 8, expYear: 2028 },
      billingEmail: user?.email || 'you@company.com', currency: 'USD', credits: 25,
    },
    rateLimitRequests: [],
    logs: [],
  };
  db.logs = genLogs(db);
  return db;
}

function genLogs(db) {
  const rnd = seeded('logs');
  const now = Date.now();
  const active = db.keys.filter((k) => k.status === 'active');
  const errs = [
    [429, 'Rate limit exceeded: requests per minute.'],
    [400, 'Invalid request: "messages" must not be empty.'],
    [401, 'API key not valid.'],
    [500, 'Internal error. Please retry.'],
    [503, 'Model is overloaded. Please retry.'],
  ];
  const out = [];
  for (let i = 0; i < 420; i++) {
    const key = active[Math.floor(rnd() * active.length)];
    const mixEntries = Object.entries(key.mix);
    let p = rnd(), model = mixEntries[0][0];
    for (const [m, s] of mixEntries) { if ((p -= s) <= 0) { model = m; break; } }
    const isErr = rnd() < 0.06;
    const err = errs[Math.floor(rnd() * errs.length)];
    const embed = model === 'nova-embed';
    const inTok = Math.round((embed ? 200 : 600) + rnd() * 1800);
    const outTok = embed || isErr ? 0 : Math.round(80 + rnd() * 900);
    out.push({
      id: `req_${Math.floor(rnd() * 1e12).toString(36)}${i}`,
      timestamp: iso(now - Math.pow(rnd(), 1.4) * 7 * DAY),
      projectId: key.projectId, keyId: key.id, model,
      method: 'POST', endpoint: embed ? '/v1/embeddings' : (rnd() < 0.7 ? '/v1/chat/completions' : '/v1/responses'),
      status: isErr ? err[0] : 200,
      error: isErr ? err[1] : null,
      latencyMs: Math.round((embed ? 60 : 350) + rnd() * (embed ? 200 : 2600)),
      inputTokens: isErr && err[0] !== 500 ? 0 : inTok,
      outputTokens: outTok,
      streamed: !embed && rnd() < 0.5,
      ip: `34.120.${Math.floor(rnd() * 255)}.${Math.floor(rnd() * 255)}`,
      userAgent: rnd() < 0.6 ? 'keystone-python/2.4.1' : 'keystone-node/1.9.0',
    });
  }
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  const db = seed();
  save(db);
  return db;
}
function save(db) {
  try { localStorage.setItem(STORE, JSON.stringify(db)); } catch { /* ignore */ }
}

/* ------------------------------------------------------------ usage math */

function priceFor(project, m, inTok, outTok) {
  if (!project || project.tier === 'free') return 0;
  return (inTok * m.input + outTok * m.output) / 1e6;
}

function keyDay(db, key, dayStart) {
  const created = floorDay(Date.parse(key.createdAt));
  const end = key.revokedAt ? Date.parse(key.revokedAt) : Infinity;
  if (dayStart < created || dayStart > end || dayStart > Date.now()) return null;
  const project = db.projects.find((p) => p.id === key.projectId);
  const r = seeded(`${key.id}:${dayStart}`);
  const dow = new Date(dayStart).getDay();
  const weekend = dow === 0 || dow === 6 ? 0.55 : 1;
  const trend = Math.max(0.3, 1 + (dayStart - Date.now()) / (DAY * 240));
  let frac = 1;
  if (dayStart === floorDay(Date.now())) frac = Math.max(0.02, (Date.now() - dayStart) / DAY);
  const req = Math.round((key.volume || 0) * weekend * trend * (0.65 + r() * 0.7) * frac);
  return MODELS.map((m) => {
    const share = key.mix?.[m.id] || 0;
    const rq = Math.round(req * share);
    const embed = m.id === 'nova-embed';
    const inTok = Math.round(rq * (embed ? 300 : 950) * (0.8 + r() * 0.4));
    const outTok = embed ? 0 : Math.round(rq * 340 * (0.7 + r() * 0.6));
    const errors = Math.round(rq * (0.004 + r() * 0.018));
    return { model: m.id, requests: rq, inputTokens: inTok, outputTokens: outTok, errors, cost: priceFor(project, m, inTok, outTok) };
  });
}

const hourShape = (h) => 0.35 + 0.65 * Math.max(0, Math.sin(((h - 5) / 24) * 2 * Math.PI)) * 1.6;

function filterKeys(db, { projectId, keyId }) {
  return db.keys.filter((k) => (!projectId || k.projectId === projectId) && (!keyId || k.id === keyId));
}

function emptyRow() {
  return { requests: 0, inputTokens: 0, outputTokens: 0, errors: 0, cost: 0 };
}
function addRow(a, b, scale = 1) {
  a.requests += Math.round(b.requests * scale);
  a.inputTokens += Math.round(b.inputTokens * scale);
  a.outputTokens += Math.round(b.outputTokens * scale);
  a.errors += Math.round(b.errors * scale);
  a.cost += b.cost * scale;
}

function timeseries(db, q) {
  const to = q.to ? Date.parse(q.to) : Date.now();
  const from = q.from ? Date.parse(q.from) : to - 30 * DAY;
  const gran = q.granularity === 'hour' ? 'hour' : 'day';
  const keys = filterKeys(db, q);
  const points = [];
  const totals = emptyRow();
  if (gran === 'day') {
    for (let t = floorDay(from); t <= to; t += DAY) {
      const p = { ts: iso(t), ...emptyRow(), models: {} };
      keys.forEach((k) => (keyDay(db, k, t) || []).forEach((r) => {
        addRow(p, r);
        p.models[r.model] = (p.models[r.model] || 0) + r.requests;
      }));
      addRow(totals, p);
      points.push(p);
    }
  } else {
    const shapeSum = Array.from({ length: 24 }, (_, h) => hourShape(h)).reduce((a, b) => a + b, 0);
    for (let t = floorHour(from); t <= to; t += HOUR) {
      const p = { ts: iso(t), ...emptyRow(), models: {} };
      const dayStart = floorDay(t);
      const hour = new Date(t).getHours();
      const isToday = dayStart === floorDay(Date.now());
      const hoursSoFar = isToday ? Math.max(1, new Date().getHours() + 1) : 24;
      const shapeSoFar = isToday
        ? Array.from({ length: hoursSoFar }, (_, h) => hourShape(h)).reduce((a, b) => a + b, 0)
        : shapeSum;
      const r = seeded(`h${t}`);
      keys.forEach((k) =>
        (keyDay(db, k, dayStart) || []).forEach((row) => {
          const f = (hourShape(hour) / shapeSoFar) * (0.8 + r() * 0.4);
          addRow(p, row, f);
          p.models[row.model] = (p.models[row.model] || 0) + Math.round(row.requests * f);
        }),
      );
      addRow(totals, p);
      points.push(p);
    }
  }
  return { granularity: gran, from: iso(from), to: iso(to), points, totals };
}

function breakdown(db, q) {
  const to = q.to ? Date.parse(q.to) : Date.now();
  const from = q.from ? Date.parse(q.from) : to - 30 * DAY;
  const keys = filterKeys(db, q);
  const groups = new Map();
  for (let t = floorDay(from); t <= to; t += DAY) {
    keys.forEach((k) =>
      (keyDay(db, k, t) || []).forEach((row) => {
        const id = q.by === 'key' ? k.id : row.model;
        if (!groups.has(id)) groups.set(id, { id, ...emptyRow() });
        addRow(groups.get(id), row);
      }),
    );
  }
  return { by: q.by || 'model', items: [...groups.values()].sort((a, b) => b.requests - a.requests) };
}

function sumCost(db, projectId, from, to) {
  return timeseries(db, { projectId, from: iso(from), to: iso(to), granularity: 'day' }).totals.cost;
}

/* ---------------------------------------------------------------- router */

const routes = [];
const on = (method, pattern, handler, { open = false } = {}) => {
  const names = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { names.push(k); return '([^/]+)'; })}$`);
  routes.push({ method, re, names, handler, open });
};

const need = (cond, msg, status = 400) => { if (!cond) throw new ApiError(msg, status); };
const findOr404 = (arr, id, what) => {
  const x = arr.find((i) => i.id === id);
  if (!x) throw new ApiError(`${what} not found`, 404);
  return x;
};
const publicKey = (k) => {
  const { volume, mix, ...rest } = k; // internal mock fields
  return rest;
};
const publicProject = (db, p) => ({
  ...p,
  keyCount: db.keys.filter((k) => k.projectId === p.id && k.status === 'active').length,
});

// auth
on('POST', '/auth/login', ({ body }) => {
  need(body.email && body.password, 'Email and password are required.');
  need(String(body.password).length >= 6, 'Invalid email or password.', 401);
  let db = load();
  if (db.user.email !== body.email) { db = seed({ email: body.email, name: body.email.split('@')[0] }); }
  save(db);
  return { token: `mock.${randomSecret(24)}`, user: db.user };
}, { open: true });

on('POST', '/auth/signup', ({ body }) => {
  need(body.name && body.email && body.password, 'All fields are required.');
  need(String(body.password).length >= 8, 'Password must be at least 8 characters.');
  const db = seed({ email: body.email, name: body.name });
  save(db);
  return { token: `mock.${randomSecret(24)}`, user: db.user };
}, { open: true });

on('GET', '/auth/me', ({ db }) => db.user);
on('POST', '/auth/logout', () => null, { open: true });
on('POST', '/auth/logout-all', () => null);

// projects
on('GET', '/projects', ({ db }) => db.projects.map((p) => publicProject(db, p)));
on('POST', '/projects', ({ db, body }) => {
  const name = String(body.name || '').trim();
  need(name.length >= 2, 'Project name must be at least 2 characters.');
  need(!db.projects.some((p) => p.name.toLowerCase() === name.toLowerCase()), 'A project with this name already exists.', 409);
  const p = {
    id: uid('prj'), name, ref: `kst-proj-${String(Math.floor(Math.random() * 1e10)).padStart(10, '0')}`,
    tier: 'free', billingEnabled: false, spendCap: null, createdAt: iso(Date.now()),
    logging: { enabled: false, retentionDays: 7 },
  };
  db.projects.push(p);
  return publicProject(db, p);
});
on('PATCH', '/projects/:id', ({ db, params, body }) => {
  const p = findOr404(db.projects, params.id, 'Project');
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    need(name.length >= 2, 'Project name must be at least 2 characters.');
    p.name = name;
  }
  return publicProject(db, p);
});
on('DELETE', '/projects/:id', ({ db, params }) => {
  findOr404(db.projects, params.id, 'Project');
  need(!db.keys.some((k) => k.projectId === params.id && k.status === 'active'),
    'Revoke all active keys in this project before deleting it.', 409);
  db.projects = db.projects.filter((p) => p.id !== params.id);
  db.keys = db.keys.filter((k) => k.projectId !== params.id);
  db.budgets = db.budgets.filter((b) => b.projectId !== params.id);
  return null;
});
on('PUT', '/projects/:id/spend-cap', ({ db, params, body }) => {
  const p = findOr404(db.projects, params.id, 'Project');
  need(p.billingEnabled, 'Enable billing on this project to set a spend cap.', 409);
  need(body.amount === null || (Number(body.amount) > 0), 'Spend cap must be a positive amount.');
  p.spendCap = body.amount === null ? null : Number(body.amount);
  return publicProject(db, p);
});
on('GET', '/projects/:id/logging', ({ db, params }) => findOr404(db.projects, params.id, 'Project').logging);
on('PATCH', '/projects/:id/logging', ({ db, params, body }) => {
  const p = findOr404(db.projects, params.id, 'Project');
  p.logging = { ...p.logging, ...body };
  return p.logging;
});

// keys
on('GET', '/keys', ({ db, query }) =>
  db.keys
    .filter((k) => (!query.projectId || k.projectId === query.projectId) && (!query.status || k.status === query.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(publicKey));

on('POST', '/keys', ({ db, body }) => {
  const name = String(body.name || '').trim();
  need(name.length >= 2, 'Key name must be at least 2 characters.');
  need(body.projectId, 'Choose a project.');
  findOr404(db.projects, body.projectId, 'Project');
  const secret = KEY_PREFIX + randomSecret();
  const k = {
    id: uid('key'), name, projectId: body.projectId, prefix: KEY_PREFIX, last4: secret.slice(-4),
    createdAt: iso(Date.now()), lastUsedAt: null, status: 'active', revokedAt: null,
    expiresAt: body.expiresInDays ? iso(Date.now() + Number(body.expiresInDays) * DAY) : null,
    restrictions: { models: body.restrictions?.models || [], ips: body.restrictions?.ips || [], referrers: body.restrictions?.referrers || [] },
    volume: 0, mix: {},
  };
  db.keys.push(k);
  return { key: publicKey(k), secret };
});
on('PATCH', '/keys/:id', ({ db, params, body }) => {
  const k = findOr404(db.keys, params.id, 'Key');
  if (body.name !== undefined) {
    need(String(body.name).trim().length >= 2, 'Key name must be at least 2 characters.');
    k.name = String(body.name).trim();
  }
  if (body.restrictions) k.restrictions = { ...k.restrictions, ...body.restrictions };
  return publicKey(k);
});
on('POST', '/keys/:id/regenerate', ({ db, params }) => {
  const k = findOr404(db.keys, params.id, 'Key');
  need(k.status === 'active', 'Revoked keys cannot be regenerated.', 409);
  const secret = KEY_PREFIX + randomSecret();
  k.last4 = secret.slice(-4);
  k.rotatedAt = iso(Date.now());
  return { key: publicKey(k), secret };
});
on('POST', '/keys/:id/revoke', ({ db, params }) => {
  const k = findOr404(db.keys, params.id, 'Key');
  k.status = 'revoked';
  k.revokedAt = iso(Date.now());
  return publicKey(k);
});
on('DELETE', '/keys/:id', ({ db, params }) => {
  findOr404(db.keys, params.id, 'Key');
  db.keys = db.keys.filter((k) => k.id !== params.id);
  return null;
});

// usage
on('GET', '/usage/timeseries', ({ db, query }) => timeseries(db, query));
on('GET', '/usage/breakdown', ({ db, query }) => breakdown(db, query));

// rate limits
on('GET', '/rate-limits', ({ db, query }) => {
  const p = findOr404(db.projects, query.projectId, 'Project');
  const tier = TIERS[p.tier];
  const today = breakdown(db, { projectId: p.id, from: iso(floorDay(Date.now())), by: 'model' }).items;
  const r = seeded(`rl${p.id}${floorHour(Date.now())}`);
  return {
    projectId: p.id, tier: p.tier,
    limits: Object.entries(tier.limits).map(([model, l]) => {
      const u = today.find((i) => i.id === model) || emptyRow();
      const peakRpm = Math.min(l.rpm, Math.ceil((u.requests / 1440) * (3 + r() * 5)));
      const peakTpm = Math.min(l.tpm, Math.ceil(((u.inputTokens + u.outputTokens) / 1440) * (3 + r() * 5)));
      return {
        model,
        rpm: { limit: l.rpm, peak: peakRpm },
        tpm: { limit: l.tpm, peak: peakTpm },
        rpd: { limit: l.rpd, used: u.requests },
        throttled24h: Math.round(u.errors * 0.3),
      };
    }),
    requests: db.rateLimitRequests.filter((x) => x.projectId === p.id),
  };
});
on('POST', '/rate-limits/increase-requests', ({ db, body }) => {
  need(body.projectId && body.model && body.reason, 'Project, model and reason are required.');
  const reqst = { id: uid('rli'), ...body, status: 'under_review', createdAt: iso(Date.now()) };
  db.rateLimitRequests.push(reqst);
  return reqst;
});

// spend & budgets
on('GET', '/spend/summary', ({ db, query }) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsed = (Date.now() - monthStart) / DAY;
  const mtd = sumCost(db, query.projectId, monthStart, Date.now());
  const last = sumCost(db, query.projectId, lastStart, monthStart - 1);
  const projects = db.projects.filter((p) => !query.projectId || p.id === query.projectId);
  const capped = projects.filter((p) => p.spendCap != null);
  return {
    currency: 'USD',
    monthToDate: mtd,
    lastMonth: last,
    forecast: elapsed > 0 ? (mtd / elapsed) * daysInMonth : 0,
    spendCap: capped.length && capped.length === projects.length ? capped.reduce((a, p) => a + p.spendCap, 0) : null,
    periodStart: iso(monthStart),
    periodEnd: iso(new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() - 1),
    byProject: projects.map((p) => ({ projectId: p.id, monthToDate: sumCost(db, p.id, monthStart, Date.now()), spendCap: p.spendCap })),
  };
});

const withBudgetSpend = (db, b) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return { ...b, spent: sumCost(db, b.projectId, monthStart, Date.now()) };
};
const validateBudget = (body) => {
  need(String(body.name || '').trim().length >= 2, 'Budget name is required.');
  need(Number(body.amount) > 0, 'Budget amount must be greater than 0.');
  need(Array.isArray(body.thresholds) && body.thresholds.length, 'Add at least one alert threshold.');
};
on('GET', '/budgets', ({ db }) => db.budgets.map((b) => withBudgetSpend(db, b)));
on('POST', '/budgets', ({ db, body }) => {
  validateBudget(body);
  const b = { id: uid('bud'), name: body.name.trim(), projectId: body.projectId || null, amount: Number(body.amount),
    thresholds: body.thresholds.map(Number).sort((a, c) => a - c), emails: body.emails || [], createdAt: iso(Date.now()) };
  db.budgets.push(b);
  return withBudgetSpend(db, b);
});
on('PATCH', '/budgets/:id', ({ db, params, body }) => {
  const b = findOr404(db.budgets, params.id, 'Budget');
  validateBudget({ ...b, ...body });
  Object.assign(b, { ...body, amount: Number(body.amount ?? b.amount) });
  return withBudgetSpend(db, b);
});
on('DELETE', '/budgets/:id', ({ db, params }) => {
  db.budgets = db.budgets.filter((b) => b.id !== params.id);
  return null;
});

// billing
on('GET', '/billing/account', ({ db }) => ({
  ...db.billing,
  projects: db.projects.map((p) => ({ id: p.id, name: p.name, tier: p.tier, billingEnabled: p.billingEnabled })),
}));
on('POST', '/billing/checkout-session', ({ db, body }) => {
  // Real backend: create a hosted checkout session and return its URL.
  // Mock: link billing immediately and return no URL.
  const p = findOr404(db.projects, body.projectId, 'Project');
  p.billingEnabled = true;
  if (p.tier === 'free') p.tier = 'tier1';
  if (!db.billing.paymentMethod) db.billing.paymentMethod = { brand: 'Visa', last4: '4242', expMonth: 8, expYear: 2028 };
  return { url: null, mock: true };
});
on('POST', '/billing/portal-session', () => ({ url: null, mock: true }));
on('GET', '/billing/invoices', ({ db }) => {
  const billed = db.projects.filter((p) => p.billingEnabled);
  if (!billed.length) return [];
  const now = new Date();
  const out = [];
  for (let i = 0; i < 6; i++) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime() - 1;
    const amount = billed.reduce((a, p) => a + sumCost(db, p.id, start, Math.min(end, Date.now())), 0);
    if (amount <= 0 && i > 0) continue;
    const d = new Date(start);
    out.push({
      id: `inv_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`,
      number: `KS-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      periodStart: iso(start), periodEnd: iso(end), amount, currency: 'USD',
      status: i === 0 ? 'upcoming' : 'paid',
      issuedAt: i === 0 ? null : iso(end + 1),
    });
  }
  return out;
});
on('GET', '/billing/invoices/:id/pdf', ({ params }) => {
  const text = `Invoice ${params.id}\n\nThis is a mock invoice generated by the console's demo backend.`;
  return { url: `data:text/plain;charset=utf-8,${encodeURIComponent(text)}` };
});

// logs
on('GET', '/logs', ({ db, query }) => {
  const limit = Math.min(Number(query.limit) || 50, 200);
  const q = String(query.q || '').toLowerCase();
  let items = db.logs.filter((l) =>
    (!query.projectId || l.projectId === query.projectId) &&
    (!query.keyId || l.keyId === query.keyId) &&
    (!query.model || l.model === query.model) &&
    (!query.status || (query.status === 'error' ? l.status >= 400 : l.status < 400)) &&
    (!q || l.id.toLowerCase().includes(q) || (l.error || '').toLowerCase().includes(q) || l.endpoint.includes(q)));
  const start = query.cursor ? Number(query.cursor) : 0;
  const page = items.slice(start, start + limit);
  return { items: page, nextCursor: start + limit < items.length ? String(start + limit) : null, total: items.length };
});
on('GET', '/logs/:id', ({ db, params }) => {
  const l = findOr404(db.logs, params.id, 'Log');
  return {
    ...l,
    request: { model: l.model, stream: l.streamed, max_output_tokens: 1024, temperature: 0.7, messages: '[redacted — enable payload logging to store]' },
    response: l.error ? { error: { code: l.status, message: l.error } } : { finish_reason: 'stop', usage: { input_tokens: l.inputTokens, output_tokens: l.outputTokens } },
  };
});

// notifications
on('GET', '/notifications', ({ db }) => db.notifications);
on('POST', '/notifications/read-all', ({ db }) => { db.notifications.forEach((n) => { n.read = true; }); return null; });

// team
on('GET', '/team', ({ db }) => db.team);
on('POST', '/team/invites', ({ db, body }) => {
  need(/^\S+@\S+\.\S+$/.test(body.email || ''), 'Enter a valid email address.');
  need(!db.team.some((m) => m.email === body.email), 'That person is already on the team.', 409);
  const m = { id: uid('mem'), name: '', email: body.email, role: body.role || 'developer', status: 'invited', joinedAt: iso(Date.now()) };
  db.team.push(m);
  return m;
});
on('PATCH', '/team/:id', ({ db, params, body }) => {
  const m = findOr404(db.team, params.id, 'Member');
  need(m.role !== 'owner', 'The owner role cannot be changed.', 409);
  m.role = body.role;
  return m;
});
on('DELETE', '/team/:id', ({ db, params }) => {
  const m = findOr404(db.team, params.id, 'Member');
  need(m.role !== 'owner', 'The owner cannot be removed.', 409);
  db.team = db.team.filter((x) => x.id !== params.id);
  return null;
});

// settings
on('GET', '/settings', ({ db }) => ({ ...db.settings, profile: { name: db.user.name, email: db.user.email } }));
on('PATCH', '/settings', ({ db, body }) => {
  if (body.profile?.name) db.user.name = body.profile.name;
  if (body.notifications) db.settings.notifications = { ...db.settings.notifications, ...body.notifications };
  if (body.timezone) db.settings.timezone = body.timezone;
  return { ...db.settings, profile: { name: db.user.name, email: db.user.email } };
});

export async function mockRequest(method, path, { body, query } = {}) {
  await delay();
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = path.match(r.re);
    if (!m) continue;
    if (!r.open) {
      let token = null;
      try { token = localStorage.getItem('ks_console_token'); } catch { /* ignore */ }
      if (!token) throw new ApiError('Not signed in.', 401);
    }
    const params = {};
    r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
    const db = load();
    const result = r.handler({ db, params, body: body || {}, query: query || {} });
    save(db);
    return result === undefined || result === null ? null : JSON.parse(JSON.stringify(result));
  }
  throw new ApiError(`No route for ${method} ${path}`, 404);
}
