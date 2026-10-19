import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

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
  // Every test registers a throwaway account against the same local Postgres;
  // the default worker count (≈ CPU count) saturates it and makes registration
  // flaky, so keep a small, deterministic pool.
  workers: 2,
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
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
