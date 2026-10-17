import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUserId as readSessionUserId } from "./session";
import { findUserById } from "./users";

/**
 * Data Access Layer. All session and identity reads go through here so that
 * authorization logic lives in one place. `cache` dedupes the work across a
 * single render pass.
 */

/** The verified user id for this request, or null when not signed in. */
export const getSessionUserId = cache(
  async (): Promise<string | null> => readSessionUserId(),
);

/** The verified user id, redirecting to the login page when absent. */
export const requireUserId = cache(async (): Promise<string> => {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login");
  }
  return userId;
});

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
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

  return { id: user.id, email: user.email, name: user.name };
});
