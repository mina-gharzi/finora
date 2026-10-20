import { describe, expect, it } from "vitest";
import {
  createInMemoryRateLimiter,
  tooManyAttemptsMessage,
} from "../rate-limit";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("createInMemoryRateLimiter", () => {
  it("allows up to the limit, then blocks", async () => {
    const c = clock();
    const rl = createInMemoryRateLimiter({ limit: 3, windowMs: 60_000, now: c.now });
    for (let i = 0; i < 3; i++) {
      expect((await rl.check("k")).allowed).toBe(true);
      await rl.hit("k");
    }
    const blocked = await rl.check("k");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("check alone never consumes budget", async () => {
    const rl = createInMemoryRateLimiter({ limit: 1, windowMs: 1000 });
    for (let i = 0; i < 10; i++) expect((await rl.check("k")).allowed).toBe(true);
  });

  it("tracks keys independently", async () => {
    const rl = createInMemoryRateLimiter({ limit: 1, windowMs: 60_000 });
    await rl.hit("a");
    expect((await rl.check("a")).allowed).toBe(false);
    expect((await rl.check("b")).allowed).toBe(true);
  });

  it("reports the remaining wait and reopens after the window", async () => {
    const c = clock();
    const rl = createInMemoryRateLimiter({ limit: 1, windowMs: 60_000, now: c.now });
    await rl.hit("k");
    c.advance(45_000);
    expect((await rl.check("k")).retryAfterSeconds).toBe(15);
    c.advance(15_000);
    expect((await rl.check("k")).allowed).toBe(true);
  });

  it("reset clears a key", async () => {
    const rl = createInMemoryRateLimiter({ limit: 1, windowMs: 60_000 });
    await rl.hit("k");
    await rl.reset("k");
    expect((await rl.check("k")).allowed).toBe(true);
  });

  it("caps tracked keys so memory stays bounded", async () => {
    const rl = createInMemoryRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
    for (const k of ["a", "b", "c", "d"]) await rl.hit(k);
    expect((await rl.check("a")).allowed).toBe(true); // oldest evicted
    expect((await rl.check("d")).allowed).toBe(false);
  });
});

describe("tooManyAttemptsMessage", () => {
  it("rounds up to whole minutes, minimum one", () => {
    expect(tooManyAttemptsMessage(5)).toContain("1 دقیقه");
    expect(tooManyAttemptsMessage(61)).toContain("2 دقیقه");
  });
});
