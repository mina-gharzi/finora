# Finora — Production Deployment Runbook

This runbook describes how to build, configure, migrate, start, verify, and roll
back a **self-hosted production deployment** of Finora (`apps/web`). It is
written against the code and scripts that actually exist in this repository and
does not assume a specific hosting vendor.

> **Scope note.** Everything here is either verified against the local
> repository (marked **Verified locally**) or explicitly requires production
> access and real credentials (**Requires production access**). This document
> was authored without contacting any production service, so items marked
> "Requires production access" have **not** been executed or confirmed here.

---

## 1. Prerequisites

| Item | Version / requirement | Source |
| --- | --- | --- |
| Node.js | **24.x** (CI and current development use Node 24) | `.github/workflows/ci.yml` (`node-version: 24`) |
| pnpm | **12.6.0** | `packageManager` in root & `apps/web` `package.json` |
| PostgreSQL | **16** (image `postgres:16-alpine`) | `docker-compose.yml` |
| Resend account | Optional to boot, required to deliver email | `apps/web/src/lib/email/adapter.ts` |
| Reverse proxy / TLS | Required in production (HTTPS) | §9 |

There is no committed `.nvmrc` or `engines` field; use Node 24 to match CI.
Workspace layout: `apps/web` (Next.js app) and `packages/shared` (shared code).
The package manager is **pnpm**; do not use npm/yarn.

**Verified locally.** Local development runs Node `v24.21.0` and pnpm `12.6.0`
against `postgres:16-alpine`.

---

## 2. Required environment variables

All values are read by server-side code only. There is **no** `NEXT_PUBLIC_*`
variable anywhere in the codebase, so no secret is bundled into client
JavaScript.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | **Yes** | Postgres connection string used by the app and by `drizzle-kit` migrations. Required; the server fails to boot in production if unset. |
| `SESSION_SECRET` | **Yes** | HMAC key signing the JWT session cookie (HS256). **Must be ≥ 32 characters.** Required; the server fails to boot in production if unset or too short. |
| `RESEND_API_KEY` | Yes for email | Resend API key (`re_...`). Read only by `src/lib/email/adapter.ts`. |
| `EMAIL_FROM` | Yes for email | Verified sender, e.g. `"Finora <no-reply@example.com>"`. |
| `APP_URL` | Recommended | Public origin (scheme + host, no trailing slash) used for absolute links in emails, e.g. `https://finora.example.com`. Defaults to `http://127.0.0.1:3000` when unset. |
| `TRUSTED_PROXY_HOPS` | Recommended | Number of trusted proxies appending to `x-forwarded-for`. Default `0` = trust nothing. See §9. |
| `LOG_LEVEL` | Optional | `debug` \| `info` \| `warn` \| `error`. Defaults to `info` in production. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Only for local Docker | Consumed by `docker-compose.yml` for the local container. **Not** needed by the app in production. |
| `EMAIL_OUTBOX_DIR` / `EMAIL_PROVIDER` | Development only | Never used in production. |

The canonical list with comments lives in `apps/web/.env.example`. **Never put
real values in `.env.example`** (it is committed); real values belong only in
your platform's secret store or an untracked `.env` file.

**Verified locally.** `apps/web/src/instrumentation.ts` enforces `DATABASE_URL`
and `SESSION_SECRET` (length ≥ 32) at production startup; `src/lib/env.ts`
validates `APP_URL` as an absolute http(s) URL.

---

## 3. Secret generation and storage

Generate a strong session secret (32+ random bytes, base64):

- **PowerShell (Windows):**
  ```powershell
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  [Convert]::ToBase64String($bytes)
  ```
- **OpenSSL / any shell with openssl:**
  ```sh
  openssl rand -base64 32
  ```

Storage guidance:

- Keep secrets in the hosting platform's secret manager (or a runtime-injected
  environment), **not** in the repository. `.env*` files are gitignored
  (`.gitignore`), with `.env.example` re-allowed as a placeholder.
- Use a **distinct** `SESSION_SECRET` per environment. Rotating it invalidates
  all existing sessions (acceptable; users simply sign in again).
- Never log or print secret values. The app's logger
  (`apps/web/src/lib/logger.ts`) drops sensitive keys and scrubs token-like
  strings, but do not rely on that as your only control.
- Restrict who can read production secrets and rotate `RESEND_API_KEY` if it may
  have leaked.

**Verified locally.** `.gitignore` ignores `.env` and `.env.*` but keeps
`.env.example`.

---

## 4. PostgreSQL provisioning

### 4.1 Database and least-privilege role

Create a dedicated database and an application role that owns **only** that
database's objects — do not deploy as the Postgres superuser. Run as an admin:

```sql
CREATE ROLE finora_app LOGIN PASSWORD '<strong-random-password>';
CREATE DATABASE finora OWNER finora_app;
```

The application connects with `finora_app`. Migrations (`drizzle-kit migrate`)
run with the same credentials, so the role must be able to create/alter tables,
indexes and constraints in its own database (the `OWNER` role above can).
Least-privilege points:

- One database per environment (staging and production must not share a DB).
- Grant no access to other databases.
- Prefer a role scoped to this app; avoid the `postgres` superuser.

### 4.2 Connection string and TLS

`DATABASE_URL` has the form:

```
postgres://<user>:<password>@<host>:5432/<database>?sslmode=require
```

- Use `sslmode=require` (or stricter) whenever the app and database are not on
  the same trusted host. Managed providers often require TLS.
- URL-encode characters that are special in a URI (e.g. `@`, `:`, `/` in the
  password).
- Keep the connection private (VPC/private network) where possible.

### 4.3 Local container (development reference only)

```sh
docker compose --env-file apps/web/.env up -d
```

The local container publishes Postgres on **loopback only** (`127.0.0.1:15432`).
Do not reuse this compose file as a production database: it pins a dev password
and exposes a fixed local port.

**Requires production access.** Actual provisioning, role creation and TLS were
not performed or verified in this stage.

---

## 5. Backup before schema changes

**Always take and verify a backup immediately before applying migrations to a
production database.** Full procedure, safety rules and restore-in-a-separate-
environment steps live in [`database-backup.md`](./database-backup.md).

Minimum safe sequence (production runs Postgres 16; use matching `pg_dump`/
`pg_restore` client versions):

1. Create a custom-format dump and copy it off the database host:
   ```sh
   pg_dump --format=custom --no-owner --file=finora-$(date +%Y%m%d-%H%M%S).dump "$DATABASE_URL"
   ```
2. Verify the dump is readable before migrating:
   ```sh
   pg_restore --list finora-YYYYMMDD-HHMMSS.dump
   ```
3. Store the dump somewhere durable and access-controlled (outside the DB host).

**Verified locally.** The documented dump + `pg_restore --list` validation and an
isolated restore into a throwaway database (schema, data and migration state all
matched) were executed against the local development database. See
[`database-backup.md`](./database-backup.md) for the exact commands, including the
required `docker exec` form (no host `pg_dump`/`pg_restore` are installed).

**Requires production access.** No production backup was taken in this stage.

---

## 6. Migration workflow (migrations 0000–0006)

Migrations live in `apps/web/src/db/migrations` and are tracked in
`meta/_journal.json`. The current set is:

| # | File | Applies |
| --- | --- | --- |
| 0000 | `0000_magical_ghost_rider.sql` | `users` |
| 0001 | `0001_financial_domain.sql` | `accounts`, `categories`, `transactions` |
| 0002 | `0002_lean_shiva.sql` | `auth_tokens`; adds `users.email_verified_at` |
| 0003 | `0003_broad_beyonder.sql` | extends `auth_tokens` for `email_change` |
| 0004 | `0004_optimal_madripoor.sql` | `rate_limit_counters` + expiry index |
| 0005 | `0005_neat_pyro.sql` | `budgets` |
| 0006 | `0006_lying_zeigeist.sql` | composite `transactions` index (replaces two single-column indexes) |

Apply them with the project's own script (uses `drizzle-kit migrate`, reading
`DATABASE_URL` from the environment / `.env`):

```sh
pnpm --filter @finora/web db:migrate
```

Rules:

- **Forward only.** Never edit an already-applied migration file; `drizzle-kit`
  records applied migrations and a changed file causes divergence. To change
  schema, add a new migration via `pnpm --filter @finora/web db:generate`.
- Migrations are **not** automatically run at app startup — run them as a
  deliberate deployment step **before** starting the new app version.
- Verify with a schema check after migrating:
  ```sh
  pnpm --filter @finora/web db:generate   # expect "No schema changes"
  ```
- If `db:generate` reports changes after deploying, the applied schema and the
  code's `schema.ts` disagree — stop and investigate.
- **A skipped migration breaks authentication, not just one table.** The
  rate-limit store lives in the database, so a database without the
  `rate_limit_counters` table makes every rate-limit query fail; the limiter
  then fails **closed** and answers every login and registration with "too many
  attempts" — an outage that looks exactly like an abuse wave. After migrating,
  confirm the deployed instance with `GET /api/health`: it returns `200` only
  when the database answers **and** the rate-limit table exists; `503` with the
  `health.schema.incomplete` log event means the migrations are missing on the
  database that instance is actually using.

**Verified locally.** `pnpm --filter @finora/web db:generate` reports
"No schema changes" against the migrated local database, and the journal lists
entries `0000`–`0006`.

---

## 7. Build and start

Scripts (from `package.json`):

| Command | Effect |
| --- | --- |
| `pnpm install --frozen-lockfile` | Reproducible install from `pnpm-lock.yaml` |
| `pnpm build` | `next build` for `apps/web` (no secrets required; env validation is skipped during build) |
| `pnpm --filter @finora/web start` | `next start` — serves the production build |

Standard sequence:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build
pnpm --filter @finora/web db:migrate
pnpm --filter @finora/web start
```

Notes:

- Set `NODE_ENV=production` in the runtime environment. This activates
  fail-fast env validation (missing/weak `SESSION_SECRET`, missing
  `DATABASE_URL` → immediate boot failure), `secure` session cookies, and the
  `Strict-Transport-Security` header (`apps/web/next.config.ts`).
- Run the app behind the reverse proxy in §9; the app itself listens on
  `127.0.0.1:3000` by default (Next.js default port 3000).
- Do **not** run `next dev` in production.

### Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request in two jobs:

| Job | What it proves |
| --- | --- |
| `verify` | Typecheck, lint, unit tests and the production build are green. No database and no secrets are needed — the unit tests mock the database module and `next build` does not open a connection. |
| `e2e` | The full Playwright suite passes against a throwaway PostgreSQL service **with the migrations applied**. It is the only job that exercises the real persistent rate-limit store. |

The `e2e` job is the one that catches the failure mode described in §6: if a
migration is missing, the rate-limit queries fail, the limiter fails closed and
every login is answered with "too many attempts" — a production outage that no
mocked unit test can see. It applies the same migrations the deployment does,
so a migration that cannot be applied fails CI before it reaches production.
Failures upload the Playwright trace as a CI artifact.

**Verified locally.** `pnpm build` compiles successfully with no secrets set
(exit 0); `next start` serves the built app.

---

## 8. Resend sender/domain setup and email smoke test

Finora uses [Resend](https://resend.com) as its **only** production email
adapter (`apps/web/src/lib/email/adapter.ts`).

Setup:

1. Create a Resend account and API key (`RESEND_API_KEY`).
2. **Verify the sending domain** in Resend by adding the DNS records Resend
   shows (SPF/DKIM). A valid API key alone does **not** deliver mail.
3. Set `EMAIL_FROM` to an address on that verified domain, e.g.
   `"Finora <no-reply@finora.example.com>"`.
4. Set both variables in the production environment. With **either** missing,
   every send fails closed with a generic "service unavailable" answer, and the
   server logs a startup warning naming the missing variables (never values).

Smoke test (safe, low-volume — do **not** blast real addresses):

- Trigger one real flow against production, e.g. register a throwaway account
  you control or use "forgot password", and confirm the message arrives and the
  link works.
- Check the **Resend dashboard → Emails** for the true per-send status. A
  `200` from the app means the request was accepted, not that the message was
  delivered.
- Resend free-tier caveat: the built-in `onboarding@resend.dev` sender only
  delivers to your own account address until your domain is verified.

**Requires production access.** No real email was sent in this stage; domain
verification and delivery are unverified here.

---

## 9. Reverse proxy, TLS, cookies and HSTS

- **TLS is required.** Terminate HTTPS at a reverse proxy / load balancer in
  front of the app. In production the session cookie is set `secure`, so it is
  only sent over HTTPS; serving the app over plain HTTP will break login.
- **Security headers** (`apps/web/next.config.ts`): `nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy`, and — in a production build only —
  `Strict-Transport-Security: max-age=31536000`. HSTS assumes HTTPS is
  available on all subdomains you serve; the deployment's subdomain topology is
  not defined in this repo.
- **No CSP is set** by the app; add one at the proxy only after validating it
  against the real origin (Next.js emits inline bootstrap scripts).

### Client IP and `TRUSTED_PROXY_HOPS`

Per-IP rate limits need the real client address. `apps/web/src/lib/client-ip.ts`
trusts `x-forwarded-for` **only** when `TRUSTED_PROXY_HOPS ≥ 1`, then takes the
Nth value from the right (values to its left are attacker-controlled).

- Default `0`: no header is trusted; every caller shares one `unknown` bucket.
  Per-IP limits still apply as a coarse backstop, and header spoofing cannot
  evade the per-account/per-user limits.
- Behind **one** proxy (typical) set `TRUSTED_PROXY_HOPS=1`. On Vercel the
  platform itself is that proxy, so `1` is the correct value.
- Make sure the proxy **sets/appends** `x-forwarded-for` (or `x-real-ip` with
  exactly one hop) and does not let clients inject it directly.
- A production server that starts with fewer than one trusted hop logs a
  startup warning naming `TRUSTED_PROXY_HOPS`. Treat it as a misconfiguration:
  the symptom is that *every* visitor shares one bucket, so the per-IP limits
  (20 registrations per hour, 20 failed logins per 15 minutes) apply to the
  whole site at once.

Per-account and per-user limits are independent of this value, so a
misconfigured hop count degrades the IP backstop but not the primary limits.

**Verified locally.** Header/cookie logic, `secure` flag, and HSTS emission are
verified by unit tests and code; proxy-level TLS behavior is not.

---

## 10. Post-deployment smoke tests

Run these against the deployed origin after migrations and start-up. All require
production access.

| # | Check | Expected |
| --- | --- | --- |
| 1 | `GET /api/health` | `200 {"status":"ok"}` with `Cache-Control: no-store` |
| 2 | Register a new account | Lands on the authenticated dashboard |
| 3 | Email verification | Verification email arrives; link verifies the account |
| 4 | Log out, then log back in | Same credentials succeed; session cookie set |
| 5 | Create a transaction (verified account) | Transaction persists and appears in the list |
| 6 | Password recovery | Reset email arrives; link sets a new password |
| 7 | Change password (signed in) | Old password rejected; new password works; session ended |
| 8 | Rate limiting | Repeated failed logins eventually return the "too many attempts" message |
| 9 | Email adapter healthy | No startup "email delivery is not configured" warning in logs |

PowerShell example for check 1:

```powershell
Invoke-WebRequest -Uri "https://finora.example.com/api/health" -UseBasicParsing | Select-Object StatusCode, Content
```

**Requires production access.** None of these were executed in this stage.

---

## 11. Health, logging and monitoring

- **Health probe:** `GET /api/health` → `200 {"status":"ok"}` when the process is
  serving **and** a `SELECT 1` succeeds **and** the rate-limit table exists;
  `503 {"status":"unavailable"}` otherwise. It is unauthenticated, sets
  `Cache-Control: no-store`, and never leaks driver/SQL/credential detail.
  Point your load balancer / orchestrator readiness check here. There is no
  separate liveness endpoint by design.
- **Structured logs:** single-line JSON to `console` via
  `apps/web/src/lib/logger.ts`. Stable fields: `timestamp`, `level`, `event`
  (dot-separated code), optional `requestId`, plus a small metadata bag.
  **Alert on `event`, not on message text.** Notable events:
  `health.database.unavailable`, `health.schema.incomplete`,
  `rate_limit.store_unavailable`, `db.pool.error`, `email.delivery.failed`,
  `auth.verification.initial_email_undelivered` / `_failed`.
- **Redaction:** the logger drops keys containing `password`, `secret`, `token`,
  `cookie`, `authorization`, `session`, `jwt`, `apikey`, etc., and scrubs URL
  query strings, JWTs, `Bearer`/`Basic` values, emails and long tokens. Stack
  traces and `cause` chains are never logged.
- **`LOG_LEVEL`** filters records (default `info` in production).

> For the full operational picture — alert thresholds per event, log shipping
> and retention, request-id propagation from your proxy, the scheduled
> rate-limit sweep (`pnpm --filter @finora/web db:sweep`), and what is
> intentionally left to external systems — see
> [`operations.md`](./operations.md).

### Common failure diagnosis

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Server exits at boot with a validation error | Missing/short `SESSION_SECRET`, or missing `DATABASE_URL` | Set both; secret ≥ 32 chars |
| `/api/health` returns 503 | DB unreachable / bad `DATABASE_URL` / TLS failure | Check `health.database.unavailable` log, connectivity, `sslmode` |
| `/api/health` returns 503 but the DB is reachable | Migrations were never applied to that database | Check `health.schema.incomplete`; apply the migrations (§6) and redeploy |
| Every login and registration answers "too many attempts" | The rate-limit store is unreachable or its table is missing — the limiter fails closed | Check `rate_limit.store_unavailable` and its `causeCode`; `42P01` = migrations missing, `28P01` = wrong password |
| Users stay logged out / login loops | Serving over HTTP (cookie is `secure`) or wrong `APP_URL` | Terminate TLS; correct `APP_URL` |
| Emails never arrive; app shows "unavailable" | Missing `RESEND_API_KEY`/`EMAIL_FROM`, or unverified domain | Complete §8; check Resend dashboard |
| Every caller shares one rate-limit bucket | `TRUSTED_PROXY_HOPS` unset/0 behind a proxy | Set to the real hop count (§9) |
| Migrations refuse to run | `drizzle-kit` sees drift in an applied file | Do not edit applied migrations; add a new one |

---

## 12. Rollback strategy

### Application rollback (preferred)

Keep the previous build artifact / container image. To roll back:

1. Stop the new version.
2. Redeploy the **previous** build (same `NODE_ENV=production`, same secrets).
3. Point the load balancer back to the healthy instances.
4. Re-run the smoke tests in §10.

Application code and schema are versioned separately, so a code rollback is
safe as long as the **newer** migration is backward-compatible with the older
code. All current migrations 0000–0006 are additive except 0006, which only
swaps indexes (no data change), so older code still runs against the 0006
schema.

### Database rollback (limited)

- **Do not blindly reverse applied migrations.** `drizzle-kit` has no
  `down`/rollback step here; there is no committed reversal for any migration.
  Manually dropping tables/columns can destroy data.
- If a migration itself is the problem, restore from the **verified backup**
  taken in §5 into a **separate** environment first to validate, then perform a
  controlled restore. See [`database-backup.md`](./database-backup.md); never
  run `--clean` against a live database.
- Prefer a **forward fix**: deploy a new migration that corrects the issue,
  which keeps the append-only, auditable migration history intact.

### Migrations are the irreversible part

Code deploys are easily reversed; data/schema changes are not. Because of this,
**always back up and verify before migrating** (§5) and prefer additive,
backward-compatible schema changes.

---

## 13. Verified-locally vs requires-production-access

**Verified locally (this stage):**

- Every command and script name in §7 against `package.json`.
- Migration files `0000`–`0006` and the `db:migrate` / `db:generate` commands;
  `db:generate` reports "No schema changes".
- Production env validation and email-config warning behavior
  (`instrumentation.ts`, `env.ts`) via the code and unit tests.
- Health probe contract, logger redaction, rate-limit behavior, and
  `TRUSTED_PROXY_HOPS` resolution.
- `pnpm build` succeeds with no secrets set.

**Requires production access (not executed or confirmed here):**

- Provisioning Postgres, creating the least-privilege role, and enforcing TLS.
- Taking and verifying a production backup.
- Applying migrations 0000–0006 to a real production database.
- Resend domain verification and actual email delivery.
- Reverse-proxy/TLS configuration and live-HSTS behavior.
- All post-deployment smoke tests in §10.

---

## Related documents

- [`../README.md`](../README.md) — project overview, local development, logging,
  email, rate limiting, local database.
- [`../apps/web/README.md`](../apps/web/README.md) — app-level development,
  testing and build commands.
- [`database-backup.md`](./database-backup.md) — backup and restore procedure.
- [`operations.md`](./operations.md) — observability, monitoring/alerting, log
  retention and scheduled rate-limit sweep.
- [`../apps/web/.env.example`](../apps/web/.env.example) — environment template.
