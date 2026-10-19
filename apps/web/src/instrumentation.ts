import { MIN_SESSION_SECRET_LENGTH } from "./lib/auth-constants";

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

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production") return;

  validateProductionEnv();
}
