/**
 * Best-effort client address for per-IP rate-limit bucketing.
 *
 * TRUST POLICY
 * ------------
 * `x-forwarded-for` (XFF) is a comma-separated chain that each proxy APPENDS
 * to; the leftmost value is the client-claimed address and is fully
 * attacker-controlled unless a trusted proxy overwrites it. Blindly trusting
 * it lets an attacker rotate the header to evade per-IP limits.
 *
 * This module therefore trusts forwarding headers ONLY when the deployment
 * explicitly declares how many reverse proxies sit in front of the app, via
 * `TRUSTED_PROXY_HOPS`:
 *
 *   - unset / 0 (default): no proxy is trusted. Forwarding headers are
 *     ignored and every request shares the single `"unknown"` IP bucket. The
 *     per-IP limit still applies (as one global-ish bucket) but is never
 *     spoofable. This is the safe default for the current repository, which
 *     documents no reverse-proxy architecture.
 *   - N >= 1: N proxies are trusted. The client address is the Nth entry
 *     counted from the RIGHT of XFF (the value appended by the outermost
 *     *trusted* hop). Entries to its left are attacker-controlled and
 *     discarded. If the chain is shorter than N (a misconfiguration or a
 *     direct connection that bypassed the proxies), the value is rejected to
 *     `"unknown"` rather than trusted.
 *
 * Per-IP limits are always a SECONDARY defence: the per-account / per-user
 * limits do not depend on this value at all, so header spoofing cannot unlock
 * an account by itself.
 *
 * LOCAL DEVELOPMENT
 * -----------------
 * With no proxy and no `TRUSTED_PROXY_HOPS`, a plain `next dev`/`next start`
 * connection yields `"unknown"` — the same bucket as other anonymous callers.
 * That is intentional and does not break development; set
 * `TRUSTED_PROXY_HOPS=1` only when actually behind one trusted proxy.
 */
export interface HeaderReader {
  get(name: string): string | null;
}

const IP_PATTERN = /^[0-9a-fA-F:.]{1,45}$/;

/** Sentinel bucket for requests whose true address cannot be trusted. */
export const UNKNOWN_CLIENT_IP = "unknown";

/**
 * Reads `TRUSTED_PROXY_HOPS`, clamped to a sane range. Invalid or negative
 * values fall back to the conservative default of 0 (trust nothing).
 */
export function getTrustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS?.trim();
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 8);
}

/**
 * Resolves the client address under the configured trust policy. `hops` may be
 * passed to make the decision explicit in tests; it defaults to the
 * environment value.
 */
export function getClientIp(
  headers: HeaderReader,
  hops: number = getTrustedProxyHops(),
): string {
  // No trusted proxy: forwarding headers are unverifiable, so do not use them.
  if (hops <= 0) {
    return UNKNOWN_CLIENT_IP;
  }

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const chain = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    // The client is the hop `hops` from the right; entries left of it are
    // client-supplied. A chain shorter than `hops` means we cannot reach the
    // trusted boundary (e.g. the request bypassed the proxies).
    const index = chain.length - hops;
    if (index < 0) {
      return UNKNOWN_CLIENT_IP;
    }
    const candidate = chain[index];
    return IP_PATTERN.test(candidate) ? candidate : UNKNOWN_CLIENT_IP;
  }

  // `x-real-ip` is set by some single-proxy deployments (e.g. nginx) to the
  // immediate peer. Trust it only when exactly one proxy hop is declared.
  if (hops === 1) {
    const realIp = headers.get("x-real-ip")?.trim();
    if (realIp && IP_PATTERN.test(realIp)) {
      return realIp;
    }
  }

  return UNKNOWN_CLIENT_IP;
}
