/**
 * @vitest-environment node
 *
 * With no trusted proxy every request resolves to the "unknown" address. These
 * tests pin that such traffic is counted against its own larger site-wide
 * budget, so one client cannot exhaust the normal per-IP budget for everyone.
 */
import { describe, expect, it } from "vitest";
import { UNKNOWN_CLIENT_IP } from "../client-ip";
import {
  routeByClientIp,
  UNKNOWN_IP_LIMIT_MULTIPLIER,
} from "../ip-rate-limit";
import { createInMemoryRateLimiter } from "../rate-limit";

const HOUR = 60 * 60 * 1000;
const LIMIT = 4;

function build() {
  const known = createInMemoryRateLimiter({ limit: LIMIT, windowMs: HOUR });
  const unknown = createInMemoryRateLimiter({
    limit: LIMIT * UNKNOWN_IP_LIMIT_MULTIPLIER,
    windowMs: HOUR,
  });
  return { known, unknown, limiter: routeByClientIp(known, unknown) };
}

async function hitTimes(
  limiter: ReturnType<typeof routeByClientIp>,
  key: string,
  times: number,
) {
  for (let i = 0; i < times; i += 1) await limiter.hit(key);
}

describe("routeByClientIp", () => {
  it("applies the normal per-IP budget to a known address", async () => {
    const { limiter } = build();
    await hitTimes(limiter, "203.0.113.5", LIMIT);
    expect((await limiter.check("203.0.113.5")).allowed).toBe(false);
    expect((await limiter.check("203.0.113.6")).allowed).toBe(true);
  });

  it("does not let the normal budget be exhausted through the unknown address", async () => {
    const { limiter } = build();
    // A single attacker with no identifiable address sends more than the
    // ordinary per-IP budget...
    await hitTimes(limiter, UNKNOWN_CLIENT_IP, LIMIT * 2);
    // ...and other unidentified visitors are still served,
    expect((await limiter.check(UNKNOWN_CLIENT_IP)).allowed).toBe(true);
    // while identified clients are completely unaffected.
    expect((await limiter.check("203.0.113.5")).allowed).toBe(true);
  });

  it("still caps unknown-address traffic at the larger site-wide ceiling", async () => {
    const { limiter } = build();
    await hitTimes(
      limiter,
      UNKNOWN_CLIENT_IP,
      LIMIT * UNKNOWN_IP_LIMIT_MULTIPLIER,
    );
    const gate = await limiter.check(UNKNOWN_CLIENT_IP);
    expect(gate.allowed).toBe(false);
    expect(gate.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps the two budgets independent in both directions", async () => {
    const { limiter } = build();
    await hitTimes(limiter, "203.0.113.5", LIMIT);
    expect((await limiter.check("203.0.113.5")).allowed).toBe(false);
    expect((await limiter.check(UNKNOWN_CLIENT_IP)).allowed).toBe(true);
  });

  it("routes reset to the same limiter that counted the key", async () => {
    const { limiter } = build();
    await hitTimes(limiter, "203.0.113.5", LIMIT);
    await limiter.reset("203.0.113.5");
    expect((await limiter.check("203.0.113.5")).allowed).toBe(true);

    await hitTimes(limiter, UNKNOWN_CLIENT_IP, LIMIT * UNKNOWN_IP_LIMIT_MULTIPLIER);
    await limiter.reset(UNKNOWN_CLIENT_IP);
    expect((await limiter.check(UNKNOWN_CLIENT_IP)).allowed).toBe(true);
  });

  it("reports the known limiter's scope for diagnostics", () => {
    const known = { ...createInMemoryRateLimiter({ limit: 1, windowMs: HOUR }), scope: "auth:x:ip" };
    const unknown = { ...createInMemoryRateLimiter({ limit: 25, windowMs: HOUR }), scope: "auth:x:ip:unknown" };
    expect(routeByClientIp(known, unknown).scope).toBe("auth:x:ip");
  });
});
