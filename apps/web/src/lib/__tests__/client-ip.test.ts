import { beforeEach, describe, expect, it } from "vitest";
import { getClientIp, getTrustedProxyHops, UNKNOWN_CLIENT_IP } from "../client-ip";

const h = (map: Record<string, string>) => ({
  get: (n: string) => map[n.toLowerCase()] ?? null,
});

beforeEach(() => {
  delete process.env.TRUSTED_PROXY_HOPS;
});

describe("getTrustedProxyHops", () => {
  it("defaults to 0 (trust nothing) when unset or blank", () => {
    expect(getTrustedProxyHops()).toBe(0);
    process.env.TRUSTED_PROXY_HOPS = "  ";
    expect(getTrustedProxyHops()).toBe(0);
  });

  it("parses a positive integer and clamps unreasonable values", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(getTrustedProxyHops()).toBe(2);
    process.env.TRUSTED_PROXY_HOPS = "99";
    expect(getTrustedProxyHops()).toBe(8);
  });

  it("falls back to 0 for invalid or negative values", () => {
    process.env.TRUSTED_PROXY_HOPS = "abc";
    expect(getTrustedProxyHops()).toBe(0);
    process.env.TRUSTED_PROXY_HOPS = "-3";
    expect(getTrustedProxyHops()).toBe(0);
  });
});

describe("getClientIp — no trusted proxy (default)", () => {
  it("ignores forwarding headers entirely and returns a single unknown bucket", () => {
    // Even a well-formed, attacker-controlled header is not trusted.
    expect(
      getClientIp(h({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }), 0),
    ).toBe(UNKNOWN_CLIENT_IP);
    expect(getClientIp(h({ "x-real-ip": "198.51.100.7" }), 0)).toBe(
      UNKNOWN_CLIENT_IP,
    );
  });

  it("returns unknown when no headers are present", () => {
    expect(getClientIp(h({}), 0)).toBe(UNKNOWN_CLIENT_IP);
  });
});

describe("getClientIp — one trusted proxy hop", () => {
  it("takes the value the trusted proxy appended (rightmost entry)", () => {
    // The proxy appends the real peer last; the leading entry is spoofable.
    expect(
      getClientIp(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.5" }), 1),
    ).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    expect(getClientIp(h({ "x-real-ip": "198.51.100.7" }), 1)).toBe(
      "198.51.100.7",
    );
  });

  it("does not fall back to x-real-ip when more than one hop is trusted", () => {
    // With 2 proxies, x-real-ip (set by the nearest one) is not sufficient to
    // reach the true client, so it must not be trusted alone.
    expect(getClientIp(h({ "x-real-ip": "198.51.100.7" }), 2)).toBe(
      UNKNOWN_CLIENT_IP,
    );
  });

  it("rejects a spoofed / malformed single entry to unknown", () => {
    expect(getClientIp(h({ "x-forwarded-for": "evil<script>" }), 1)).toBe(
      UNKNOWN_CLIENT_IP,
    );
    expect(getClientIp(h({ "x-forwarded-for": "1".repeat(100) }), 1)).toBe(
      UNKNOWN_CLIENT_IP,
    );
  });

  it("accepts IPv6", () => {
    expect(getClientIp(h({ "x-forwarded-for": "2001:db8::1" }), 1)).toBe(
      "2001:db8::1",
    );
  });
});

describe("getClientIp — two trusted proxy hops", () => {
  it("selects the second entry from the right and discards spoofed left entries", () => {
    // Chain: [client-spoofed, real-client, proxy2, proxy1]
    // hops=2 -> index length-2 = value appended by the outermost trusted proxy
    // boundary; here that is the real client at index 1.
    expect(
      getClientIp(
        h({ "x-forwarded-for": "9.9.9.9, 203.0.113.9, 10.0.0.2, 10.0.0.1" }),
        2,
      ),
    ).toBe("10.0.0.2");
  });

  it("returns unknown when the chain is shorter than the hop count", () => {
    // Only one entry but two hops are declared: the request bypassed the
    // proxies, so the value cannot be trusted.
    expect(getClientIp(h({ "x-forwarded-for": "203.0.113.5" }), 2)).toBe(
      UNKNOWN_CLIENT_IP,
    );
  });

  it("collapses a malformed selected entry to unknown", () => {
    // hops=2 selects index 0, which is malformed here.
    expect(
      getClientIp(h({ "x-forwarded-for": "not-an-ip, 203.0.113.5" }), 2),
    ).toBe(UNKNOWN_CLIENT_IP);
  });
});

describe("getClientIp — uses the environment policy by default", () => {
  it("honours TRUSTED_PROXY_HOPS when no explicit hops are passed", () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    expect(
      getClientIp(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.5" })),
    ).toBe("203.0.113.5");

    process.env.TRUSTED_PROXY_HOPS = "0";
    expect(
      getClientIp(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.5" })),
    ).toBe(UNKNOWN_CLIENT_IP);
  });
});
