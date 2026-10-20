/**
 * Request / correlation id helpers.
 *
 * A correlation id lets an operator tie together the log records produced while
 * handling a single request. Incoming `x-request-id` (the conventional
 * reverse-proxy / load-balancer header) is honoured when it is present and
 * well-formed; otherwise a fresh id is generated. The value is only ever used
 * as an opaque correlation token — never trusted for routing or authorization —
 * so it is sanitized down to a safe character set and length before use.
 *
 * This module has no `server-only` marker and no Node-only imports so it can be
 * shared by route handlers, server actions and (if ever needed) the proxy.
 */

/** Header read by proxies/load balancers to propagate a correlation id. */
export const REQUEST_ID_HEADER = "x-request-id";

/** Max accepted length; anything longer is dropped in favour of a fresh id. */
const MAX_REQUEST_ID_LENGTH = 128;

/** Conservative allowlist: URL-safe id alphabets only. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

export interface RequestIdReader {
  get(name: string): string | null;
}

/** Generates a new opaque request id (prefers the platform UUID generator). */
export function generateRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for runtimes without crypto.randomUUID. Correlation ids are not
  // secrets, so a non-cryptographic source is acceptable here.
  const random = Math.random().toString(36).slice(2, 10);
  return `req-${Date.now().toString(36)}-${random}`;
}

/**
 * Returns the incoming correlation id when it is present and well-formed,
 * otherwise a freshly generated one. Always returns a non-empty string.
 */
export function resolveRequestId(headers?: RequestIdReader | null): string {
  const incoming = headers?.get(REQUEST_ID_HEADER)?.trim();
  if (
    incoming &&
    incoming.length <= MAX_REQUEST_ID_LENGTH &&
    REQUEST_ID_PATTERN.test(incoming)
  ) {
    return incoming;
  }
  return generateRequestId();
}
