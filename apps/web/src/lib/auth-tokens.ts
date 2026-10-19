import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { authTokens, users } from "@/db/schema";
import {
  authTokenExpiry,
  generateAuthToken,
  hashAuthToken,
  type AuthTokenPurpose,
} from "./account-recovery";

/**
 * Data access for single-use auth tokens (email verification, password
 * reset). Only the SHA-256 hash of a token is ever written.
 *
 * ISSUE: runs in a transaction and first removes the user's previous tokens
 * for the same purpose (plus any expired tokens, for every purpose), so at
 * most one live token per user/purpose exists and the table cannot grow
 * unboundedly. There is no background cron: every issue call prunes that
 * user's rows, which bounds growth to one user's recent requests.
 *
 * CONSUME: a single conditional UPDATE ("compare and set" on `consumed_at`)
 * — no read-then-write window — so two concurrent requests can never both
 * succeed. The purpose is part of the WHERE clause, so a token minted for
 * one flow cannot be spent in the other.
 */

export interface IssuedAuthToken {
  /** Raw token for the emailed link. Shown once, never stored. */
  rawToken: string;
  expiresAt: Date;
}

export async function issueAuthToken(
  userId: string,
  purpose: AuthTokenPurpose,
): Promise<IssuedAuthToken> {
  const rawToken = generateAuthToken();
  const tokenHash = hashAuthToken(rawToken);
  const expiresAt = authTokenExpiry(purpose);

  await getDb().transaction(async (tx) => {
    await tx
      .delete(authTokens)
      .where(
        and(
          eq(authTokens.userId, userId),
          or(
            eq(authTokens.purpose, purpose),
            lt(authTokens.expiresAt, sql`now()`),
          ),
        ),
      );

    await tx
      .insert(authTokens)
      .values({ userId, purpose, tokenHash, expiresAt });
  });

  return { rawToken, expiresAt };
}

/**
 * Consumes the token in a single atomic statement.
 *
 * Returns the owning user id when this call was the first to consume a live,
 * correctly-purposed token, or null for anything else (unknown, expired,
 * already consumed, or issued for the other purpose). The single UPDATE
 * guarantees exactly one winner under concurrency.
 */
export async function consumeAuthToken(
  rawToken: string,
  purpose: AuthTokenPurpose,
): Promise<string | null> {
  const tokenHash = hashAuthToken(rawToken);

  const [row] = await getDb()
    .update(authTokens)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.consumedAt),
        sql`${authTokens.expiresAt} > now()`,
      ),
    )
    .returning({ userId: authTokens.userId });

  return row?.userId ?? null;
}

/**
 * Deletes every live token for a user and purpose without consuming it.
 * Used to roll back an issued token when its email could not be delivered,
 * so an undeliverable link never stays live in the database.
 */
export async function discardAuthToken(
  userId: string,
  purpose: AuthTokenPurpose,
): Promise<void> {
  await getDb()
    .delete(authTokens)
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.consumedAt),
      ),
    );
}

/**
 * Atomically consumes a password-reset token and replaces the owner's
 * password hash, raising `auth_valid_after` so every previously issued
 * session token stops authenticating. Either both effects land or neither
 * does (a crash mid-flow leaves the token unconsumed, never a consumed
 * token with the old password). Returns the user id, or null when the token
 * was not consumable.
 */
export async function consumePasswordResetTokenAndSetPassword(
  rawToken: string,
  passwordHash: string,
): Promise<string | null> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(authTokens)
      .set({ consumedAt: sql`now()` })
      .where(
        and(
          eq(authTokens.tokenHash, hashAuthToken(rawToken)),
          eq(authTokens.purpose, "password_reset"),
          isNull(authTokens.consumedAt),
          sql`${authTokens.expiresAt} > now()`,
        ),
      )
      .returning({ userId: authTokens.userId });

    if (!row) {
      return null;
    }

    await tx
      .update(users)
      .set({ passwordHash, authValidAfter: sql`now()` })
      .where(eq(users.id, row.userId));

    return row.userId;
  });
}

/**
 * Atomically consumes an email-verification token and records the verified
 * timestamp (only if it was still NULL — already-verified accounts keep
 * their original timestamp, making repeated verification idempotent).
 */
export async function consumeEmailVerifyToken(
  rawToken: string,
): Promise<string | null> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(authTokens)
      .set({ consumedAt: sql`now()` })
      .where(
        and(
          eq(authTokens.tokenHash, hashAuthToken(rawToken)),
          eq(authTokens.purpose, "email_verify"),
          isNull(authTokens.consumedAt),
          sql`${authTokens.expiresAt} > now()`,
        ),
      )
      .returning({ userId: authTokens.userId });

    if (!row) {
      return null;
    }

    await tx
      .update(users)
      .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
      .where(eq(users.id, row.userId));

    return row.userId;
  });
}
