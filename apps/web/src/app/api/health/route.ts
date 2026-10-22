import { checkDatabaseConnectivity, checkRateLimitStoreReady } from "@/db";
import { createLogger } from "@/lib/logger";
import { resolveRequestId } from "@/lib/request-id";

/**
 * `GET /api/health` — operational health probe.
 *
 * Status semantics (exact contract):
 * - `200 OK` with `{ "status": "ok" }`: the process is serving requests, a
 *   lightweight database round-trip (`SELECT 1`) succeeded, AND the
 *   rate-limit store's table exists. This is a readiness signal: the instance
 *   can serve requests that touch the database, including the authentication
 *   flows.
 * - `503 Service Unavailable` with `{ "status": "unavailable" }`: the database
 *   check failed, or the database is reachable but its schema is not applied
 *   (the rate-limit table is missing), so the instance cannot serve
 *   data-dependent requests. A load balancer / orchestrator should not route
 *   traffic here. The response body carries no reason — driver messages, SQL,
 *   URLs, credentials and stack traces stay server-side (only a structured
 *   error log records the failure).
 *
 * Both failure modes matter, and they look identical from the outside if only
 * the first is checked. A reachable database whose migrations were never
 * applied answers every rate-limit query with "undefined table", which fails
 * the limiter closed: every login and registration is then answered with the
 * generic "too many attempts" message, while `SELECT 1` still succeeds. The
 * schema probe turns that silent authentication outage into a visible 503.
 *
 * Deliberately unauthenticated: a health probe must not need a session, and the
 * response exposes no user data or environment configuration. The endpoint is
 * cheap (`SELECT 1` plus one catalog lookup, no table scan) and safe for
 * frequent probes.
 *
 * Liveness vs readiness: a single probe intentionally combines "process up"
 * with "database reachable and usable", because every meaningful request in
 * this app needs the database. A separate pure-liveness endpoint would add
 * operational surface without a clear purpose, so none is provided.
 *
 * Caching is disabled so intermediaries never serve a stale health verdict.
 */

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
} as const;

export async function GET(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request.headers);
  const log = createLogger({ requestId });

  const healthy = await checkDatabaseConnectivity();

  if (!healthy) {
    // Safe event: stable code + correlation id only. No error object, no
    // database detail — the point is to alert an operator, not to leak internals.
    log.error("health.database.unavailable");
    return new Response(JSON.stringify({ status: "unavailable" }), {
      status: 503,
      headers: JSON_HEADERS,
    });
  }

  const storeReady = await checkRateLimitStoreReady();

  if (!storeReady) {
    // Same reasoning: name the failure, disclose nothing about the database.
    log.error("health.schema.incomplete");
    return new Response(JSON.stringify({ status: "unavailable" }), {
      status: 503,
      headers: JSON_HEADERS,
    });
  }

  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
