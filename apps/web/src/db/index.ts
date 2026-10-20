import "server-only";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseUrl } from "@/lib/env";
import * as schema from "./schema";

/**
 * Lazy, singleton Postgres pool. The connection is created on first query (so
 * builds and static analysis never open one) and cached on `globalThis` so it
 * survives module reloads during development.
 */
const globalForDb = globalThis as unknown as { finoraPool?: Pool };

function getPool(): Pool {
  if (!globalForDb.finoraPool) {
    globalForDb.finoraPool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 5,
    });
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
