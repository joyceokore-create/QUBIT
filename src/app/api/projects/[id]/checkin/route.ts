import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { canViewProject } from "@/lib/project-access";
import { canWriteProject } from "@/lib/access";
import { getCurrentCheckIn, getCheckInProvenance, confirmCheckIn, ConfirmCheckInInput } from "@/server/checkins";

// The Friday check-in (M2). GET: this week's draft/confirmed view (any project viewer —
// global read). POST: confirm — PM-level, same resource gate as publishing (canWriteProject:
// lead / PM member / heads / superadmin), consistent with DM1.15 №3.

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await params;
  if (!(await canViewProject(ctx, id))) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const [view, provenance, canConfirm] = await Promise.all([
    getCurrentCheckIn(ctx, id),
    getCheckInProvenance(ctx, id),
    canWriteProject(ctx, id),
  ]);
  return NextResponse.json({ data: { ...view, canConfirm, provenance } });
}

export async function POST(req: Request, { params }: Ctx) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await params;
  if (!(await canWriteProject(ctx, id))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Confirming a check-in is PM-level." } }, { status: 403 });
  }
  const parsed = ConfirmCheckInInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid check-in." } },
      { status: 400 },
    );
  }
  const view = await confirmCheckIn(ctx, id, parsed.data);
  return NextResponse.json({ data: { ...view, canConfirm: true } }, { status: 201 });
}
