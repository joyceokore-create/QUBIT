import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { setOnboardingPassword, UserAdminError } from "@/server/users";

const Body = z.object({ password: z.string().min(1) });

// First-login PASSWORD step (M-O4). Sets the password only — /api/onboarding/finish
// lifts the gate once MFA and confirm-role are done.
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Enter a new password." } }, { status: 400 });
  }
  try {
    await setOnboardingPassword(ctx, parsed.data.password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UserAdminError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}
