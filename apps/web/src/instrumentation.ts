import { MIN_SESSION_SECRET_LENGTH } from "./lib/auth-constants";
import { getTrustedProxyHops } from "./lib/client-ip";

/**
 * Fail-fast environment validation for a production server instance.
 *
 * The application itself reads environment values lazily (see `lib/env.ts`),
 * which means a missing or weak secret would otherwise surface as a 500 on the
 * first request that needs a session. Running the same checks once at server
 * startup turns that into an immediate, explicit boot failure naming the
 * variable — never its value.
 *
 * Guard rails:
 * - Only the Node.js runtime validates (the proxy runs elsewhere).
 * - The production *build* phase is skipped so `next build` in an environment
 *   without secrets (e.g. a CI compile step) still succeeds; validation is
 *   about a server actually starting to serve traffic.
 * - Development keeps the existing lazy behaviour so local iteration is not
 *   blocked by boot-time checks.
 */
function fail(message: string): never {
  throw new Error(`[finora] Production environment validation failed: ${message}`);
}

function validateProductionEnv(): void {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    fail(
      `Missing required environment variable "SESSION_SECRET". ` +
        "Copy apps/web/.env.example to apps/web/.env and provide a value.",
    );
  }
  if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    fail(
      `Environment variable "SESSION_SECRET" must be at least ` +
        `${MIN_SESSION_SECRET_LENGTH} characters long.`,
    );
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    fail(
      `Missing required environment variable "DATABASE_URL". ` +
        "Copy apps/web/.env.example to apps/web/.env and provide a value.",
    );
  }
}

/**
 * Advisory only — never fatal. Email delivery (Resend) needs BOTH
 * `RESEND_API_KEY` and `EMAIL_FROM` in production; when either is unset the
 * app must still boot, because the public recovery endpoints fail safe with
 * the same generic, enumeration-safe "service unavailable" answer (see
 * `lib/email/adapter.ts`). The warning makes that degraded state visible to
 * operators once at startup. It names variables — never their values.
 */
function warnWhenEmailDeliveryUnconfigured(): void {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (apiKey && from) return;
  console.warn(
    "[finora] Email delivery is not configured: RESEND_API_KEY and/or EMAIL_FROM " +
      "are unset. Email verification and password recovery will answer with the " +
      "generic unavailable message until both are provided (sender domain must " +
      "also be verified with the provider).",
  );
}

/**
 * Advisory only — never fatal. Per-IP rate-limit buckets are derived from
 * `x-forwarded-for` ONLY when the deployment declares how many trusted
 * proxies sit in front of the app. With `TRUSTED_PROXY_HOPS` unset (or 0, or
 * not a number) the forwarding headers are ignored entirely and EVERY request
 * — from every visitor — lands in the single `"unknown"` bucket. The per-IP
 * limits then apply to the whole site at once (e.g. 20 registrations per hour
 * for everyone), which is indistinguishable from an abuse wave.
 *
 * On Vercel the platform itself is the proxy, so the correct value is `1`. The
 * warning makes this misconfiguration visible once at startup instead of
 * letting it surface as mysterious "too many attempts" errors. It names the
 * variable — never its value.
 */
function warnWhenTrustedProxyHopsUnset(): void {
  if (getTrustedProxyHops() >= 1) return;
  console.warn(
    "[finora] TRUSTED_PROXY_HOPS is unset or not a positive number: all " +
      "clients share a single per-IP rate-limit bucket, so the per-IP limits " +
      "(registration and login) apply to the whole site at once. Set it to the " +
      "number of trusted reverse proxies in front of the app (1 when only " +
      "Vercel is in front of it).",
  );
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production") return;

  validateProductionEnv();
  warnWhenEmailDeliveryUnconfigured();
  warnWhenTrustedProxyHopsUnset();
}
