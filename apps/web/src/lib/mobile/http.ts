import { NextResponse } from "next/server";
import { verifyMobileBearerToken } from "@/lib/mobile/auth";

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
