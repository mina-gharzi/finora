/**
 * Protective environment for the Playwright-spawned E2E web server.
 *
 * Automated tests must NEVER trigger a real email send, regardless of the
 * developer's local configuration (real keys in `apps/web/.env`, keys in
 * `apps/web/.env.development.local`, ambient shell variables, or the
 * `EMAIL_PROVIDER=resend` development opt-in).
 *
 * Playwright REPLACES the spawned command's environment with whatever this
 * function returns, so it copies the current `process.env` first —
 * `DATABASE_URL`, `SESSION_SECRET`, ... must pass through untouched — and
 * then blanks exactly the three email variables. Next.js resolves
 * `process.env` BEFORE any `.env` file, and `getResendConfig()` trims empty
 * strings to "unset", so the production server boots with the unconfigured
 * adapter (typed unavailable error -> generic, enumeration-safe answer).
 *
 * NOTE: this guard only applies to a server Playwright spawns itself. A
 * server already listening on port 3000 is reused with its original
 * environment (see `reuseExistingServer` in playwright.config.ts) — stop any
 * locally running server before running the E2E suite.
 */
export function serverEnvWithEmailDeliveryDisabled(): {
  [key: string]: string;
} {
  const env: { [key: string]: string } = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.RESEND_API_KEY = "";
  env.EMAIL_FROM = "";
  env.EMAIL_PROVIDER = "";
  // The E2E suite injects a per-test `x-forwarded-for` header (through
  // `context.setExtraHTTPHeaders`) to isolate rate-limit buckets between
  // tests. That header is only honoured when the deployment declares at least
  // one trusted proxy hop; without this the persistent register/login limits
  // would all share one bucket and the suite would exhaust them. The Playwright
  // harness IS the trusted proxy here, so declare exactly one hop.
  env.TRUSTED_PROXY_HOPS = "1";
  return env;
}
