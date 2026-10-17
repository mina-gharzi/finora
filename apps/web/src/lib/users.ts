import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

/**
 * Data access for accounts. Only server code may import this module.
 */

export interface UserCredentials {
  id: string;
  name: string;
  passwordHash: string;
}

export interface UserIdentity {
  id: string;
  email: string;
  name: string;
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
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return row ?? null;
}

/** Returns the public identity for an id, or null. Excludes the password hash. */
export async function findUserById(id: string): Promise<UserIdentity | null> {
  const [row] = await getDb()
    .select({ id: users.id, email: users.email, name: users.name })
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
