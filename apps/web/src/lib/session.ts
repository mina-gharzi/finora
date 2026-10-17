import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "./auth-constants";
import { getSessionSecret, isProduction } from "./env";
import { signSessionToken, verifySessionToken } from "./session-token";

/**
 * Cookie-bound session management. The session is a stateless, signed JWT; the
 * cookie is httpOnly, SameSite=Lax and only marked `Secure` outside
 * development so local HTTP (including end-to-end tests) keeps working.
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

export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token, getSessionSecret());
}
