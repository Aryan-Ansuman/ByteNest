import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_COOKIE_NAME } from "@/lib/auth-cookie";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const roomSessionRoute =
    /^\/rooms\/[^/]+$/.test(pathname) &&
    pathname !== "/rooms/create" &&
    !pathname.startsWith("/rooms/join/");

  if (roomSessionRoute && !request.cookies.get(AUTH_COOKIE_NAME)?.value) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next()
}
 
// See "Matching Paths" below to learn more
export const config = {
  /* match all request paths except for the the ones that starts with:
  - api
  - _next/static
  - _next/image
  - favicon.com

  */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
}
