import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Phase 3.5 — middleware uses the edge-safe auth config.
//
// Importing from `@/auth` here pulls PrismaAdapter + the DB-backed
// `jwt` callback into the middleware bundle, which crashes at runtime
// because the Edge runtime can't execute Prisma Client without
// Accelerate or a driver adapter. `auth.config.ts` defines a
// providers-empty, DB-free config that's valid on Edge and still
// decodes the JWT cookie into `req.auth` so we can check authn here.
//
// The DB-backed revocation check still happens — it's wired in the
// full `auth.ts` config that server components, actions, and API
// routes import. Middleware is a first line of defense; the RSC layer
// is authoritative.

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/", "/login", "/signup", "/account-suspended"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Forward the pathname so server components / layouts can read it.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  const passthrough = NextResponse.next({ request: { headers: requestHeaders } });

  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/accept-invite") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

  if (isPublic) return passthrough;

  if (!session?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Platform area is gated to platform staff only.
  if (pathname.startsWith("/platform") && !session.user.platformRole) {
    return NextResponse.redirect(new URL("/select-tenant", req.url));
  }

  return passthrough;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
