import { jwtVerify, SignJWT } from "jose";
import { SESSION_ALGORITHM, SESSION_MAX_AGE_SECONDS } from "./auth-constants";

/**
 * Stateless signed-session token helpers. Kept free of `next/headers` so the
 * same logic can run inside server actions, the data access layer and the
 * request proxy.
 */

function keyFrom(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  userId: string,
  secret: string,
): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: SESSION_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(keyFrom(secret));
}

export async function verifySessionToken(
  token: string | undefined | null,
  secret: string,
): Promise<string | null> {
  if (!token || !secret) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      algorithms: [SESSION_ALGORITHM],
    });
    const userId = payload.userId;
    return typeof userId === "string" && userId.length > 0 ? userId : null;
  } catch {
    return null;
  }
}
