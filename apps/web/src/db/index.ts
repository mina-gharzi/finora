import "server-only";
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
