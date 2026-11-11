import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { PlatformSettingError, setAccessRequestRetentionDays } from "@/server/platform-settings";

// UX fidelity D-F3b — POST { days }: how long decided access requests are kept (7–365).
// Super Admin only (iam:manage here; the PlatformSuperAdmin role is asserted in the engine).
// Audited before/after.
const Body = z.object({ days: z.number().int() });

export async function POST(req: Request) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Enter a whole number of days." } }, { status: 400 });
  try {
    const days = await setAccessRequestRetentionDays(guard.ctx, parsed.data.days);
    return NextResponse.json({ data: { days } });
  } catch (e) {
    if (e instanceof PlatformSettingError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === "FORBIDDEN" ? 403 : 400 });
    }
    throw e;
  }
}
