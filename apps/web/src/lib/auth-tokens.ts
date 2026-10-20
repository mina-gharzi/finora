import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { authTokens, users } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import {
  authTokenExpiry,
  generateAuthToken,
  hashAuthToken,
  type AuthTokenPurpose,
} from "./account-recovery";

/**
 * Data access for single-use auth tokens (email verification, password
 * reset, email change). Only the SHA-256 hash of a token is ever written.
 *
 * ISSUE: runs in a transaction and first removes the user's previous tokens
 * for the same purpose (plus any expired tokens, for every purpose), so at
 * most one live token per user/purpose exists and the table cannot grow
 * unboundedly. There is no background cron: every issue call prunes that
 * user's rows, which bounds growth to one user's recent requests. For
 * `email_change` the requested address travels in `target_email`, so a newer
 * request both supersedes and replaces the previous one's destination.
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

/**
 * Issues a token. `targetEmail` is REQUIRED for the `email_change` purpose —
 * the database CHECK enforces it — and must be omitted for every other
 * purpose (the same CHECK forbids a target there). The address is stored
 * already normalized by `emailSchema`.
 */
export async function issueAuthToken(
  userId: string,
  purpose: AuthTokenPurpose,
  targetEmail?: string,
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
      .values({
        userId,
        purpose,
        tokenHash,
        targetEmail: targetEmail ?? null,
        expiresAt,
      });
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

export type EmailChangeCompletion =
  /** The token was live and the address applied; sessions are now stale. */
  | { status: "changed"; userId: string }
  /** Unknown, expired, already consumed, or issued for another purpose. */
  | { status: "invalid" }
  /**
   * Another account claimed the target address between issuance and
   * completion. The whole transaction — token included — has rolled back, so
   * nothing about either account was modified.
   */
  | { status: "taken" };

/**
 * Atomically consumes an email-change token and applies its bound address.
 *
 * One transaction holds both effects: the conditional UPDATE on the token
 * (single-use CAS) and the users UPDATE that writes `email`, marks the new
 * address verified (COALESCE keeps an already-verified account's original
 * timestamp — the link itself is proof of control of the NEW address) and
 * raises `auth_valid_after` so every previously issued session stops
 * authenticating.
 *
 * The users UPDATE re-checks availability through the unique index at
 * completion time — not just when the token was issued. If the address was
 * claimed meanwhile, the unique violation aborts the transaction, which
 * rolls back the consume as well: the token is NOT spent, neither account is
 * touched, and the caller reports `taken`.
 */
export async function consumeEmailChangeTokenAndSetEmail(
  rawToken: string,
): Promise<EmailChangeCompletion> {
  try {
    return await getDb().transaction(async (tx): Promise<EmailChangeCompletion> => {
      const [row] = await tx
        .update(authTokens)
        .set({ consumedAt: sql`now()` })
        .where(
          and(
            eq(authTokens.tokenHash, hashAuthToken(rawToken)),
            eq(authTokens.purpose, "email_change"),
            isNull(authTokens.consumedAt),
            sql`${authTokens.expiresAt} > now()`,
          ),
        )
        .returning({
          userId: authTokens.userId,
          targetEmail: authTokens.targetEmail,
        });

      // A live email_change row always has a target (database CHECK); the
      // null guard covers a defeated check without ever applying NULL.
      if (!row || !row.targetEmail) {
        return { status: "invalid" };
      }

      await tx
        .update(users)
        .set({
          email: row.targetEmail,
          emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
          authValidAfter: sql`now()`,
        })
        .where(eq(users.id, row.userId));

      return { status: "changed", userId: row.userId };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { status: "taken" };
    }
    throw error;
  }
}

export type EmailChangeTokenState =
  /** Still spendable; `targetEmail` carries its destination. */
  | { state: "live"; targetEmail: string }
  | { state: "consumed" }
  | { state: "expired" }
  | { state: "absent" };

/**
 * Read-only view of an emailed email-change link, for rendering the
 * confirmation page (and for naming the right failure after a lost race).
 * Never consumes anything — GET renders and prefetches must stay harmless.
 * A token of a different purpose is indistinguishable from an unknown one:
 * the query is scoped to `email_change`, so other flows' tokens leak nothing.
 */
export async function readEmailChangeToken(
  rawToken: string,
): Promise<EmailChangeTokenState> {
  const [row] = await getDb()
    .select({
      consumedAt: authTokens.consumedAt,
      expiresAt: authTokens.expiresAt,
      targetEmail: authTokens.targetEmail,
    })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, hashAuthToken(rawToken)),
        eq(authTokens.purpose, "email_change"),
      ),
    )
    .limit(1);

  if (!row) {
    return { state: "absent" };
  }
  if (row.consumedAt) {
    return { state: "consumed" };
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return { state: "expired" };
  }
  if (!row.targetEmail) {
    // Unreachable under the table CHECK; treated as unknown rather than
    // ever offering a destinationless confirmation.
    return { state: "absent" };
  }
  return { state: "live", targetEmail: row.targetEmail };
}
