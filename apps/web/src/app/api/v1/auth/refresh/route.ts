import type { MobileTokenPair } from "@finora/shared";
import { MOBILE_ACCESS_TOKEN_SECONDS } from "@/lib/auth-constants";
import { enforceLimits, getAuthLimiters } from "@/lib/auth-rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { getSessionSecret } from "@/lib/env";
import {
  mobileError,
  mobileJson,
  readJsonObject,
} from "@/lib/mobile/http";
import { rotateRefreshToken } from "@/lib/mobile/refresh-tokens";
import { rateLimitedMessage } from "@/lib/password-login";
import { signSessionToken } from "@/lib/session-token";

const BAD_REQUEST_MESSAGE = "اطلاعات وارد شده معتبر نیست.";
/** One answer for invalid, expired, reused and password-changed tokens. */
const UNAUTHORIZED_MESSAGE = "نشست شما معتبر نیست. لطفاً دوباره وارد شوید.";

/** Applies the per-address budget shared by refresh and logout. */
async function checkRefreshRateLimit(request: Request) {
  const { refreshIp } = getAuthLimiters();
  const gate = await enforceLimits([
    { limiter: refreshIp, key: getClientIp(request.headers) },
  ]);
  if (gate.allowed) {
    return null;
  }

  const response = mobileJson(
    mobileError(
      429,
      "rate_limited",
      rateLimitedMessage(gate.retryAfterSeconds),
    ),
    429,
  );
  response.headers.set("Retry-After", String(gate.retryAfterSeconds));
  return response;
}

/**
 * POST /api/v1/auth/refresh
 *
 * Rotates an opaque refresh token. Every failure reason is collapsed into the
 * same 401 so a caller cannot distinguish a reused token from an expired one.
 */
export async function POST(request: Request) {
  const limited = await checkRefreshRateLimit(request);
  if (limited) {
    return limited;
  }

  const body = await readJsonObject(request);
  const refreshToken = body?.refreshToken;
  if (!body || typeof refreshToken !== "string" || refreshToken === "") {
    return mobileJson(mobileError(400, "bad_request", BAD_REQUEST_MESSAGE), 400);
  }

  const result = await rotateRefreshToken(refreshToken);
  if (!result.ok) {
    return mobileJson(
      mobileError(401, "unauthorized", UNAUTHORIZED_MESSAGE),
      401,
    );
  }

  const accessToken = await signSessionToken(
    result.userId,
    getSessionSecret(),
    MOBILE_ACCESS_TOKEN_SECONDS,
  );
  const response: MobileTokenPair = {
    accessToken,
    accessTokenExpiresAt: new Date(
      Date.now() + MOBILE_ACCESS_TOKEN_SECONDS * 1000,
    ).toISOString(),
    refreshToken: result.next.rawToken,
    refreshTokenExpiresAt: result.next.expiresAt.toISOString(),
  };

  return mobileJson(response);
}
