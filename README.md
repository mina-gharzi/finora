# Finora

A Persian personal finance management application.

## Project structure

- `apps/web`: Web application built with Next.js, React, and TypeScript.
- `packages/shared`: Shared code and types, to be introduced when needed.
- Mobile application: Planned for a later phase.

## Package manager

pnpm

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
