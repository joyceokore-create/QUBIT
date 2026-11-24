import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { setOnboardingPassword, UserAdminError } from "@/server/users";
import { validationError } from "@/server/errors";
import { newPassword, PASSWORD_ERROR_FIELD } from "@/lib/password-schema";

const Body = z.object({ password: newPassword });

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
    return validationError(parsed.error);
  }
  try {
    await setOnboardingPassword(ctx, parsed.data.password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UserAdminError) {
      const field = PASSWORD_ERROR_FIELD[e.code];
      return NextResponse.json(
        { error: { code: e.code, message: e.message, ...(field ? { fields: { [field]: e.message } } : {}) } },
        { status: 400 },
      );
    }
    throw e;
  }
}
