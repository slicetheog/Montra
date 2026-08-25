import { NextRequest, NextResponse } from "next/server";
import { isSameOriginRequest } from "@/server/auth/origin";

const SESSION_COOKIE = "montra_session";
const PUBLIC_APP_PATHS = ["/login", "/register"];

/**
 * Edge middleware does two cheap, non-authoritative jobs:
 *  1. CSRF defense-in-depth: reject cross-origin mutating /api requests.
 *  2. "Optimistic" auth redirects for page routes, purely for UX (bounce a
 *     clearly-logged-out visitor away from /dashboard before it renders).
 *
 * Neither of these is the source of truth for authorization — middleware
 * runs on the Edge runtime and can't reach Postgres, so it only checks
 * whether a session cookie is *present*. Every Server Component and API
 * route independently calls requireSessionUser()/getSessionUser(), which
 * validates the token against the database. That's the real gate.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
    }
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublicAuthPath = PUBLIC_APP_PATHS.includes(pathname);

  if (!hasSessionCookie && isAppRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (hasSessionCookie && isPublicAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

function isAppRoute(pathname: string): boolean {
  return [
    "/dashboard",
    "/budget",
    "/accounts",
    "/goals",
    "/recurring",
    "/debt",
    "/reports",
    "/net-worth",
    "/settings",
    "/onboarding",
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
