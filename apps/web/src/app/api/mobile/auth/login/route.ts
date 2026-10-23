import { NextResponse } from "next/server";
import type { MobileLoginResponse } from "@finora/shared";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth-constants";
import { getSessionSecret } from "@/lib/env";
import { verifyMobileLoginCredentials } from "@/lib/mobile/auth";
import { signSessionToken } from "@/lib/session-token";

const NO_STORE = { "Cache-Control": "no-store" };

function errorResponse(
  status: 400 | 401 | 429,
  error: "bad_request" | "unauthorized" | "rate_limited",
  message: string,
) {
  return NextResponse.json(
    { error, message },
    { status, headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "bad_request", "اطلاعات وارد شده معتبر نیست.");
  }

  if (typeof body !== "object" || body === null) {
    return errorResponse(400, "bad_request", "اطلاعات وارد شده معتبر نیست.");
  }

  const { email, password } = body as { email?: unknown; password?: unknown };
  const result = await verifyMobileLoginCredentials(
    email,
    password,
    request.headers,
  );

  if (!result.ok) {
    if (result.status === 429) {
      return errorResponse(429, "rate_limited", result.message);
    }
    if (result.status === 400) {
      return errorResponse(400, "bad_request", result.message);
    }
    return errorResponse(401, "unauthorized", result.message);
  }

  const token = await signSessionToken(result.user.id, getSessionSecret());
  const expiresAt = new Date(
    Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  ).toISOString();

  const response: MobileLoginResponse = {
    token,
    expiresAt,
    user: result.user,
  };

  return NextResponse.json(response, { status: 200, headers: NO_STORE });
}
