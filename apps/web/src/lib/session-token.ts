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
  const details = await verifySessionTokenDetails(token, secret);
  return details?.userId ?? null;
}

export interface SessionTokenDetails {
  userId: string;
  /** JWT `iat`, in seconds since the epoch (floored, per the JWT spec). */
  issuedAt: number;
}

/**
 * Same verification as `verifySessionToken`, but also surfaces the token's
 * issue time. The data access layer compares it against the user's
 * `auth_valid_after` watermark so password resets can invalidate every
 * previously issued session without a revocation list.
 */
export async function verifySessionTokenDetails(
  token: string | undefined | null,
  secret: string,
): Promise<SessionTokenDetails | null> {
  if (!token || !secret) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      algorithms: [SESSION_ALGORITHM],
    });
    const userId = payload.userId;
    const issuedAt = payload.iat;
    if (
      typeof userId === "string" &&
      userId.length > 0 &&
      typeof issuedAt === "number"
    ) {
      return { userId, issuedAt };
    }
    return null;
  } catch {
    return null;
  }
}
