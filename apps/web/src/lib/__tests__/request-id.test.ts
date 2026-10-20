/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  generateRequestId,
  resolveRequestId,
  REQUEST_ID_HEADER,
} from "@/lib/request-id";

function reader(headers: Record<string, string>) {
  const lower = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return { get: (name: string) => lower.get(name.toLowerCase()) ?? null };
}

describe("generateRequestId", () => {
  it("returns a non-empty unique id", () => {
    const a = generateRequestId();
    const b = generateRequestId();
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});

describe("resolveRequestId", () => {
  it("honours a well-formed incoming x-request-id", () => {
    expect(resolveRequestId(reader({ [REQUEST_ID_HEADER]: "trace-abc-123" }))).toBe(
      "trace-abc-123",
    );
  });

  it("generates a fresh id when the header is absent", () => {
    expect(resolveRequestId(reader({}))).toMatch(/./);
    expect(resolveRequestId(null).length).toBeGreaterThan(0);
  });

  it("rejects an over-long incoming id", () => {
    const long = "a".repeat(200);
    expect(resolveRequestId(reader({ [REQUEST_ID_HEADER]: long }))).not.toBe(long);
  });

  it("rejects an incoming id with unsafe characters", () => {
    const bad = "abc\n<script>";
    const resolved = resolveRequestId(reader({ [REQUEST_ID_HEADER]: bad }));
    expect(resolved).not.toBe(bad);
    expect(resolved).not.toContain("\n");
  });

  it("trims surrounding whitespace on a valid id", () => {
    expect(
      resolveRequestId(reader({ [REQUEST_ID_HEADER]: "  spaced-id  " })),
    ).toBe("spaced-id");
  });
});
