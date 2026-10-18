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
   `http://127.0.0.1:3000`.

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
