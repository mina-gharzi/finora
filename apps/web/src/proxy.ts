import { NextResponse, type NextRequest } from "next/server";
import {
  DASHBOARD_ROUTE,
  LANDING_ROUTE,
  MIN_SESSION_SECRET_LENGTH,
  PUBLIC_API_ROUTES,
  PUBLIC_ROUTES,
  SESSION_COOKIE_NAME,
  TOKEN_ROUTES,
} from "@/lib/auth-constants";
import { verifySessionToken } from "@/lib/session-token";

/**
 * Optimistic route guard. It checks the signed session cookie to keep
 * unauthenticated users out of the app (and signed-in users off the auth
 * pages), while letting anyone read the public landing page at `/` (signed-in
 * visitors there are redirected to the dashboard). It is NOT the authorization
 * boundary — every server action and data read re-verifies the session in the
 * Data Access Layer.
 *
 * The signing secret is validated with exactly the same rules the server-side
 * session reader applies (trimmed, at least
 * `MIN_SESSION_SECRET_LENGTH` characters): a missing or weak secret must fail
 * closed here too, so the proxy never attempts HMAC verification with a key
 * the rest of the application would refuse to use.
 */
const MOBILE_API_ROUTES = [
  "/api/mobile/auth/login",
  "/api/mobile/overview",
] as const;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Token pages (verification, password reset) are reachable whether or not
  // a session exists: the emailed link may be opened in any browser.
  if ((TOKEN_ROUTES as readonly string[]).includes(pathname)) {
    return NextResponse.next();
  }
  // Unauthenticated operational endpoints (e.g. the health probe) bypass the
  // login redirect entirely; they expose no user data.
  if ((PUBLIC_API_ROUTES as readonly string[]).includes(pathname)) {
    return NextResponse.next();
  }
  if ((MOBILE_API_ROUTES as readonly string[]).includes(pathname)) {
    return NextResponse.next();
  }
  const isPublicRoute = (PUBLIC_ROUTES as readonly string[]).includes(pathname);
  const isLandingRoute = pathname === LANDING_ROUTE;

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const secret = process.env.SESSION_SECRET?.trim() ?? "";
  const userId =
    secret.length >= MIN_SESSION_SECRET_LENGTH
      ? await verifySessionToken(token, secret)
      : null;

  // Anonymous visitors may read the landing page; signed-in visitors skip it
  // and land directly on the dashboard.
  if (isLandingRoute) {
    return userId
      ? NextResponse.redirect(new URL(DASHBOARD_ROUTE, request.url))
      : NextResponse.next();
  }

  if (!isPublicRoute && !userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Signed-in users are kept off the auth pages — EXCEPT when the login page
  // is the explicitly marked destination for a session the DAL revoked
  // (`?session=expired`). Those cookies still pass this signature check but
  // fail the DAL watermark, so bouncing them back to the dashboard would loop
  // forever.
  const revokedSessionLanding =
    userId && request.nextUrl.searchParams.get("session") === "expired";
  if (isPublicRoute && userId && !revokedSessionLanding) {
    return NextResponse.redirect(new URL(DASHBOARD_ROUTE, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|ttf|woff|woff2)$).*)",
  ],
};
