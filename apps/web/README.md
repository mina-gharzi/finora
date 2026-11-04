# @finora/web

The Finora web application: a Persian personal-finance manager built with
Next.js (App Router), React, TypeScript, Drizzle ORM and PostgreSQL.

For the full project overview — architecture, logging, email delivery, rate
limiting and the local database — see the [root README](../../README.md). For
production deployment, see
[docs/production-deployment.md](../../docs/production-deployment.md).

## Requirements

- Node.js 24.x (matches CI)
- pnpm 12.6.0 (the workspace package manager)
- PostgreSQL 16 — for local development the Docker container described below

## Scripts

Run these from this directory, or prefix with `pnpm --filter @finora/web` from
the repository root.

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `next dev` | Development server on `http://127.0.0.1:3000` |
| `build` | `next build` | Production build (no secrets needed) |
| `start` | `next start` | Serve the production build |
| `lint` | `eslint` | Lint the app |
| `typecheck` | `tsc --noEmit` | Type-check without emitting |
| `test:unit` | `vitest run` | Unit tests (no database connection needed) |
| `test:e2e` | `playwright test` | End-to-end tests (requires a built app + DB) |
| `db:generate` | `drizzle-kit generate` | Create a new migration from `src/db/schema.ts` |
| `db:migrate` | `drizzle-kit migrate` | Apply pending migrations to `DATABASE_URL` |

## Local development

1. Install dependencies from the repository root:
   ```sh
   pnpm install
   ```
2. Create the environment file and fill in values:
   ```sh
   Copy-Item .env.example .env   # PowerShell
   ```
   At minimum set `DATABASE_URL` and `SESSION_SECRET` (≥ 32 characters). See
   [.env.example](./.env.example) for every variable and its meaning.
3. Start the local PostgreSQL container (from the repository root):
   ```sh
   docker compose --env-file apps/web/.env up -d
   ```
4. Apply migrations:
   ```sh
   pnpm db:migrate
   ```
5. Start the dev server:
   ```sh
   pnpm dev
   ```

The database is published on the loopback interface only (`127.0.0.1:15432`).

## Testing

Unit tests never open a database connection (the data-access tests mock the DB
module), so no container or `.env` file is required for them:

```sh
pnpm test:unit
```

### Running e2e

The suite requires a dedicated database and never falls back to `DATABASE_URL`.

1. Start a local Postgres (the dev container works).
2. Apply migrations to that database: `DATABASE_URL=<e2e-url> pnpm db:migrate`.
3. Export `E2E_DATABASE_URL=<e2e-url>`.
4. Install Chromium once: `pnpm --filter @finora/web exec playwright install chromium`.
5. Run `pnpm build`, then `pnpm test:e2e`. Stop any server on port 3000 first; Playwright starts its own.

## Build

```sh
pnpm build
pnpm start
```

Environment validation (missing/weak `SESSION_SECRET`, missing `DATABASE_URL`)
runs only when a production server starts serving traffic, so `next build`
succeeds without secrets.

## Database migrations

Migrations live in `src/db/migrations` and are tracked in
`src/db/migrations/meta/_journal.json`. Never edit an applied migration; create
a new one instead:

```sh
pnpm db:generate   # after editing src/db/schema.ts
pnpm db:migrate    # apply
```

`db:generate` prints "No schema changes" when the schema and the applied
migrations agree.
