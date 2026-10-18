/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("joins truthy values with a single space", () => {
    expect(cn("a", "b")).toBe("a b");
    expect(cn("px-2", "text-sm", "font-medium")).toBe(
      "px-2 text-sm font-medium",
    );
  });

  it.each([
    [null, "a"],
    [undefined, "a"],
    [false, "a"],
    [0, "a"],
    ["", "a"],
  ])("drops %j while keeping the rest", (falsy, kept) => {
    expect(cn(falsy as never, kept as never)).toBe(kept);
  });

  it("returns an empty string when nothing is truthy", () => {
    expect(cn()).toBe("");
    expect(cn(null, undefined, false, "")).toBe("");
  });

  it("preserves the given order, because it does not resolve conflicts", () => {
    expect(cn("mt-2", "mt-4")).toBe("mt-2 mt-4");
  });
});
