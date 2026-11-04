import "server-only";
import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { mobileIdempotencyKeys } from "@/db/schema";
import { mobileError, mobileJson } from "./http";

/**
 * Optional idempotency support for mobile create routes.
 *
 * A client generates one key per queued action and reuses it on every retry.
 * The first successful (2xx) attempt stores its status and JSON body; later
 * attempts with the same key and body replay that response instead of running
 * the handler again. Failures are not stored, so the client can fix the payload
 * and retry with the same key. Keys are always scoped to one user.
 */

const KEY_PATTERN = /^[A-Za-z0-9_:.-]{8,128}$/;
const KEY_HEADER = "Idempotency-Key";
const RETENTION_MS = 48 * 60 * 60 * 1000;

const INVALID_KEY_MESSAGE = "شناسه درخواست معتبر نیست.";
const REUSE_MESSAGE =
  "این شناسه درخواست قبلاً با داده‌های دیگری استفاده شده است.";
const IN_PROGRESS_MESSAGE = "درخواست قبلی در حال پردازش است. کمی بعد دوباره تلاش کنید.";

function hashRequest(method: string, pathname: string, body: string): string {
  return createHash("sha256")
    .update(`${method} ${pathname}\n${body}`)
    .digest("hex");
}

function rejectKey(): Response {
  return mobileJson(
    mobileError(400, "bad_request", INVALID_KEY_MESSAGE),
    400,
  );
}

function inProgress(): Response {
  const response = mobileJson(
    mobileError(409, "request_in_progress", IN_PROGRESS_MESSAGE),
    409,
  );
  response.headers.set("Retry-After", "1");
  return response;
}

/**
 * Runs `handler` at most once successfully for a given (user, key) pair.
 *
 * Without the header the handler runs directly and the database is untouched.
 * With a valid key, a fresh claim is inserted before the handler runs; 2xx
 * responses are stored for replay, while non-2xx responses and thrown errors
 * release the claim so the client can retry.
 */
export async function withIdempotency(
  request: Request,
  userId: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  const key = request.headers.get(KEY_HEADER);
  if (key === null) {
    return handler();
  }

  if (!KEY_PATTERN.test(key)) {
    return rejectKey();
  }

  const url = new URL(request.url);
  const requestHash = hashRequest(
    request.method,
    url.pathname,
    await request.clone().text(),
  );

  const db = getDb();

  // Bound growth without a cron: each claim prunes this user's expired rows.
  await db
    .delete(mobileIdempotencyKeys)
    .where(
      and(
        eq(mobileIdempotencyKeys.userId, userId),
        lt(mobileIdempotencyKeys.expiresAt, sql`now()`),
      ),
    );

  const [claimed] = await db
    .insert(mobileIdempotencyKeys)
    .values({
      userId,
      key,
      requestHash,
      expiresAt: new Date(Date.now() + RETENTION_MS),
    })
    .onConflictDoNothing({
      target: [mobileIdempotencyKeys.userId, mobileIdempotencyKeys.key],
    })
    .returning({ id: mobileIdempotencyKeys.id });

  if (!claimed) {
    const [row] = await db
      .select()
      .from(mobileIdempotencyKeys)
      .where(
        and(
          eq(mobileIdempotencyKeys.userId, userId),
          eq(mobileIdempotencyKeys.key, key),
        ),
      )
      .limit(1);

    if (!row) {
      return inProgress();
    }

    if (row.requestHash !== requestHash) {
      return mobileJson(
        mobileError(422, "idempotency_key_reuse", REUSE_MESSAGE),
        422,
      );
    }

    if (row.responseStatus === null) {
      return inProgress();
    }

    const replayed = mobileJson(row.responseBody, row.responseStatus);
    replayed.headers.set("Idempotency-Replayed", "true");
    return replayed;
  }

  let response: Response;
  try {
    response = await handler();
  } catch (error) {
    await releaseClaim(db, userId, key);
    throw error;
  }

  if (response.status < 200 || response.status >= 300) {
    await releaseClaim(db, userId, key);
    return response;
  }

  const body: unknown = await response.clone().json();
  await db
    .update(mobileIdempotencyKeys)
    .set({ responseStatus: response.status, responseBody: body })
    .where(
      and(
        eq(mobileIdempotencyKeys.userId, userId),
        eq(mobileIdempotencyKeys.key, key),
      ),
    );

  return response;
}

async function releaseClaim(
  db: ReturnType<typeof getDb>,
  userId: string,
  key: string,
): Promise<void> {
  await db
    .delete(mobileIdempotencyKeys)
    .where(
      and(
        eq(mobileIdempotencyKeys.userId, userId),
        eq(mobileIdempotencyKeys.key, key),
      ),
    );
}
