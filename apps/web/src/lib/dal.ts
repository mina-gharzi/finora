import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionAuth } from "./session";
import {
  findUserAuthValidAfter,
  findUserById,
  isEmailVerifiedFor,
} from "./users";

/**
 * Data Access Layer. All session and identity reads go through here so that
 * authorization logic lives in one place. `cache` dedupes the work across a
 * single render pass.
 */

/** The verified user id for this request, or null when not signed in. */
export const getSessionUserId = cache(async (): Promise<string | null> => {
  const auth = await getSessionAuth();
  if (!auth) {
    return null;
  }

  // Session-invalidation watermark: a password reset bumps
  // `auth_valid_after`, and any token issued strictly before it (by JWT
  // `iat`) must stop authenticating even though the signature is still
  // cryptographically valid. Tokens issued in the same second as the reset
  // are also rejected; the user simply signs in again for a fresh token.
  const gate = await findUserAuthValidAfter(auth.userId);
  if (!gate) {
    // The account was deleted while the cookie was still alive.
    return null;
  }
  if (gate.authValidAfter && auth.issuedAt * 1000 < gate.authValidAfter.getTime()) {
    return null;
  }
  return auth.userId;
});

/** The verified user id, redirecting to the login page when absent. */
export const requireUserId = cache(async (): Promise<string> => {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login");
  }
  return userId;
});

/**
 * True when the user has completed email verification. Used by financial
 * mutation actions: reads stay available to unverified accounts so they can
 * see their data and the verification banner, but writes require proof that
 * the registered address is controlled.
 */
export const isEmailVerified = cache(
  async (userId: string): Promise<boolean> => isEmailVerifiedFor(userId),
);

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: Date | null;
}

/**
 * The current user as a narrow DTO (no password hash), or null when the
 * request is not authenticated or the account no longer exists.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const userId = await getSessionUserId();
  if (!userId) {
    return null;
  }

  const user = await findUserById(userId);
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerifiedAt: user.emailVerifiedAt,
  };
});
