import type { MobileAuthLoginResponse } from "@finora/shared";
import { MOBILE_ACCESS_TOKEN_SECONDS } from "@/lib/auth-constants";
import { getSessionSecret } from "@/lib/env";
import { verifyMobileLoginCredentials } from "@/lib/mobile/auth";
import {
  mobileError,
  mobileJson,
  readJsonObject,
} from "@/lib/mobile/http";
import { issueRefreshToken } from "@/lib/mobile/refresh-tokens";
import { signSessionToken } from "@/lib/session-token";

const BAD_REQUEST_MESSAGE = "اطلاعات وارد شده معتبر نیست.";

/**
 * POST /api/v1/auth/login
 *
 * Authenticates an email/password pair through the shared credential check
 * (which owns the login rate limits), then issues a short-lived access JWT and
 * a rotating opaque refresh token for the device.
 */
export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) {
    return mobileJson(mobileError(400, "bad_request", BAD_REQUEST_MESSAGE), 400);
  }

  const { email, password, deviceName } = body;
  const result = await verifyMobileLoginCredentials(
    email,
    password,
    request.headers,
  );

  if (!result.ok) {
    if (result.status === 429) {
      return mobileJson(
        mobileError(429, "rate_limited", result.message),
        429,
      );
    }
    if (result.status === 400) {
      return mobileJson(
        mobileError(400, "bad_request", result.message),
        400,
      );
    }
    return mobileJson(
      mobileError(401, "unauthorized", result.message),
      401,
    );
  }

  const accessToken = await signSessionToken(
    result.user.id,
    getSessionSecret(),
    MOBILE_ACCESS_TOKEN_SECONDS,
  );
  const refresh = await issueRefreshToken(result.user.id, {
    deviceName: typeof deviceName === "string" ? deviceName : undefined,
  });

  const response: MobileAuthLoginResponse = {
    accessToken,
    accessTokenExpiresAt: new Date(
      Date.now() + MOBILE_ACCESS_TOKEN_SECONDS * 1000,
    ).toISOString(),
    refreshToken: refresh.rawToken,
    refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
    user: result.user,
  };

  return mobileJson(response);
}
