import "server-only";

import type { HeaderReader } from "@/lib/client-ip";
import { resolveSessionAuth } from "@/lib/dal";
import { getSessionSecret } from "@/lib/env";
import {
  INVALID_CREDENTIALS_MESSAGE,
  rateLimitedMessage,
  verifyPasswordLogin,
} from "@/lib/password-login";
import { verifySessionTokenDetails } from "@/lib/session-token";
import { loginSchema } from "@/lib/validation";

export interface MobileLoginUser {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
}

export type MobileLoginResult =
  | { ok: true; user: MobileLoginUser }
  | {
      ok: false;
      status: 400 | 401 | 429;
      message: string;
      retryAfterSeconds?: number;
    };

export async function verifyMobileLoginCredentials(
  emailInput: unknown,
  passwordInput: unknown,
  requestHeaders: HeaderReader,
): Promise<MobileLoginResult> {
  const parsed = loginSchema.safeParse({
    email: emailInput,
    password: passwordInput,
  });

  if (!parsed.success) {
    return { ok: false, status: 400, message: "اطلاعات وارد شده معتبر نیست." };
  }

  const result = await verifyPasswordLogin(
    parsed.data.email,
    parsed.data.password,
    requestHeaders,
  );

  if (!result.ok) {
    if (result.reason === "rate_limited") {
      return {
        ok: false,
        status: 429,
        message: rateLimitedMessage(result.retryAfterSeconds),
        retryAfterSeconds: result.retryAfterSeconds,
      };
    }
    return { ok: false, status: 401, message: INVALID_CREDENTIALS_MESSAGE };
  }

  return {
    ok: true,
    user: {
      id: result.userId,
      name: result.name,
      email: result.email,
      emailVerifiedAt: result.emailVerifiedAt?.toISOString() ?? null,
    },
  };
}

export type MobileAuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 };

/**
 * Verifies a mobile bearer token with the same signature and watermark policy
 * as cookie sessions. The user id is derived only from the verified token.
 */
export async function verifyMobileBearerToken(
  authorization: string | null,
): Promise<MobileAuthResult> {
  if (!authorization) {
    return { ok: false, status: 401 };
  }

  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  const token = match?.[1];
  if (!token) {
    return { ok: false, status: 401 };
  }

  const details = await verifySessionTokenDetails(token, getSessionSecret());
  const resolution = await resolveSessionAuth(details);
  if (resolution.status !== "ok") {
    return { ok: false, status: 401 };
  }

  return { ok: true, userId: resolution.userId };
}
