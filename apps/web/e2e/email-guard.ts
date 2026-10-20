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
  return env;
}
