import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { finishOnboarding, OnboardingIncomplete } from "@/server/users";

/**
 * POST /api/onboarding/finish — the last step of the guided first-login (docs/23 §6.1).
 * The ONLY thing that clears `mustChangePassword`. Prerequisites are verified from the
 * database, so skipping a UI step cannot skip the requirement.
 */
export async function POST() {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  try {
    await finishOnboarding(ctx);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OnboardingIncomplete) {
      return NextResponse.json({ error: { code: "INCOMPLETE", missing: e.missing, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
