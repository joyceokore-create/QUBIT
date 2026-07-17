"use server";

import { signOut } from "@/lib/auth";

/**
 * Server-action sign-out. More reliable than the client `signOut()` from `next-auth/react`:
 * it runs the full clear-cookie + redirect on the server (a form submit), so it can't be
 * aborted by the dropdown menu unmounting mid-request, and it behaves correctly behind the
 * reverse proxy. Wire it via `<form action={signOutAction}>`.
 */
export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
