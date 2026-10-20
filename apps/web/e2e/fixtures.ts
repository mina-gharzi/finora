import { test as base } from "@playwright/test";

/**
 * Playwright test fixture that gives every test a globally unique
 * `x-forwarded-for` value.
 *
 * The application now enforces persistent, database-backed rate limits keyed by
 * the resolved client IP. The E2E server runs with `TRUSTED_PROXY_HOPS=1`
 * (see e2e/email-guard.ts), so this header is honoured and each test gets its
 * own limiter bucket. Without it, every test would share one bucket and the
 * per-IP registration/login limits would be exhausted partway through the
 * suite — and, because the counters persist in Postgres, a repeat run would
 * start already throttled.
 *
 * The value mixes a per-process random prefix, a monotonic counter, and a
 * timestamp so it stays unique across parallel workers and across repeated
 * runs. It is always a syntactically valid IPv4 address.
 */
let counter = 0;
const runSalt = Math.floor(Math.random() * 200);

export const test = base.extend({
  context: async ({ context }, provide) => {
    counter += 1;
    const ip = `198.51.${(runSalt + counter) % 250}.${(Date.now() % 250) + 1}`;
    await context.setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await provide(context);
  },
});

export { expect } from "@playwright/test";
