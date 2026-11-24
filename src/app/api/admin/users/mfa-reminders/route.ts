import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { MfaReminderError, sendMfaReminders } from "@/server/mfa-reminders";

/**
 * POST /api/admin/users/mfa-reminders — Admin Home › "Send Reminder". Reminds every active
 * user without MFA in the caller's tenant (one per person per 24 hours; one audit row per
 * batch). No body. Needs iam:manage.
 */
export async function POST() {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  try {
    const result = await sendMfaReminders(guard.ctx);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof MfaReminderError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 409 });
    throw e;
  }
}
