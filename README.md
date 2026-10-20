# Finora

A Persian personal finance management application.

## Project structure

- `apps/web`: Web application built with Next.js, React, and TypeScript.
- `packages/shared`: Shared code and types, to be introduced when needed.
- Mobile application: Planned for a later phase.

## Package manager

pnpm

## Verification

All commands below are run from the repository root and cover both workspace
packages where applicable:

```sh
pnpm typecheck   # tsc --noEmit for apps/web and packages/shared
pnpm lint        # eslint for apps/web
pnpm test:unit   # Vitest (apps/web) + node:test (packages/shared)
pnpm build       # Next.js production build for apps/web
pnpm test        # unit tests, then the Playwright suite
```

`pnpm lint` only targets `apps/web`: `packages/shared` ships no ESLint config
or lint script. Unit tests never open a database connection — the DAL tests
mock `@/db`, so no container or `.env` file is needed for `pnpm test:unit`.

## Health check

`GET /api/health` is a lightweight, unauthenticated operational probe. It runs
a single `SELECT 1` through the existing lazy Drizzle connection and returns a
minimal JSON body. It never touches application tables, needs no session, and
exposes no user data or environment configuration.

| Status | Body                          | Meaning                                                                 |
| ------ | ----------------------------- | ----------------------------------------------------------------------- |
| `200`  | `{"status":"ok"}`             | The process is serving requests **and** the database round-trip succeeded (readiness). |
| `503`  | `{"status":"unavailable"}`    | The database check failed; the instance cannot serve data-dependent requests. |

Responses set `Cache-Control: no-store, max-age=0` so a health verdict is never
cached. On failure, the reason (driver message, SQL, connection string, stack)
stays server-side — only a structured error event is logged (see below). There
is intentionally no separate liveness endpoint: every meaningful request needs
the database, so one combined readiness probe is enough.

Verify locally, with the dev server running (`pnpm --filter @finora/web dev`):

```sh
curl -i http://127.0.0.1:3000/api/health        # 200 {"status":"ok"} with a healthy DB
```

## Structured logging

Server-side operational logging goes through one utility,
`apps/web/src/lib/logger.ts` (no third-party dependency — records are written
to `console`). Each call emits a single-line JSON object with a stable shape:

```json
{"timestamp":"2026-10-20T12:34:56.789Z","level":"error","event":"health.database.unavailable","requestId":"a1b2…"}
```

- `timestamp` — ISO-8601 UTC.
- `level` — `debug` | `info` | `warn` | `error`.
- `event` — a stable, dot-separated code (e.g. `email.delivery.failed`,
  `auth.verification.initial_email_failed`). **Use it to alert and grep**;
  field names and message text are not stable contracts.
- `requestId` — present when a correlation id is available. Incoming
  `x-request-id` is honoured when well-formed; otherwise a fresh id is
  generated (`src/lib/request-id.ts`).
- additional keys — a small, explicitly chosen metadata bag.

Levels are filtered by `LOG_LEVEL` (default `debug` in development, `info` in
production); see `apps/web/.env.example`.

**Fields intentionally excluded from logs.** Callers pass an event name and
chosen metadata — never whole request objects, headers, cookies, database rows
or exceptions. The logger additionally drops any key whose name contains
`password`, `secret`, `token`, `cookie`, `authorization`, `session`, `jwt`,
`apiKey`, `credential`, etc., and scrubs string values for URL query strings,
JWTs, `Bearer`/`Basic` credentials, email addresses and long opaque tokens.
`Error` values are reduced to `{ name, code?, message? }` (message scrubbed);
**stack traces and `cause` chains are never logged**. As a result none of the
following ever reach a log line: passwords or password hashes, session cookies,
authorization headers, JWTs or raw tokens, password-reset/verification links
or their token values, API keys or database credentials, full request bodies,
or financial records and transaction descriptions.

Current integration points (deliberately few, to avoid duplicate logging):

- `health.database.unavailable` — the health probe's database check failed.
- `email.delivery.failed` — a configured email provider failed mid-send
  (includes the sanitized provider code; never the recipient or key).
- `auth.verification.initial_email_undelivered` / `_failed` — best-effort
  registration verification email could not be sent (registration still
  succeeds; the in-app resend is the retry path).

Expected validation failures (bad form input, wrong password, expired token)
are **not** logged as server errors — they are normal, user-facing outcomes.

## Email delivery (Resend)

Email verification and password recovery are delivered through
[Resend](https://resend.com) in production. Three server-only variables (see
`apps/web/.env.example`) control it:

- `RESEND_API_KEY` — API key from the Resend dashboard. Read only in
  `apps/web/src/lib/email/adapter.ts` (a `server-only` module); never expose
  it via `NEXT_PUBLIC_*` or client code.
- `EMAIL_FROM` — verified sender, e.g. `"Finora <no-reply@example.com>"`.
  The sending domain must be verified in Resend (DNS records). A valid API
  key alone does not deliver mail. On Resend's free tier, the built-in
  `onboarding@resend.dev` test sender only delivers to your own account
  address until your domain is verified.
- `EMAIL_PROVIDER` — development-only opt-in flag; the value `resend` is the
  only recognised value.

Behaviour by environment:

- **Production with both variables:** sends through the Resend adapter — the
  only production adapter. `EMAIL_PROVIDER` is ignored in production.
- **Production with either missing:** every send fails closed with the same
  generic, enumeration-safe "service unavailable" answer (no console or
  file-outbox fallback), and the server logs a startup warning naming the
  missing variables.
- **Local development (default):** never sends real email — messages go to
  the console (or to `EMAIL_OUTBOX_DIR` as JSON files when set), even if the
  Resend variables happen to be present.
- **Local development (manual delivery testing):** set
  `EMAIL_PROVIDER=resend` **together with both Resend variables in
  `apps/web/.env.development.local`** (gitignored; loaded only by `next dev`,
  never by `next start` or any test suite):

  ```dotenv
  RESEND_API_KEY=re_replace_me
  EMAIL_FROM="Finora <no-reply@example.com>"
  EMAIL_PROVIDER=resend
  ```

  With the flag set and configuration complete, `next dev` selects the real
  Resend adapter; an unknown flag value or partial configuration falls back
  to the console/outbox default.

Manual local testing and automated tests are deliberately separate: unit
tests mock the provider, and the Playwright suite forces `RESEND_API_KEY`,
`EMAIL_FROM` and `EMAIL_PROVIDER` to empty strings for the server it spawns,
so automated runs can never send real email. Manual testing from
`next dev` is the only path a real message leaves your machine.

Configuration is required but not sufficient for delivery: the key must be
valid, the sender verified, and the provider reachable. Actual delivery must
be confirmed with real credentials — it is never implied by configuration
alone; check the Resend dashboard (Emails) for the true status of each send.

## End-to-end tests

`pnpm test:e2e` builds the app and runs Playwright against it. It needs more
than the unit tests do:

1. `apps/web/.env` created from `apps/web/.env.example` (contains `POSTGRES_*`
   and `SESSION_SECRET`; never committed).
2. The PostgreSQL container up and migrated:

   ```sh
   docker compose --env-file apps/web/.env up -d
   pnpm --filter @finora/web db:migrate
   ```

3. A production build (`pnpm test:e2e` builds first; running
   `pnpm --filter @finora/web test:e2e` alone assumes `.next/` already exists).
4. Playwright's browser binary: `pnpm --filter @finora/web exec playwright install chromium`.
5. Port `3000` free — Playwright starts `pnpm start` itself and waits for
   `http://127.0.0.1:3000`. **Stop any locally running server first** (both
   `next dev` and `pnpm start`): Playwright reuses an already-listening server
   untouched (`reuseExistingServer`), and a reused process keeps whatever
   environment it was started with — including a real `RESEND_API_KEY`. The
   protective email overrides only apply to a server Playwright spawns itself.
   E2E runs always have email delivery disabled (empty `RESEND_API_KEY`,
   `EMAIL_FROM` and `EMAIL_PROVIDER` for the spawned server), so the suite can
   never send real email.

E2E tests are not part of `.github/workflows/ci.yml`, because CI has no
database container or secrets.

## Rate limiting

Abuse-sensitive authentication operations (login, registration, password
recovery, email verification resend, email change) are protected by a
**persistent, database-backed fixed-window limiter**, so limits hold across
every process and instance that shares the database — not just within one
server process.

- **Storage.** Counters live in the `rate_limit_counters` table (migration
  `0004_optimal_madripoor.sql`). Every key is the SHA-256 digest of
  `scope:identifier`; only the digest is stored, never a raw email, IP, token,
  or credential. Apply it like any other migration:
  `pnpm --filter @finora/web db:migrate`.
- **Counting.** Counts are per scope. Login counts **only failed attempts**
  (a successful sign-in clears the account counter); registration, recovery,
  resend, and email-change count **every** attempt. An account-scope check and
  an IP-scope check are independent, so exhausting one does not affect the
  other.
- **Concurrency.** Each event is a single atomic
  `INSERT … ON CONFLICT … DO UPDATE`, so concurrent requests cannot race past
  the limit. Fixed windows can allow a burst at a window boundary; that
  trade-off is accepted here.
- **Cleanup.** Expired rows are removed opportunistically (one indexed delete
  per `hit`, probability-gated) plus an on-demand `sweepAllExpired()` for a
  scheduled job. Retention stays bounded without a scan on the request path.
- **Store outage = fail closed.** If the database is unreachable, every
  guarded operation is denied with the generic "too many attempts" message —
  an auth endpoint never fails open.

### Trusted proxy and client IP

Per-IP limits need the client's real address, which is only trustworthy when
the request passes through known proxies. The `TRUSTED_PROXY_HOPS` environment
variable (default `0`) declares how many trusted proxies append to
`x-forwarded-for`; the limiter takes the Nth entry from the right and ignores
everything to its left (spoofable). With the default of `0` **no forwarding
header is trusted**: every caller collapses to one `unknown` bucket, so per-IP
limits still apply as a coarse backstop and header spoofing cannot evade the
per-account/per-user limits. Set it to the real hop count in production (e.g.
`1` behind a single load balancer). See `apps/web/src/lib/client-ip.ts`.

## Local database

Finora uses a local PostgreSQL container for development.

```sh
docker compose --env-file apps/web/.env up -d
```

The database is published on the loopback interface only (`127.0.0.1:15432`),
so it is never reachable from the local network or the internet. Do not change
this to `15432:5432` or `0.0.0.0:15432:5432`.

Configuration lives in `apps/web/.env` (gitignored); copy
`apps/web/.env.example` to create it. Only the `POSTGRES_*` variables are
passed into the container.

Data is stored in the external Docker volume `finora_pgdata`. The compose file
references it as external on purpose, so it is never created or deleted by
`docker compose`.

Other useful commands:

```sh
docker compose --env-file apps/web/.env stop   # stop, keep data
docker compose --env-file apps/web/.env ps     # health and port binding
pnpm --filter @finora/web db:migrate           # apply migrations
```
