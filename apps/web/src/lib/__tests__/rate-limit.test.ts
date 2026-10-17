import { describe, expect, it } from "vitest";
import { createRateLimiter, tooManyAttemptsMessage } from "../rate-limit";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("createRateLimiter", () => {
  it("allows up to the limit, then blocks", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000, now: c.now });
    for (let i = 0; i < 3; i++) {
      expect(rl.check("k").allowed).toBe(true);
      rl.hit("k");
    }
    const blocked = rl.check("k");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("check alone never consumes budget", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    for (let i = 0; i < 10; i++) expect(rl.check("k").allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000 });
    rl.hit("a");
    expect(rl.check("a").allowed).toBe(false);
    expect(rl.check("b").allowed).toBe(true);
  });

  it("reports the remaining wait and reopens after the window", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, now: c.now });
    rl.hit("k");
    c.advance(45_000);
    expect(rl.check("k").retryAfterSeconds).toBe(15);
    c.advance(15_000);
    expect(rl.check("k").allowed).toBe(true);
  });

  it("reset clears a key", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000 });
    rl.hit("k");
    rl.reset("k");
    expect(rl.check("k").allowed).toBe(true);
  });

  it("caps tracked keys so memory stays bounded", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
    ["a", "b", "c", "d"].forEach((k) => rl.hit(k));
    expect(rl.check("a").allowed).toBe(true); // oldest evicted
    expect(rl.check("d").allowed).toBe(false);
  });
});

describe("tooManyAttemptsMessage", () => {
  it("rounds up to whole minutes, minimum one", () => {
    expect(tooManyAttemptsMessage(5)).toContain("1 دقیقه");
    expect(tooManyAttemptsMessage(61)).toContain("2 دقیقه");
  });
});