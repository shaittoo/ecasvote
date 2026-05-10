import { NextRequest, NextResponse } from "next/server";

const SESSION_MAX_AGE = 28800; // 8 hours in seconds

/**
 * Server-side route protection middleware.
 *
 * Only admin and validator routes are protected.
 * Student-facing pages (/studentvoter/candidates, /studentvoter/results)
 * and the landing page (/) are fully public.
 *
 * On every authenticated request the cookie expiry is renewed so the
 * session stays alive as long as the user is active.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const rawRole = request.cookies.get("ecasvote_role")?.value;
  const role = rawRole?.trim().toLowerCase();

  if (pathname.startsWith("/admin")) {
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  if (pathname.startsWith("/validator")) {
    if (role !== "validator") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // Renew cookie expiry on every authenticated request (sliding session)
  const response = NextResponse.next();
  if (role) {
    response.cookies.set("ecasvote_role", role, {
      path: "/",
      maxAge: SESSION_MAX_AGE,
      sameSite: "lax",
    });
  }
  return response;
}

export const config = {
  // Only admin and validator routes are protected.
  // /studentvoter/review-monitor is intentionally public (no auth — dedicated display for voter review).
  matcher: ["/admin/:path*", "/validator/:path*"],
};