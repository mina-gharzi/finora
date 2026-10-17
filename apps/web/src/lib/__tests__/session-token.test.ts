/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "@/lib/session-token";

const SECRET = "unit-test-session-secret-0123456789";

describe("session tokens", () => {
  it("round-trips the user id with the correct secret", async () => {
    const token = await signSessionToken("user-123", SECRET);
    await expect(verifySessionToken(token, SECRET)).resolves.toBe("user-123");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSessionToken("user-123", SECRET);
    await expect(
      verifySessionToken(token, "another-secret-value-9876543210"),
    ).resolves.toBeNull();
  });

  it("rejects a tampered token", async () => {
    const token = await signSessionToken("user-123", SECRET);
    await expect(
      verifySessionToken(`${token}tampered`, SECRET),
    ).resolves.toBeNull();
  });

  it("rejects missing or empty input", async () => {
    await expect(verifySessionToken(undefined, SECRET)).resolves.toBeNull();
    await expect(verifySessionToken(null, SECRET)).resolves.toBeNull();
    await expect(verifySessionToken("", SECRET)).resolves.toBeNull();
    await expect(verifySessionToken("abc", "")).resolves.toBeNull();
  });

  it("expires tokens after the configured lifetime", async () => {
    // A token with an explicit past expiry must fail verification.
    const { SignJWT } = await import("jose");
    const expired = await new SignJWT({ userId: "user-123" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 100)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(SECRET));

    await expect(verifySessionToken(expired, SECRET)).resolves.toBeNull();
  });
});
