import { describe, expect, it } from "vitest";
import { getClientIp } from "../client-ip";

const h = (map: Record<string, string>) => ({
  get: (n: string) => map[n.toLowerCase()] ?? null,
});

describe("getClientIp", () => {
  it("uses the first x-forwarded-for entry", () => {
    expect(getClientIp(h({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
  });
  it("falls back to x-real-ip, then unknown", () => {
    expect(getClientIp(h({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(getClientIp(h({}))).toBe("unknown");
  });
  it("accepts IPv6", () => {
    expect(getClientIp(h({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });
  it("rejects malformed or oversized values", () => {
    expect(getClientIp(h({ "x-forwarded-for": "evil<script>" }))).toBe("unknown");
    expect(getClientIp(h({ "x-forwarded-for": "1".repeat(100) }))).toBe("unknown");
  });
});