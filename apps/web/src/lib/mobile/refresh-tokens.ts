import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { mobileRefreshTokens } from "@/db/schema";
import { MOBILE_REFRESH_TOKEN_SECONDS } from "@/lib/auth-constants";
import { generateAuthToken, hashAuthToken } from "@/lib/account-recovery";
import { findUserAuthValidAfter } from "@/lib/users";

/**
 * Data access for opaque mobile refresh tokens. Only the SHA-256 hash is ever
 * stored, so a database leak cannot replay a token. Tokens are grouped into a
 * family per device session: rotation revokes the presented row and inserts a
 * successor in the same family. Presenting an already-rotated row is treated
 * as reuse and revokes the whole family. A password change raises
 * `users.auth_valid_after`, which invalidates tokens created before it.
 */

/** A refresh token is valid for 30 days. */
const REFRESH_TOKEN_TTL_MS = MOBILE_REFRESH_TOKEN_SECONDS * 1000;

/** Longest device label persisted; longer input is truncated, not rejected. */
const MAX_DEVICE_NAME_LENGTH = 64;

export interface IssueRefreshTokenOptions {
  /** Human-readable device label, trimmed and capped at 64 characters. */
  deviceName?: string;
  /** Reuse an existing family (rotation); a fresh family is created otherwise. */
  familyId?: string;
}

export interface IssuedRefreshToken {
  /** Raw token returned to the client once. Never stored. */
  rawToken: string;
  expiresAt: Date;
  familyId: string;
}

export type RotateRefreshTokenResult =
  | {
      ok: true;
      userId: string;
      familyId: string;
      deviceName: string | null;
      next: { rawToken: string; expiresAt: Date };
    }
  | {
      ok: false;
      reason: "invalid" | "expired" | "reused" | "password_changed";
    };

function refreshTokenExpiry(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
}

function normalizeDeviceName(deviceName: string | undefined): string | null {
  const trimmed = deviceName?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, MAX_DEVICE_NAME_LENGTH);
}

/**
 * Issues a refresh token, optionally starting or extending a device family.
 *
 * Pruning runs in the same transaction: the user's expired rows and rows
 * revoked more than seven days ago are deleted, so the table stays bounded
 * without a background job. Only the hash of the new token is inserted.
 */
export async function issueRefreshToken(
  userId: string,
  opts: IssueRefreshTokenOptions = {},
): Promise<IssuedRefreshToken> {
  const rawToken = generateAuthToken();
  const tokenHash = hashAuthToken(rawToken);
  const expiresAt = refreshTokenExpiry();
  const familyId = opts.familyId ?? randomUUID();
  const deviceName = normalizeDeviceName(opts.deviceName);

  await getDb().transaction(async (tx) => {
    await tx
      .delete(mobileRefreshTokens)
      .where(
        and(
          eq(mobileRefreshTokens.userId, userId),
          or(
            lt(mobileRefreshTokens.expiresAt, sql`now()`),
            sql`${mobileRefreshTokens.revokedAt} < now() - interval '7 days'`,
          ),
        ),
      );

    await tx.insert(mobileRefreshTokens).values({
      userId,
      familyId,
      tokenHash,
      deviceName,
      expiresAt,
    });
  });

  return { rawToken, expiresAt, familyId };
}

/**
 * Rotates a refresh token in one transaction.
 *
 * The first statement is a conditional UPDATE ("compare and set"): it only
 * wins when the hash exists, is unrevoked and unexpired, so two concurrent
 * rotations can never both succeed. A winner whose creation precedes the
 * user's password-change watermark is refused and its family revoked. Losing
 * the race is classified afterwards: a revoked row means reuse (revoke the
 * family), an expired row means expiry, and a missing row is simply invalid.
 */
export async function rotateRefreshToken(
  rawToken: string,
): Promise<RotateRefreshTokenResult> {
  const tokenHash = hashAuthToken(rawToken);

  return getDb().transaction(
    async (tx): Promise<RotateRefreshTokenResult> => {
      const [row] = await tx
        .update(mobileRefreshTokens)
        .set({ revokedAt: sql`now()`, lastUsedAt: sql`now()` })
        .where(
          and(
            eq(mobileRefreshTokens.tokenHash, tokenHash),
            isNull(mobileRefreshTokens.revokedAt),
            sql`${mobileRefreshTokens.expiresAt} > now()`,
          ),
        )
        .returning();

      if (row) {
        const user = await findUserAuthValidAfter(row.userId);
        if (
          !user ||
          (user.authValidAfter && row.createdAt < user.authValidAfter)
        ) {
          await tx
            .update(mobileRefreshTokens)
            .set({ revokedAt: sql`now()` })
            .where(
              and(
                eq(mobileRefreshTokens.familyId, row.familyId),
                isNull(mobileRefreshTokens.revokedAt),
              ),
            );
          return { ok: false, reason: "password_changed" };
        }

        const nextRawToken = generateAuthToken();
        const expiresAt = refreshTokenExpiry();
        await tx.insert(mobileRefreshTokens).values({
          userId: row.userId,
          familyId: row.familyId,
          tokenHash: hashAuthToken(nextRawToken),
          deviceName: row.deviceName,
          expiresAt,
        });

        return {
          ok: true,
          userId: row.userId,
          familyId: row.familyId,
          deviceName: row.deviceName,
          next: { rawToken: nextRawToken, expiresAt },
        };
      }

      const [existing] = await tx
        .select()
        .from(mobileRefreshTokens)
        .where(eq(mobileRefreshTokens.tokenHash, tokenHash))
        .limit(1);

      if (!existing) {
        return { ok: false, reason: "invalid" };
      }

      if (existing.revokedAt) {
        await tx
          .update(mobileRefreshTokens)
          .set({ revokedAt: sql`now()` })
          .where(
            and(
              eq(mobileRefreshTokens.familyId, existing.familyId),
              isNull(mobileRefreshTokens.revokedAt),
            ),
          );
        return { ok: false, reason: "reused" };
      }

      return { ok: false, reason: "expired" };
    },
  );
}

/**
 * Revokes the family owning a raw token. Never reveals whether the token or
 * family existed, so callers can use it on logout without leaking validity.
 */
export async function revokeRefreshTokenFamily(rawToken: string): Promise<void> {
  const tokenHash = hashAuthToken(rawToken);

  await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ familyId: mobileRefreshTokens.familyId })
      .from(mobileRefreshTokens)
      .where(eq(mobileRefreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (!row) {
      return;
    }

    await tx
      .update(mobileRefreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(mobileRefreshTokens.familyId, row.familyId),
          isNull(mobileRefreshTokens.revokedAt),
        ),
      );
  });
}

/** Revokes every live refresh token owned by a user (e.g. sign-out everywhere). */
export async function revokeAllRefreshTokensForUser(
  userId: string,
): Promise<void> {
  await getDb()
    .update(mobileRefreshTokens)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(mobileRefreshTokens.userId, userId),
        isNull(mobileRefreshTokens.revokedAt),
      ),
    );
}
