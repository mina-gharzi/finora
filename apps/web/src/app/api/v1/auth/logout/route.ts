import { enforceLimits, getAuthLimiters } from "@/lib/auth-rate-limit";
import { getClientIp } from "@/lib/client-ip";
import {
  mobileError,
  mobileJson,
  readJsonObject,
} from "@/lib/mobile/http";
import { revokeRefreshTokenFamily } from "@/lib/mobile/refresh-tokens";
import { rateLimitedMessage } from "@/lib/password-login";

const BAD_REQUEST_MESSAGE = "اطلاعات وارد شده معتبر نیست.";

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
 * POST /api/v1/auth/logout
 *
 * Revokes the family owning the submitted refresh token. Idempotent and
 * deliberately silent about whether the token existed.
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

  await revokeRefreshTokenFamily(refreshToken);

  return mobileJson({ ok: true });
}
