import { verifyMobileBearerToken } from "@/lib/mobile/auth";
import { mobileError, mobileJson } from "@/lib/mobile/http";
import { revokeAllRefreshTokensForUser } from "@/lib/mobile/refresh-tokens";
import { revokeAllUserSessions } from "@/lib/users";

const UNAUTHORIZED_MESSAGE = "نشست شما معتبر نیست. لطفاً دوباره وارد شوید.";

/**
 * POST /api/v1/auth/logout-all
 *
 * Signs the user out of every device and the web: the session watermark is
 * raised (invalidating access tokens and cookies) and all refresh tokens are
 * revoked. Requires a currently valid Bearer access token.
 */
export async function POST(request: Request) {
  const auth = await verifyMobileBearerToken(
    request.headers.get("authorization"),
  );
  if (!auth.ok) {
    return mobileJson(
      mobileError(401, "unauthorized", UNAUTHORIZED_MESSAGE),
      401,
    );
  }

  await Promise.all([
    revokeAllUserSessions(auth.userId),
    revokeAllRefreshTokensForUser(auth.userId),
  ]);

  return mobileJson({ ok: true });
}
