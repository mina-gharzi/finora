import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { serverEnvWithEmailDeliveryDisabled } from "./e2e/email-guard";

// The Next server loads .env itself, but the Playwright runner (and its
// workers, which inherit process.env) needs the same values for tests that
// talk to the database directly. Never override an existing value.
try {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trimEnd());
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
} catch {
  // No .env file (e.g. CI injects env another way); helpers fail loudly if
  // a required value is still missing.
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Persistent rate-limit counters survive between runs; clear them once up
  // front so a previous run cannot leave a bucket exhausted. The per-test
  // unique forwarded IP fixture keeps buckets separate within the run.
  globalSetup: "./e2e/global-setup.ts",
  // Every test registers a throwaway account against the same local Postgres;
  // registration runs bcrypt at the production cost, which is CPU-bound. With
  // more than one worker the server saturates and the registerUser helper's
  // post-submit URL wait times out under contention (measured in Stage 30: all
  // 61 tests pass at 1 worker; 28-32 fail at 2), so run strictly serially. This
  // trades a few minutes of wall-clock for a deterministic suite; it does NOT
  // lower the production bcrypt cost.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    // `retries` is 0, so `on-first-retry` would never record anything; keep a
    // trace for failing runs instead (written under the gitignored
    // test-results/ directory).
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm start",
    url: "http://127.0.0.1:3000",
    // The suite can only rely on the protective `env` below when Playwright
    // SPAWNS the server itself. If a server is already listening on port 3000
    // (e.g. a leftover `next dev` or `pnpm start`), Playwright reuses it
    // untouched and that process keeps whatever environment it was started
    // with — including a real RESEND_API_KEY. Always stop any locally running
    // server on port 3000 before `pnpm test:e2e`.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Force email delivery OFF for the spawned server, regardless of local
    // configuration (real keys, ambient env, or the EMAIL_PROVIDER=resend
    // dev opt-in) — see e2e/email-guard.ts for the mechanism and caveats.
    env: serverEnvWithEmailDeliveryDisabled(),
  },
});
