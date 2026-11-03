import { NextResponse } from "next/server";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "@/lib/account-recovery";
import { verifyMobileBearerToken } from "@/lib/mobile/auth";
import { isEmailVerifiedFor } from "@/lib/users";

/**
 * Shared HTTP helpers for the versioned mobile API. Every response is marked
 * `no-store`: these endpoints carry bearer and refresh tokens, so a cache must
 * never retain them.
 */

/** JSON response that must never be cached by an intermediary or the client. */
export function mobileJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Stable error envelope shared by every `/api/v1` route. */
export function mobileError(
  _status: number,
  code: string,
  message: string,
): { error: string; message: string } {
  return { error: code, message };
}

const UNAUTHORIZED_MESSAGE = "نشست شما معتبر نیست. لطفاً دوباره وارد شوید.";

export type MobileRequestAuth =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Resolves the caller's owner id from the Bearer access token. Every `/api/v1`
 * route starts with this guard, so a missing/invalid token yields the same
 * `401 { error: "unauthorized" }` envelope instead of reaching domain code.
 */
export async function authenticateMobileRequest(
  request: Request,
): Promise<MobileRequestAuth> {
  const auth = await verifyMobileBearerToken(
    request.headers.get("authorization"),
  );
  if (!auth.ok) {
    return {
      ok: false,
      response: mobileJson(
        mobileError(401, "unauthorized", UNAUTHORIZED_MESSAGE),
        401,
      ),
    };
  }

  return { ok: true, userId: auth.userId };
}

/**
 * Same as `authenticateMobileRequest`, but also requires a verified email.
 * Mutating routes use this; reads remain available to unverified users, exactly
 * like the web. Unverified callers get the stable `email_not_verified` code.
 */
export async function authenticateVerifiedMobileRequest(
  request: Request,
): Promise<MobileRequestAuth> {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) {
    return auth;
  }

  if (!(await isEmailVerifiedFor(auth.userId))) {
    return {
      ok: false,
      response: mobileJson(
        mobileError(403, "email_not_verified", VERIFY_EMAIL_REQUIRED_MESSAGE),
        403,
      ),
    };
  }

  return { ok: true, userId: auth.userId };
}

const BAD_REQUEST_MESSAGE = "اطلاعات وارد شده معتبر نیست.";
const VALIDATION_FAILED_MESSAGE = "اطلاعات وارد شده معتبر نیست.";
const NOT_FOUND_MESSAGE = "موردی یافت نشد.";
const CONFLICT_MESSAGE = "این عملیات با وضعیت فعلی داده‌ها سازگار نیست.";

/** 400 for a missing, malformed, or structurally invalid JSON body. */
export function mobileBadRequest(
  message = BAD_REQUEST_MESSAGE,
): NextResponse {
  return mobileJson(mobileError(400, "bad_request", message), 400);
}

export type MobileDomainFailure =
  | false
  | {
      ok: false;
      reason?: string;
      fieldErrors?: Record<string, string>;
      [key: string]: unknown;
    };

/**
 * The single translation from a domain-layer failure to an HTTP response.
 *
 * - `fieldErrors` or `reason: "invalid"` → 422 `validation_failed`
 * - `reason: "not_found"` or boolean `false` → 404 `not_found`
 * - any other reason (`duplicate`, `has_transactions`, …) → 409 with that
 *   reason as the error code; extra fields such as `transactionCount` are kept.
 */
export function mapDomainFailure(result: MobileDomainFailure): NextResponse {
  if (result === false) {
    return mobileJson(mobileError(404, "not_found", NOT_FOUND_MESSAGE), 404);
  }

  const { ok: _ok, reason, fieldErrors, ...extra } = result;

  if (fieldErrors || reason === "invalid") {
    return mobileJson(
      {
        error: "validation_failed",
        message: VALIDATION_FAILED_MESSAGE,
        fieldErrors: fieldErrors ?? {},
      },
      422,
    );
  }

  if (reason === "not_found") {
    return mobileJson(mobileError(404, "not_found", NOT_FOUND_MESSAGE), 404);
  }

  return mobileJson(
    {
      error: typeof reason === "string" ? reason : "conflict",
      message: CONFLICT_MESSAGE,
      ...extra,
    },
    409,
  );
}

/**
 * Parses a JSON request body, accepting only a plain object. Malformed JSON,
 * arrays, primitives and empty bodies all yield `null` instead of throwing, so
 * callers answer with the generic 400.
 */
export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  return body as Record<string, unknown>;
}
