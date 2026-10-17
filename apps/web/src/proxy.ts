import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_ROUTES, SESSION_COOKIE_NAME } from "@/lib/auth-constants";
import { verifySessionToken } from "@/lib/session-token";

/**
 * Optimistic route guard. It checks the signed session cookie to keep
 * unauthenticated users out of the app (and signed-in users off the auth
 * pages), but it is NOT the authorization boundary — every server action and
 * data read re-verifies the session in the Data Access Layer.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute = (PUBLIC_ROUTES as readonly string[]).includes(pathname);

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const userId = await verifySessionToken(
    token,
    process.env.SESSION_SECRET ?? "",
  );

  if (!isPublicRoute && !userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isPublicRoute && userId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|ttf|woff|woff2)$).*)",
  ],
};
