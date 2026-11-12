import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { validationError } from "@/server/errors";
import { TimeZoneBodySchema } from "@/lib/time-zone-schema";
import { setTenantTimeZone, TimeZoneError } from "@/server/preferences";

// UX11 (Q3) — POST { timeZone }: set the tenant's IANA time zone. Super Admin only
// (`iam:manage`, also asserted in the engine). Audited.
const Body = TimeZoneBodySchema;

export async function POST(req: Request) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const timeZone = await setTenantTimeZone(guard.ctx, parsed.data.timeZone);
    return NextResponse.json({ data: { timeZone } });
  } catch (e) {
    if (e instanceof TimeZoneError) {
      return NextResponse.json(
        { error: { code: e.code, message: e.message, ...(e.code === "BAD_ZONE" ? { fields: { timeZone: e.message } } : {}) } },
        { status: e.code === "FORBIDDEN" ? 403 : 400 },
      );
    }
    throw e;
  }
}
