import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

/**
 * Data access for accounts. Only server code may import this module.
 */

export interface UserCredentials {
  id: string;
  name: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
}

export interface UserIdentity {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: Date | null;
}

/** Returns login credentials for an email, or null. Email must be normalized. */
export async function findUserByEmail(
  email: string,
): Promise<UserCredentials | null> {
  const [row] = await getDb()
    .select({
      id: users.id,
      name: users.name,
      passwordHash: users.passwordHash,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return row ?? null;
}

/** Returns the public identity for an id, or null. Excludes the password hash. */
export async function findUserById(id: string): Promise<UserIdentity | null> {
  const [row] = await getDb()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return row ?? null;
}

/**
 * Session-invalidation watermark for a user, or null when the account no
 * longer exists. A session token is only valid when its JWT `iat` is at or
 * after this timestamp; `null` means no reset has invalidated anything.
 */
export async function findUserAuthValidAfter(
  id: string,
): Promise<{ authValidAfter: Date | null } | null> {
  const [row] = await getDb()
    .select({ authValidAfter: users.authValidAfter })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return row ?? null;
}

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<{ id: string }> {
  const [row] = await getDb()
    .insert(users)
    .values(input)
    .returning({ id: users.id });

  return row;
}

/**
 * True once the user has proven control of their address. A missing account
 * counts as unverified (the caller already holds a session; the user row is
 * gone, so no privileged write should proceed).
 */
export async function isEmailVerifiedFor(id: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return Boolean(row?.emailVerifiedAt);
}

/**
 * Records the first successful verification. `COALESCE` keeps the original
 * timestamp for already-verified accounts, so repeated (or concurrent)
 * verifications are idempotent and cannot rewrite history.
 */
export async function markEmailVerified(id: string): Promise<void> {
  await getDb()
    .update(users)
    .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
    .where(eq(users.id, id));
}

/**
 * Replaces a user's password hash and raises the session-invalidation
 * watermark to now, killing every session token issued earlier.
 */
export async function updateUserPassword(
  id: string,
  passwordHash: string,
): Promise<void> {
  await getDb()
    .update(users)
    .set({ passwordHash, authValidAfter: sql`now()` })
    .where(eq(users.id, id));
}
