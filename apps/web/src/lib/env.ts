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

/** Default origin used to build absolute links in outgoing emails. */
const DEFAULT_APP_URL = "http://127.0.0.1:3000";

/**
 * Public origin of this deployment (scheme + host, optional port, no
 * trailing slash). Optional: local development and tests default to the
 * dev server origin. When set it must parse as an absolute http(s) URL.
 */
export function getAppUrl(): string {
  const raw = process.env.APP_URL?.trim();
  if (!raw) {
    return DEFAULT_APP_URL;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `Environment variable "APP_URL" must be an absolute http(s) URL, ` +
        `for example "https://finora.example.com".`,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `Environment variable "APP_URL" must use http or https.`,
    );
  }
  return url.toString().replace(/\/+$/, "");
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}