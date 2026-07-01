import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnLogin = req.nextUrl.pathname.startsWith("/login");

  if (!isLoggedIn && !isOnLogin) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return Response.redirect(loginUrl);
  }

  if (isLoggedIn && isOnLogin) {
    return Response.redirect(new URL("/dashboard", req.nextUrl));
  }
});

export const config = {
  // Skip static assets and the NextAuth API routes; everything else is auth-gated.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
