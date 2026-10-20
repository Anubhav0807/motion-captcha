# motion-captcha

CAPTCHA-as-a-service. Companies sign up, create API keys, drop a widget
into their forms and verify answers from their servers. Every visitor is
risk-scored from mouse, click and keyboard behaviour. Low-risk visitors
get a static image; high-risk visitors get the **motion CAPTCHA**, which
is readable only while it moves.

``` text
motion-captcha/
  backend/     FastAPI + PostgreSQL: public CAPTCHA API, dashboard API, Stripe billing, widget.js, ML scripts
  frontend/    React (Vite) customer dashboard
```

## How it works

``` text
Customer's page                     motion-captcha API                 Customer's server
───────────────                     ──────────────────                 ─────────────────
widget.js collects behaviour ──►  POST /v1/assess   (site key)
                                  ◄── token  (risk score stays private)
<img>                         ──►  GET  /v1/challenge/{token}
                                  ◄── PNG (risk < threshold) or GIF (motion)
form submit: mc_token + mc_answer ───────────────────────────────────►
                                     POST /v1/verify  (secret key)   ◄── token + answer
                                     ──► { success, risk_score, ... } ──►
```

-   **Site key** (`mc_pk_…`) is public and goes in the HTML. It only
    works from the key's allowed domains.
-   **Secret key** (`mc_sk_…`) is shown once, stored as a SHA-256 hash,
    and used only server-to-server.
-   Tokens are single-use and expire (default 120 s). Answers are stored
    as HMACs, never in plain text.
-   Every call is metered per key: request logs, daily roll-ups, monthly
    quota, per-minute rate limits.

## Run locally

Requirements: Python 3.11+, Node 18+, PostgreSQL 14+.

``` bash
# 1. Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # set DATABASE_URL and SECRET_KEY at minimum
# put risk_model.joblib in assets/models/ and anniesgrids.ttf in assets/fonts/
uvicorn app.main:app --reload --port 8000

# 2. Frontend (another terminal)
cd frontend
npm install
cp .env.example .env
npm run dev                   # http://localhost:5174 (proxies /api and /v1 to :8000)
```

Open http://localhost:5174, create an account, create a key with
`localhost` as an allowed domain, and follow the **Integration** page.

Tables are created automatically on startup. Your existing training
tables (`click_metrics`, `keyboard_metrics`, `mouse_metrics`,
`prediction_results`) are left untouched. The old `risk_scores` and
`captcha_challenges` tables are no longer used and can be dropped.

## Backend structure

``` text
backend/
├── app/
│   ├── main.py              app factory: middleware, error handlers, routers, start-up
│   ├── core/                settings, database, security, plans, error format
│   ├── models/              SQLAlchemy tables, one module per domain
│   │   ├── training.py        click/keyboard/mouse metrics + labels (your original schema)
│   │   ├── account.py         organisations, users, sessions, invites, notifications
│   │   ├── api_key.py         site key + hashed secret + CAPTCHA settings
│   │   ├── captcha.py         assessment (risk score) and issued challenge
│   │   └── metering.py        request events, daily usage, rate-limit windows
│   ├── schemas/             Pydantic request/response models
│   ├── services/            business logic, no HTTP
│   │   ├── captcha_renderer.py  static PNG + motion GIF
│   │   ├── risk_model.py        CatBoost + TabPFN scoring
│   │   ├── metering.py          events + daily roll-ups
│   │   ├── rate_limiter.py      Postgres fixed-window limiter
│   │   ├── usage_alerts.py      quota threshold alerts
│   │   ├── billing.py           Stripe checkout, portal, invoices, webhooks
│   │   └── …                    emailer, notifications, maintenance, training_data
│   ├── api/                 HTTP routes only; each package exposes a `router`
│   │   ├── deps.py              client info, roles, session auth
│   │   ├── v1/                  public CAPTCHA API  (/v1)
│   │   ├── dashboard/           dashboard API, one module per page  (/api)
│   │   ├── webhooks.py          Stripe  (/webhooks)
│   │   └── internal.py          training-data collection  (/internal)
│   └── static/widget.js     drop-in browser widget
├── ml/                      train.py, accuracy.py, resampling.py
├── assets/                  models/risk_model.joblib, fonts/anniesgrids.ttf  (not in git)
└── tests/                   pytest suite (real PostgreSQL)
```

Dependencies point one way: `api` → `services` → `models` → `core`.
Routes stay thin and call services; services never import from `api`.

## Tests

``` bash
cd backend
pip install -r requirements-dev.txt
createdb motion_captcha_test
TEST_DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/motion_captcha_test pytest
```

The suite drops and recreates every table in `TEST_DATABASE_URL`, so use
a throwaway database. It generates a stand-in risk model, so the real
`risk_model.joblib` isn't needed. 58 tests cover the CAPTCHA flow, keys,
metering, quota alerts, roles, password reset and Stripe webhooks.

## Training the model

Run the scripts as modules from `backend/` so they share the app's
settings and models:

``` bash
python -m ml.resampling     # synthetic rows from the 50 originals
python -m ml.accuracy       # 5-fold cross-validation
python -m ml.train          # writes assets/models/risk_model.joblib
```

## Production

-   **One origin for the frontend and its API.** The session cookie is
    HttpOnly + SameSite=Lax. Either set
    `DASHBOARD_DIST=../frontend/dist` so FastAPI serves the built
    frontend, or put both behind one reverse proxy (`/api`, `/v1`,
    `/webhooks` → backend; everything else → `dist/`).
-   Set `COOKIE_SECURE=true`, `APP_URL`, `PUBLIC_API_URL`, and
    `TRUST_PROXY=true` behind a load balancer.
-   Run several workers (`uvicorn app.main:app --workers 4` or
    gunicorn). Rate limits and quotas live in Postgres, so they hold
    across workers.
-   Configure SMTP for password resets, invites and usage alerts.
    Without it, emails are written to the server log.
-   For schema changes after launch, add Alembic. `create_all` only
    creates missing tables.

### Stripe

1.  Create two products in Stripe, **Pro** (\$29/mo) and **Business**
    (\$199/mo), and put their price IDs in `STRIPE_PRICE_PRO` /
    `STRIPE_PRICE_BUSINESS`.
2.  Turn on the **Customer portal** (Settings → Billing → Customer
    portal) with plan switching and cancellation.
3.  Add a webhook to `https://YOUR-API/webhooks/stripe` for
    `checkout.session.completed`, `customer.subscription.created`,
    `customer.subscription.updated`, `customer.subscription.deleted`,
    `invoice.payment_failed`. Put its signing secret in
    `STRIPE_WEBHOOK_SECRET`.

Plan limits (quota, requests/min, keys, members, log retention) are in
`backend/app/core/plans.py`.

## Public API

  -----------------------------------------------------------------------------------------------------------------------------------------------------
  Endpoint                            Auth                              Purpose
  ----------------------------------- --------------------------------- -------------------------------------------------------------------------------
  `POST /v1/assess`                   `X-Site-Key` header + allowed     Body: the behaviour metrics (`clicks`, `keyboard`, `mouse`). Returns
                                      `Origin`                          `{token, challenge_url, expires_in}`.

  `GET /v1/challenge/{token}`         token                             Returns PNG or GIF. Each call returns a new image (refresh), up to 5 per token.

  `POST /v1/verify`                   `Authorization: Bearer mc_sk_…`   Body `{token, answer, remote_ip?}`. Returns
                                                                        `{success, risk_score, challenge_type, hostname, challenge_ts, error_codes}`.

  `GET /v1/widget.js`                 ---                               Drop-in widget.

  `POST /internal/training-metrics`   `Bearer INTERNAL_API_TOKEN`       Stores labelled metrics for retraining (replaces the old open
                                                                        `/api/save-metrics`).
  -----------------------------------------------------------------------------------------------------------------------------------------------------

Full OpenAPI docs: `/docs`.

## Dashboard API

All under `/api`, authenticated by the session cookie: `auth/*`, `keys`,
`usage/timeseries`, `usage/by-key`, `quota`, `quota/alerts`,
`rate-limits`, `logs`, `notifications`, `team`, `settings`, `billing/*`.
Roles: owner, admin, developer, billing, viewer, enforced in
`app/api/deps.py`.

## Before launch

-   **Match the widget's behaviour metrics to your training data.**
    `backend/app/static/widget.js` measures time in milliseconds,
    distance in CSS pixels, velocity in px/ms and acceleration in
    px/ms². If the collector that produced your training data used
    different units or definitions, update `collectMetrics()` to match,
    or the risk scores will be meaningless.
-   The dynamic GIF is about 3 MB (312 frames). For high traffic,
    consider fewer frames (`NOISE_CYCLES`, `DRIFT_SPEED`) or serving it
    as WebP/MP4.
-   In the dynamic CAPTCHA the text layer stays still while the
    background moves, so pixels that are identical across a few frames
    reveal the text. Consider drifting the text layer too (in a
    different direction) so a frame diff doesn't expose it.
-   TabPFN inference on CPU can take hundreds of milliseconds or more
    per call. Benchmark `/v1/assess` with your real model, and consider
    a GPU or CatBoost-only scoring for the hot path.
