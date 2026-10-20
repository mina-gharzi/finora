import { clearRateLimitCounters } from "./db";

/**
 * Runs once before the suite. Empties the persistent rate-limit counters so a
 * previous run cannot leave a bucket at its limit and cause spurious 429s. The
 * per-test unique forwarded IP (see e2e/fixtures.ts) keeps buckets separate
 * within the run. Only the rate-limit table is touched.
 */
export default async function globalSetup(): Promise<void> {
  await clearRateLimitCounters();
}
