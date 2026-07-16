import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isOnLogin = pathname.startsWith("/login");
  // Public, unauthenticated routes: the marketing landing and the login page.
  const isPublic = pathname === "/" || isOnLogin;

  if (!isLoggedIn && !isPublic) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return Response.redirect(loginUrl);
  }

  // Note: the "must change password" gate lives in the (app) server layout, not here —
  // custom session-callback fields don't reliably reach req.auth in edge middleware.
  if (isLoggedIn && isOnLogin) {
    return Response.redirect(new URL("/dashboard", req.nextUrl));
  }
});

export const config = {
  // Skip static assets and the NextAuth API routes; everything else is auth-gated.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
