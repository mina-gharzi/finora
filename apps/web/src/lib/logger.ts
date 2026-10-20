import "server-only";

/**
 * Centralized server-side structured logging.
 *
 * Every record is a single-line JSON object so it is readable in a terminal
 * during development and machine-parseable by a log collector in production,
 * without adding a logging dependency (the repository has none, and native
 * `console` already provides the sink).
 *
 * Record shape (keys are stable):
 *
 *   {
 *     "timestamp": "2026-10-20T12:34:56.789Z", // ISO-8601, UTC
 *     "level": "error",                        // debug | info | warn | error
 *     "event": "email.delivery.failed",        // stable, dot-separated code
 *     "requestId": "…",                        // present when one is known
 *     "…": "…"                                 // carefully selected metadata
 *   }
 *
 * Safety model — the reason this module exists:
 * - Callers pass a STABLE EVENT NAME plus a small, explicit metadata object.
 *   Arbitrary request objects, headers, cookies, DB rows and exceptions are
 *   never serialized wholesale.
 * - Metadata is deep-sanitized: string/number/boolean values only, keys are
 *   filtered, depth and collection sizes are capped, and known-sensitive keys
 *   are dropped.
 * - A value-level scrubber removes token-like strings, emails and URL query
 *   strings even when they hide inside a "safe-looking" field, so a secret
 *   echoed by an upstream error cannot reach the log.
 * - `Error` instances are reduced to `{ name, code? }`; the message is included
 *   only after scrubbing and the stack is never logged (stacks leak paths and,
 *   for some errors, request data).
 *
 * Levels and the `LOG_LEVEL` threshold follow the usual syslog ordering:
 * `debug` < `info` < `warn` < `error`. Records below the threshold are dropped.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Numeric severity so a threshold comparison is a single `>=`. */
const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogMetadata = Record<string, unknown>;

/** The exact JSON document written for one log call. */
export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  event: string;
  requestId?: string;
  [key: string]: unknown;
}

/**
 * Keys whose values must never be emitted, matched case-insensitively as a
 * substring of the key so `userPassword`, `passwordHash`, `rawToken`,
 * `setCookie`, `authorizationHeader`, `apiKey` etc. are all covered.
 */
const BLOCKED_KEY_FRAGMENTS = [
  "password",
  "passwd",
  "secret",
  "token",
  "cookie",
  "authorization",
  "auth",
  "apikey",
  "api_key",
  "credential",
  "session",
  "jwt",
  "bearer",
  "signature",
  "privatekey",
  "private_key",
  "databaseurl",
  "database_url",
];

/** Metadata keys the logger sets itself; callers cannot override them. */
const RESERVED_KEYS = new Set(["timestamp", "level", "event", "requestId"]);

/** Bounds that keep a single record cheap and prevent pathological input. */
const MAX_METADATA_DEPTH = 4;
const MAX_COLLECTION_ITEMS = 20;
const MAX_STRING_LENGTH = 512;

/**
 * Token-like literals scrubbed from any surviving string value:
 * - URL query strings are stripped in full (a `?token=…` link, an
 *   `email=…` parameter, a signed URL), leaving path-only where possible.
 * - JWTs (`a.b.c` base64url segments) are replaced wholesale.
 * - `Bearer <value>` / `Basic <value>` credentials are replaced.
 * - Email addresses are masked.
 * - Long opaque tokens (>= 24 chars of URL-safe alphabet) are replaced.
 */
function scrubString(value: string): string {
  return (
    value
      // Strip the query portion of any URL-looking substring.
      .replace(/(https?:\/\/[^\s"'<>]+?)\?[^\s"'<>]*/gi, "$1")
      // JWTs: three base64url segments separated by dots.
      .replace(
        /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
        "[redacted-jwt]",
      )
      // Authorization schemes.
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
      // Common query/assignment forms even without a full URL.
      .replace(
        /\b(token|api[_-]?key|secret|password|code)=([^&\s"'<>]+)/gi,
        "$1=[redacted]",
      )
      // Email addresses.
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[redacted-email]")
      // Any remaining long opaque token-like run.
      .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[redacted-token]")
      .slice(0, MAX_STRING_LENGTH)
  );
}

function isBlockedKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return BLOCKED_KEY_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment),
  );
}

/**
 * Reduces an `Error` to a small, safe object. `code` (used by Postgres errors
 * and the app's typed errors) and `name` are stable and non-sensitive; the
 * message is scrubbed defensively because an upstream library may echo request
 * details. `stack` and `cause` are deliberately omitted.
 */
function normalizeError(error: Error): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: scrubString(error.name || "Error"),
  };
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" || typeof code === "number") {
    out.code = scrubString(String(code));
  }
  if (typeof error.message === "string" && error.message.length > 0) {
    out.message = scrubString(error.message);
  }
  return out;
}

/**
 * Turns an arbitrary thrown value into a loggable, safe field object.
 * `Error` instances become `{ error: { name, code?, message? } }`; anything
 * else is sanitized like ordinary metadata.
 */
export function normalizeErrorValue(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { error: normalizeError(error) };
  }
  return { error: sanitizeValue(error, 0) };
}

/**
 * Deep-sanitizes a metadata value. Only primitives survive; arrays and plain
 * objects are walked with depth/item caps. Blocked keys inside nested objects
 * are dropped, and every string passes through the scrubber.
 */
function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "boolean") return value;

  if (value instanceof Error) {
    return normalizeError(value);
  }

  if (depth >= MAX_METADATA_DEPTH) return "[truncated]";

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_COLLECTION_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const key of Object.keys(source)) {
      if (count >= MAX_COLLECTION_ITEMS) break;
      if (isBlockedKey(key)) continue;
      const sanitized = sanitizeValue(source[key], depth + 1);
      if (sanitized === undefined) continue;
      out[key] = sanitized;
      count += 1;
    }
    return out;
  }

  // Functions, symbols, bigints: not useful and potentially surprising.
  return undefined;
}

/** Sanitizes a caller-supplied metadata bag into flat, safe key/value pairs. */
function sanitizeMetadata(metadata: LogMetadata): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(metadata)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (isBlockedKey(key)) continue;
    const sanitized = sanitizeValue(metadata[key], 0);
    if (sanitized === undefined) continue;
    out[key] = sanitized;
  }
  return out;
}

/** Validates an event name so log events stay stable and greppable. */
function normalizeEvent(event: string): string {
  const trimmed = event.trim();
  return trimmed.length > 0 ? trimmed : "unknown";
}

let cachedThreshold: number | null = null;
let cachedThresholdSource: string | undefined;

/**
 * Reads `LOG_LEVEL` once per process. Unknown values fall back to `info` in
 * production and `debug` elsewhere, so development stays verbose while
 * production does not accidentally log debug noise.
 */
function resolveThreshold(): number {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (cachedThreshold !== null && cachedThresholdSource === raw) {
    return cachedThreshold;
  }
  const fallback: LogLevel =
    process.env.NODE_ENV === "production" ? "info" : "debug";
  const level =
    raw === "debug" || raw === "info" || raw === "warn" || raw === "error"
      ? (raw as LogLevel)
      : fallback;
  cachedThreshold = LEVEL_SEVERITY[level];
  cachedThresholdSource = raw;
  return cachedThreshold;
}

/** Test-only hook so level changes do not leak between cases. */
export function resetLogLevelCacheForTests(): void {
  cachedThreshold = null;
  cachedThresholdSource = undefined;
}

export interface LogContext {
  /** Correlation id carried into every record; omitted when unknown. */
  requestId?: string;
  /** Extra safe fields merged into every record. */
  metadata?: LogMetadata;
}

/** Writes one structured record if it meets the active level threshold. */
function emit(
  level: LogLevel,
  event: string,
  context: LogContext,
  metadata: LogMetadata | undefined,
): void {
  if (LEVEL_SEVERITY[level] < resolveThreshold()) return;

  const record: LogRecord = {
    timestamp: new Date().toISOString(),
    level,
    event: normalizeEvent(event),
  };

  if (typeof context.requestId === "string" && context.requestId.length > 0) {
    record.requestId = scrubString(context.requestId);
  }

  Object.assign(record, sanitizeMetadata(context.metadata ?? {}));
  Object.assign(record, sanitizeMetadata(metadata ?? {}));

  const line = JSON.stringify(record);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else if (level === "debug") {
    console.debug(line);
  } else {
    console.info(line);
  }
}

export interface Logger {
  debug(event: string, metadata?: LogMetadata): void;
  info(event: string, metadata?: LogMetadata): void;
  warn(event: string, metadata?: LogMetadata): void;
  /** Logs at `error`; `metadata.error` may be any thrown value. */
  error(event: string, metadata?: LogMetadata): void;
}

/**
 * Creates a logger bound to an optional request context. Prefer one logger per
 * request (or module-level logger for background paths) so the correlation id
 * is attached consistently without threading it through every call.
 */
export function createLogger(context: LogContext = {}): Logger {
  return {
    debug: (event, metadata) => emit("debug", event, context, metadata),
    info: (event, metadata) => emit("info", event, context, metadata),
    warn: (event, metadata) => emit("warn", event, context, metadata),
    error: (event, metadata) => emit("error", event, context, metadata),
  };
}

/** Process-wide logger for paths that have no request context (startup, jobs). */
export const logger: Logger = createLogger();

/** Exposed for tests and for callers that need to pre-compose a record. */
export const __testing = {
  scrubString,
  sanitizeMetadata,
  normalizeError,
  BLOCKED_KEY_FRAGMENTS,
};
