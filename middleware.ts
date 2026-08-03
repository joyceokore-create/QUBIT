import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isOnLogin = pathname.startsWith("/login");
  // Public, unauthenticated routes: the marketing landing, the login page, and the invite
  // accept page (M-O3) — an invitee has no session by definition; their 256-bit token is
  // the capability, checked server-side by consumeInviteToken.
  const isPublic = pathname === "/" || isOnLogin || pathname.startsWith("/onboarding/accept");

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
  // Skip static assets, the NextAuth API routes, and the MACHINE routes — the cron
  // endpoint and inbound webhooks carry no session by design; their own guards
  // (CRON_SECRET bearer, HMAC signature) are the real authentication, and a login
  // redirect would just read as a mysterious 30x to the calling machine.
  // api/onboarding/accept is public for the same reason the page is (M-O3): the invitee
  // has no session, and a middleware redirect would answer their POST with a 30x instead
  // of JSON. Its own guard is the token + per-IP rate limit.
  matcher: [
    "/((?!api/auth|api/internal|api/webhooks|api/onboarding/accept|_next/static|_next/image|favicon.ico).*)",
  ],
};
