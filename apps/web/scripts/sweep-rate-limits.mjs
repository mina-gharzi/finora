#!/usr/bin/env node
/**
 * Operational maintenance: sweep expired rate-limit counters.
 *
 * The application removes expired `rate_limit_counters` rows opportunistically
 * on the request path (see `src/lib/persistent-rate-limit.ts`), but a periodic
 * full sweep keeps the table bounded even under low traffic. This script is the
 * runnable entrypoint for that job so an EXTERNAL scheduler (cron, systemd
 * timer, Kubernetes CronJob, a platform scheduler) has something concrete to
 * invoke. There is deliberately NO in-app scheduler.
 *
 * It mirrors `sweepAllExpired()` in `src/lib/persistent-rate-limit.ts`: a single
 * indexed `DELETE ... WHERE expires_at < now()` that only removes rows whose
 * window has already expired, so no live counter is ever touched. If that SQL
 * changes, change it here too (both are covered by tests).
 *
 * Usage:
 *   node scripts/sweep-rate-limits.mjs
 *
 * Connection: reads `DATABASE_URL` from the environment. If it is not set, it
 * loads `.env` from the app directory (best effort) without overriding an
 * existing value. Credentials are never printed.
 *
 * Exit codes: 0 = success (prints the number of rows removed); non-zero = the
 * store was unreachable or the sweep failed, so a scheduler can alert.
 *
 * This is a plain Node ESM script with no build step and no extra dependency
 * (it uses the `pg` package already required by the app).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Load `DATABASE_URL` from `.env` only when the environment does not set it. */
export function loadDatabaseUrl() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return process.env.DATABASE_URL;
  }
  try {
    const text = readFileSync(join(appDir, ".env"), "utf8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (key !== "DATABASE_URL") continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value;
    }
  } catch {
    // No .env file: fall through to the error below.
  }
  return undefined;
}

/**
 * The canonical sweep statement (identical predicate to `sweepAllExpired()`):
 * an indexed delete of rows whose window has already expired.
 */
export const SWEEP_SQL = "DELETE FROM rate_limit_counters WHERE expires_at < now()";

async function main() {
  const connectionString = loadDatabaseUrl();
  if (!connectionString) {
    console.error(
      "[finora] sweep-rate-limits: DATABASE_URL is not set (environment or apps/web/.env).",
    );
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    const result = await pool.query(SWEEP_SQL);
    // Only the count is reported — never the connection string or any row data.
    console.log(
      `[finora] sweep-rate-limits: removed ${result.rowCount ?? 0} expired counter row(s).`,
    );
  } catch (error) {
    console.error(
      `[finora] sweep-rate-limits: failed (${
        error instanceof Error ? error.name : "unknown"
      }).`,
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

// Run only when invoked directly, so importing this module (e.g. from a test)
// never opens a database connection.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  await main();
}
