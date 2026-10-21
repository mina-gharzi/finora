# Finora — Operational Observability and Maintenance

This document covers running Finora in production: what signals the application
emits, how to monitor and alert on them, how to keep the rate-limit table
bounded, and how long to keep logs. It complements
[`production-deployment.md`](./production-deployment.md) (which covers
deployment) and [`database-backup.md`](./database-backup.md) (backup/restore).

Everything here is based on code that exists in this repository. Items that
require an external system (a scheduler, a log sink, an alerting service) are
marked as such — the application deliberately does **not** embed a scheduler,
monitoring agent, or log shipper.

---

## 1. Health check

- **Endpoint:** `GET /api/health`.
- **Contract:** `200 {"status":"ok"}` when the process is serving **and** a
  lightweight `SELECT 1` database round-trip succeeds; `503
  {"status":"unavailable"}` when the database is unreachable. The body carries no
  reason; the failure is recorded server-side as the structured event
  `health.database.unavailable`.
- **Caching:** responses set `Cache-Control: no-store, max-age=0`.
- **Safety:** unauthenticated (orchestrators probe it anonymously), cheap (a
  single `SELECT 1`, no table scan), and it exposes no user data or
  configuration.

**Use it as the readiness probe.** Point the load balancer / orchestrator's
readiness check at `/api/health`. Do not route traffic to an instance returning
`503`. There is intentionally no separate liveness endpoint: every meaningful
request needs the database, so one combined readiness probe is sufficient.

Health checks deliberately do **not** attempt to verify email delivery, rate-limit
writes, or migrations — those would add cost and coupling to a probe that must
stay fast and non-sensitive. Use the log events in §2 for those.

---

## 2. Structured logs, events, and alerting

Logs are single-line JSON written to `console` by `apps/web/src/lib/logger.ts`
(no third-party logging dependency). Each record has stable fields:

| Field | Meaning |
| --- | --- |
| `timestamp` | ISO-8601 UTC |
| `level` | `debug` \| `info` \| `warn` \| `error` |
| `event` | Stable, dot-separated code — **alert and grep on this** |
| `requestId` | Correlation id, when known (see §3) |
| … | A small, explicitly chosen metadata bag |

`LOG_LEVEL` sets the minimum severity (`debug` outside production, `info` in
production by default). Set it to `info` or higher in production to avoid debug
noise.

### Events to alert on

| Event | Level | Meaning | Suggested response |
| --- | --- | --- | --- |
| `health.database.unavailable` | error | The readiness probe's DB check failed | Page if sustained; check DB connectivity / `DATABASE_URL` / TLS |
| `email.delivery.failed` | error | A configured email provider rejected/failed a send | Investigate provider status, key validity, verified sender domain |
| `auth.verification.initial_email_failed` | error | The registration verification email threw unexpectedly | Investigate the email adapter; registration still succeeded |
| `auth.verification.initial_email_undelivered` | warn | Verification email could not be sent (adapter unavailable) | Expected when email is unconfigured; alert on a *sudden* rise |

The failure record for `email.delivery.failed` includes the adapter name and a
sanitized provider code (e.g. `rate_limit_exceeded`) — never the recipient, the
message, or any token.

> **Do not alert on message text.** Field names and message wording are not
> stable contracts; the `event` code is.

### Log retention and shipping (external)

- The app writes to `console` (stdout/stderr). **Collect those streams with your
  platform's log driver** (container logs, journald, a sidecar shipper, or a
  managed logging service). The application does not persist logs itself.
- **Retention is an external policy.** A common baseline is 30–90 days online
  with a longer cold archive; choose based on your compliance needs. Log lines
  contain no passwords, tokens, session cookies, full email addresses,
  connection strings, or full request bodies (see the redaction rules in
  [`../README.md`](../README.md) §"Structured logging"), so retention risk is
  limited to operational metadata.
- **Correlate by `requestId`** when investigating a single request (§3).

---

## 3. Request correlation

A correlation id ties together all log records for one request.

- Incoming `x-request-id` is honored when present and well-formed (URL-safe
  characters, ≤ 128 chars); otherwise a fresh id is generated
  (`apps/web/src/lib/request-id.ts`).
- **If your reverse proxy / load balancer generates or forwards a request id,
  pass it through as `x-request-id`** so app logs join proxy logs on the same id.
- The id is opaque — never used for routing or authorization — and is scrubbed
  before it reaches a log line.

---

## 4. Rate-limit store diagnostics

The persistent limiter (`apps/web/src/lib/persistent-rate-limit.ts`) is
database-backed and **fails closed**: if the store is unreachable, guarded auth
operations are denied with the generic "too many attempts" answer rather than
failing open.

- **Symptom of a store outage:** a spike of "too many attempts" responses across
  users, coinciding with database problems. The underlying store error surfaces
  through database logs and, if the DB is down, through
  `health.database.unavailable`.
- **Keys are hashed** (SHA-256 of `scope:identifier`); the table never stores a
  raw email, IP, token, or credential, so it is safe to inspect its size but it
  cannot be used to identify a user.

### Keeping the table bounded (scheduled sweep)

Expired rows are already removed opportunistically on the request path (at most
one indexed delete per `hit`, probability-gated). A **periodic full sweep** is
still recommended for workloads whose traffic is bursty or low.

- **Runnable entrypoint:**
  ```sh
  pnpm --filter @finora/web db:sweep
  ```
  This runs `apps/web/scripts/sweep-rate-limits.mjs`, a plain Node script (no
  build step, no extra dependency) that runs one indexed statement:
  `DELETE FROM rate_limit_counters WHERE expires_at < now()` — identical to
  `sweepAllExpired()` in the source — and prints only the number of rows
  removed. It reads `DATABASE_URL` from the environment (or `apps/web/.env`),
  **never prints credentials**, and exits non-zero on failure.
- **There is no in-app scheduler.** Schedule the command externally, e.g.:
  - cron: `17 3 * * *  cd /srv/finora && pnpm --filter @finora/web db:sweep`
  - a systemd timer, a Kubernetes `CronJob`, or your platform's scheduled-job
    feature.
- **Frequency:** once or a few times per day is plenty; the request-path cleanup
  handles steady state. Alert only if the command fails (non-zero exit).
- **Confirm it is bounded** by watching the table size:
  ```sql
  SELECT count(*) FROM rate_limit_counters;
  ```

Any external scheduler/shipper is **not** part of this application and must be
provided by the deployment environment.

---

## 5. Startup diagnostics

At production start-up (`apps/web/src/instrumentation.ts`):

- **Fail-fast validation** — a missing or too-short `SESSION_SECRET` (≥ 32
  chars) or a missing `DATABASE_URL` aborts boot with an error naming the
  variable (never its value). A boot failure is your first alert that
  configuration is incomplete.
- **Advisory email warning** — if `RESEND_API_KEY` and `EMAIL_FROM` are not both
  set, the server logs a warning naming the missing variables. The app still
  boots: public recovery endpoints answer with the generic "unavailable" message
  until email is configured. Treat this warning as a configuration gap to close,
  not a crash.

---

## 6. Gaps intentionally left to external systems

The following are **not** implemented in the application and must be provided by
the deployment environment:

- Log shipping, aggregation, indexing, and retention.
- Uptime/readiness monitoring and alert routing for `/api/health`.
- Scheduled invocation of `pnpm --filter @finora/web db:sweep`.
- Metrics/dashboards beyond the structured log stream (no metrics endpoint is
  exposed).
- Email delivery status confirmation (check the Resend dashboard — configuration
  is required but does not guarantee delivery).

---

## Related documents

- [`production-deployment.md`](./production-deployment.md) — deployment runbook.
- [`database-backup.md`](./database-backup.md) — backup and restore.
- [`../README.md`](../README.md) — health, logging, email and rate-limit details.
