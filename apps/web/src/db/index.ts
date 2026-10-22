import "server-only";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import * as schema from "./schema";

/**
 * Lazy, singleton Postgres pool. The connection is created on first query (so
 * builds and static analysis never open one) and cached on `globalThis` so it
 * survives module reloads during development.
 *
 * SERVERLESS POOL SIZING
 * ----------------------
 * On Vercel every server instance builds its OWN pool, so `max` multiplies by
 * the number of concurrent instances. A generous `max` therefore eats the
 * database's connection budget (managed providers cap it), and the resulting
 * "too many clients" failure makes EVERY rate-limit query fail — which fails
 * the limiter closed and turns a database problem into a "too many attempts"
 * message for every user. Two connections per instance is plenty for the app's
 * short queries and keeps one instance's share of the budget small.
 *
 * The timeouts matter for the same reason: an unreachable host must fail fast
 * (so the request is denied and logged) instead of holding the function until
 * the platform kills it. `idleTimeoutMillis` returns idle connections to the
 * database instead of letting the provider drop them from under us, and the
 * pool `error` listener keeps an idle-client failure from surfacing as an
 * unhandled event — which would take the whole process down.
 */
const globalForDb = globalThis as unknown as { finoraPool?: Pool };

function getPool(): Pool {
  if (!globalForDb.finoraPool) {
    const pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 2,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", (error: Error) => {
      logger.error("db.pool.error", { error });
    });
    globalForDb.finoraPool = pool;
  }
  return globalForDb.finoraPool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

/**
 * Lightweight connectivity probe for the health endpoint: runs `SELECT 1`,
 * which touches no application table, scans no rows and returns immediately.
 * Uses the same lazy singleton pool as every other query, so a successful
 * result means the pool can actually reach Postgres — not merely that a
 * connection string is configured.
 *
 * Resolves `true` on success and `false` on ANY failure (connection refused,
 * auth failure, timeout). The error is intentionally not surfaced: the health
 * caller must never receive a driver message, SQL text or connection detail.
 */
export async function checkDatabaseConnectivity(): Promise<boolean> {
  try {
    await getDb().execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

/** Normalizes the two shapes a driver result can arrive in (rows / array). */
function extractRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    return result as Array<Record<string, unknown>>;
  }
  if (result && typeof result === "object") {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) {
      return rows as Array<Record<string, unknown>>;
    }
  }
  return [];
}

/**
 * Readiness probe for the rate-limit store's table.
 *
 * `SELECT 1` proves the DATABASE is reachable, but not that its SCHEMA is
 * applied. A deployment whose migrations were never run answers every
 * rate-limit query with `42P01` (undefined table): the limiter then fails
 * closed, so every login and registration is answered with the generic "too
 * many attempts" message — while a `SELECT 1` probe still reports the database
 * as perfectly healthy.
 *
 * This probe asks Postgres for the relation itself (`to_regclass` returns NULL
 * for a missing one) so a missing migration surfaces on the health endpoint
 * instead of silently breaking authentication.
 */
export async function checkRateLimitStoreReady(): Promise<boolean> {
  try {
    const result = await getDb().execute(
      sql`select to_regclass('public.rate_limit_counters') as table_name`,
    );
    const tableName = extractRows(result)[0]?.table_name;
    return typeof tableName === "string" && tableName.length > 0;
  } catch {
    return false;
  }
}
