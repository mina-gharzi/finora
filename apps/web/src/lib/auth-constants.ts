/**
 * Authentication constants shared by server code and the proxy.
 *
 * This module intentionally has no `server-only` marker and no Node-only
 * imports so it can be loaded from `src/proxy.ts` at the edge of the runtime.
 */
export const SESSION_COOKIE_NAME = "finora_session";

/** Session lifetime: 7 days. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export const SESSION_ALGORITHM = "HS256";

/**
 * HS256 needs a key of at least 256 bits; 32 characters is the floor. Lives
 * here (the edge-safe module) so both the server environment reader and the
 * proxy enforce the same strength check on the signing secret.
 */
export const MIN_SESSION_SECRET_LENGTH = 32;

/** Routes reachable without a session. */
export const PUBLIC_ROUTES = ["/login", "/register"] as const;
