import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional gate: when AUTH_REQUIRED=1, role areas need a Better Auth session cookie.
 * This is only a redirect convenience; real authorization is enforced by the API (and CASL in the UI).
 */
export function middleware(req: NextRequest) {
  if (process.env.AUTH_REQUIRED !== "1") return NextResponse.next();
  const has = req.cookies.getAll().some((c) => c.name.endsWith("session_token"));
  if (has) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin/:path*", "/teacher/:path*", "/student/:path*", "/parent/:path*", "/exam/:path*"] };
