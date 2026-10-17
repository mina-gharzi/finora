/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "@/lib/password";

describe("password hashing", () => {
  it("produces a bcrypt hash that verifies against the original password", async () => {
    const hash = await hashPassword("correct horse battery staple 1");
    expect(hash).toMatch(/^\$2[aby]\$/);
    await expect(
      verifyPassword("correct horse battery staple 1", hash),
    ).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("abcd1234");
    await expect(verifyPassword("abcd1235", hash)).resolves.toBe(false);
  });

  it("ships a valid dummy hash that never matches a real password", async () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$/);
    await expect(
      verifyPassword("finora-dummy-password-value", DUMMY_PASSWORD_HASH),
    ).resolves.toBe(true);
    await expect(
      verifyPassword("anything-else", DUMMY_PASSWORD_HASH),
    ).resolves.toBe(false);
  });
});
