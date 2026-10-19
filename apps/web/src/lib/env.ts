import "server-only";
import { MIN_SESSION_SECRET_LENGTH } from "./auth-constants";

export { MIN_SESSION_SECRET_LENGTH };

/**
 * Server-only environment access.
 *
 * Values are read lazily on first use so that importing a module never throws
 * during build-time analysis, and so unit tests can provide values per case.
 * Error messages name the missing variable only — never its value.
 */
function readRequired(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        "Copy apps/web/.env.example to apps/web/.env and provide a value.",
    );
  }
  return value;
}

/** HS256 needs a key of at least 256 bits; see `auth-constants`. */
export function getSessionSecret(): string {
  const secret = readRequired("SESSION_SECRET");
  if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(
      `Environment variable "SESSION_SECRET" must be at least ` +
        `${MIN_SESSION_SECRET_LENGTH} characters long.`,
    );
  }
  return secret;
}

export function getDatabaseUrl(): string {
  return readRequired("DATABASE_URL");
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}