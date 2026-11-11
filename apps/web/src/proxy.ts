import { NextResponse, type NextRequest } from "next/server";

// Only a routing hint: real authorization is enforced by the API on every request.
// A refresh-token cookie means "probably signed in"; the client silently refreshes the
// short-lived access token and falls back to /login if the session is really gone.
const SESSION_COOKIE = "bs_rt";
const PROTECTED = ["/feed"];
const AUTH_PAGES = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (pathname === "/") {
    return NextResponse.redirect(new URL(hasSession ? "/feed" : "/login", request.url));
  }
  if (!hasSession && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (hasSession && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL("/feed", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/feed/:path*", "/login", "/register"],
};
