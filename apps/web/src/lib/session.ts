import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "./auth-constants";
import { getSessionSecret, isProduction } from "./env";
import {
  signSessionToken,
  verifySessionTokenDetails,
  type SessionTokenDetails,
} from "./session-token";

/**
 * Cookie-bound session management. The session is a stateless, signed JWT; the
 * cookie is httpOnly, SameSite=Lax and only marked `Secure` outside
 * development so local HTTP (including end-to-end tests) keeps working.
 *
 * This module deliberately exposes NO signature-only "who is this" reader.
 * Verifying the JWT alone is not authentication: the `auth_valid_after`
 * watermark that revokes sessions after a password reset/change is enforced in
 * the Data Access Layer (`lib/dal.ts`), so identity must be obtained through
 * `dal.requireUserId` / `dal.getSessionUserId` / `dal.getCurrentUser`, which
 * apply that check. A raw helper here would silently bypass revocation.
 */

export async function createSession(userId: string): Promise<void> {
  const token = await signSessionToken(userId, getSessionSecret());
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * The verified session identity together with the token's issue time, so the
 * data access layer can enforce the per-user `auth_valid_after` watermark
 * after a password reset.
 */
export async function getSessionAuth(): Promise<SessionTokenDetails | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionTokenDetails(token, getSessionSecret());
}
