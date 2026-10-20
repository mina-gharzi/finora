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
