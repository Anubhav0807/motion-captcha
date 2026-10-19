# Keystone Console — API key, usage & billing dashboard (React)

A production-ready frontend for letting your users create API keys and manage
everything around them: projects, usage analytics, rate limits, request logs,
spend & budgets, billing, team and settings.

Built with **React 18 + Vite + React Router + Recharts + lucide-react**. Plain CSS
with design tokens (light + dark mode, responsive down to phones).

## Quick start

```bash
npm install
cp .env.example .env        # VITE_USE_MOCK=true runs with a built-in demo backend
npm run dev                 # http://localhost:5173
npm run build               # static output in dist/
```

In mock mode, sign in with any email and a 6+ character password. Data is stored
in `localStorage` (clear it to reset).

## Connecting your backend

1. Set `VITE_USE_MOCK=false` and `VITE_API_BASE_URL` (e.g. `/api/v1` or `https://api.yourdomain.com/v1`).
2. Implement the endpoints below. `src/api/mock.js` is a working reference implementation of every one.
3. Errors: return a non-2xx status with `{ "error": { "message": "..." } }` — the UI shows the message.
4. Auth: return `{ token, user }` from login/signup; the client sends `Authorization: Bearer <token>`.
   If you prefer HttpOnly session cookies (recommended), just set the cookie and omit `token` —
   requests already use `credentials: 'include'`. Any `401` signs the user out.

| Area | Method & path | Notes |
|---|---|---|
| Auth | `POST /auth/login`, `POST /auth/signup` | → `{ token?, user }` |
| | `GET /auth/me`, `POST /auth/logout`, `POST /auth/logout-all` | |
| Projects | `GET/POST /projects`, `PATCH/DELETE /projects/:id` | project: `{ id, name, ref, tier, billingEnabled, spendCap, keyCount, createdAt }` |
| | `PUT /projects/:id/spend-cap` | `{ amount: number \| null }` |
| | `GET/PATCH /projects/:id/logging` | `{ enabled, retentionDays }` |
| Keys | `GET /keys?projectId&status` | key: `{ id, name, projectId, prefix, last4, status, createdAt, lastUsedAt, expiresAt, restrictions: { models[], ips[], referrers[] } }` |
| | `POST /keys` | body `{ name, projectId, expiresInDays, restrictions }` → `{ key, secret }` |
| | `PATCH /keys/:id` | `{ name?, restrictions? }` |
| | `POST /keys/:id/regenerate` | → `{ key, secret }` |
| | `POST /keys/:id/revoke`, `DELETE /keys/:id` | |
| Usage | `GET /usage/timeseries?from&to&granularity=hour\|day&projectId&keyId` | → `{ granularity, points: [{ ts, requests, inputTokens, outputTokens, errors, cost, models: { [modelId]: requests } }], totals }` |
| | `GET /usage/breakdown?by=model\|key&from&to&projectId&keyId` | → `{ items: [{ id, requests, inputTokens, outputTokens, errors, cost }] }` |
| Rate limits | `GET /rate-limits?projectId` | → `{ tier, limits: [{ model, rpm:{limit,peak}, tpm:{limit,peak}, rpd:{limit,used}, throttled24h }], requests[] }` |
| | `POST /rate-limits/increase-requests` | `{ projectId, model, metric, requested, reason }` |
| Spend | `GET /spend/summary?projectId` | → `{ monthToDate, lastMonth, forecast, spendCap, periodStart, periodEnd, byProject[] }` |
| Budgets | `GET/POST /budgets`, `PATCH/DELETE /budgets/:id` | `{ name, projectId\|null, amount, thresholds[], emails[] }` (+ `spent` in responses) |
| Billing | `GET /billing/account` | `{ paymentMethod, billingEmail, currency, credits, projects[] }` |
| | `POST /billing/checkout-session` | `{ projectId, successUrl, cancelUrl }` → `{ url }` (UI redirects) |
| | `POST /billing/portal-session` | `{ returnUrl }` → `{ url }` |
| | `GET /billing/invoices`, `GET /billing/invoices/:id/pdf` | pdf → `{ url }` |
| Logs | `GET /logs?cursor&limit&projectId&keyId&model&status=success\|error&q` | → `{ items, nextCursor, total }` |
| | `GET /logs/:id` | single log + `request` / `response` objects |
| Other | `GET /notifications`, `POST /notifications/read-all` | |
| | `GET /team`, `POST /team/invites`, `PATCH/DELETE /team/:id` | roles: owner, admin, developer, billing, viewer |
| | `GET/PATCH /settings` | `{ profile, notifications, timezone }` |

## Security requirements for the backend

- **Generate keys server-side** with a CSPRNG, store only a hash (e.g. SHA-256 / HMAC with a pepper)
  plus `prefix` and `last4`. Return the plaintext `secret` exactly once. The UI never stores it.
- **Never accept card data** in your API. Use a hosted checkout + customer portal (e.g. Stripe
  Checkout / Billing Portal) and update `billingEnabled`/tier from the payment provider's webhooks.
- Enforce roles, spend caps, IP/referrer/model restrictions and rate limits in your API gateway —
  the UI only displays them.
- Compute usage and cost from metered gateway events, not from client-reported numbers.

## Customising

- Brand name, docs URL, key prefix: `.env` (`VITE_APP_NAME`, `VITE_DOCS_URL`, `VITE_KEY_PREFIX`).
- Models, prices and tier limits: `src/config.js`.
- Colours and fonts: tokens at the top of `src/styles.css`.

## Structure

```
src/
  api/          client.js (fetch wrapper), index.js (all endpoints), mock.js (demo backend)
  context/      Auth, Projects, Toast providers
  components/   Layout (sidebar, topbar, ⌘K palette, notifications), ui kit, charts, modals, filters
  pages/        Overview, ApiKeys, Projects, Usage, RateLimits, Logs, Spend, Billing, Settings, Login
```
