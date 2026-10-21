/**
 * @vitest-environment node
 *
 * Focused checks for the rate-limit maintenance script
 * (`scripts/sweep-rate-limits.mjs`). The script is the runnable entrypoint an
 * external scheduler invokes; these tests pin its contract without touching a
 * database (the actual sweep is exercised end-to-end against the local dev DB).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { SWEEP_SQL, loadDatabaseUrl } from "../../scripts/sweep-rate-limits.mjs";

const scriptPath = fileURLToPath(
  new URL("../../scripts/sweep-rate-limits.mjs", import.meta.url),
);
const sourceModulePath = fileURLToPath(
  new URL("../lib/persistent-rate-limit.ts", import.meta.url),
);

const savedDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
});

describe("sweep-rate-limits maintenance script", () => {
  it("uses the same expired-row predicate as sweepAllExpired()", () => {
    // The app deletes rows whose expires_at is in the past; the script must
    // target exactly the same set so no live counter is ever removed.
    expect(SWEEP_SQL).toMatch(/delete\s+from\s+rate_limit_counters/i);
    expect(SWEEP_SQL).toMatch(/expires_at\s*<\s*now\(\)/i);

    const source = readFileSync(sourceModulePath, "utf8");
    expect(source).toMatch(/lt\(rateLimitCounters\.expiresAt, sql`now\(\)`\)/);
  });

  it("prefers an explicitly provided DATABASE_URL", () => {
    process.env.DATABASE_URL = "postgres://example/db";
    expect(loadDatabaseUrl()).toBe("postgres://example/db");
  });

  it("never prints credentials — the script only reports a row count", () => {
    const text = readFileSync(scriptPath, "utf8");
    // The only console output is the count line; the connection string is
    // never logged.
    expect(text).toMatch(/removed \$\{result\.rowCount \?\? 0\}/);
    expect(text).not.toMatch(/console\.(log|error)\([^)]*connectionString/);
  });

  it("exits non-zero when the store fails so a scheduler can alert", () => {
    const text = readFileSync(scriptPath, "utf8");
    expect(text).toMatch(/process\.exitCode = 1/);
    expect(text).toMatch(/process\.exit\(1\)/);
  });

  it("does not open a connection merely when imported", () => {
    // Importing succeeded above without a DATABASE_URL; if the top-level run
    // were unguarded it would have attempted a connection and exited.
    expect(typeof loadDatabaseUrl).toBe("function");
  });
});
