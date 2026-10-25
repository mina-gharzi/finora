import { UNKNOWN_CLIENT_IP } from "./client-ip";
import type { RateLimiter } from "./rate-limit";

/**
 * Per-IP limiters that stay safe when the client address is UNKNOWN.
 *
 * WHY THIS EXISTS
 * ---------------
 * `getClientIp` returns the `"unknown"` sentinel whenever the deployment has
 * not declared a trusted proxy (`TRUSTED_PROXY_HOPS`), because forwarding
 * headers are attacker-controlled and must not be trusted. Every such request
 * then maps to the SAME key. With a normal per-IP budget (e.g. 20 registrations
 * per hour, 20 failed logins per 15 minutes) a single attacker could exhaust
 * that one shared bucket and lock EVERY visitor out of sign-up and sign-in.
 *
 * WHAT IT DOES
 * ------------
 * Requests whose address is known keep the normal per-IP budget. Requests whose
 * address is unknown are counted against a SEPARATE, much larger site-wide
 * backstop (a different scope, so the two never share a counter). The
 * backstop still caps a flood, but a handful of requests can no longer deny
 * service to everyone, and a flood of unknown-address traffic cannot consume
 * the budget of properly identified clients either.
 *
 * This is a mitigation, not a substitute for configuring
 * `TRUSTED_PROXY_HOPS`: without a trusted address the app cannot tell clients
 * apart, so per-IP throttling is only a coarse site-wide ceiling. Per-account
 * and per-user limits do not depend on the address and are unaffected.
 *
 * Pure module (no Next.js imports) so it is trivially unit-testable.
 */

/** How many times larger the site-wide unknown-address budget is. */
export const UNKNOWN_IP_LIMIT_MULTIPLIER = 25;

/**
 * Routes each call to `known` or `unknown` depending on whether the key is the
 * unknown-address sentinel. The returned limiter reports the `known` scope.
 */
export function routeByClientIp(
  known: RateLimiter,
  unknown: RateLimiter,
): RateLimiter {
  const pick = (key: string): RateLimiter =>
    key === UNKNOWN_CLIENT_IP ? unknown : known;

  return {
    scope: known.scope,
    check: (key) => pick(key).check(key),
    hit: (key) => pick(key).hit(key),
    reset: (key) => pick(key).reset(key),
  };
}
