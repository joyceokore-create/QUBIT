import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { canViewProject } from "@/lib/project-access";
import { canWriteProject } from "@/lib/access";
import {
  getCurrentCheckIn,
  getCheckInProvenance,
  confirmCheckIn,
  saveCheckInDraft,
  ConfirmCheckInInput,
  SaveCheckInDraftInput,
  CheckInError,
} from "@/server/checkins";

// The weekly check-in (M2 → Milestone A). GET: this week's draft/confirmed view (any
// project viewer — global read). POST: "Confirm & send to Head" — confirms AND submits in
// one transaction. PATCH: "Save draft" — keeps the line/RAG without confirming. Both
// writes are PM-level, the same resource gate as publishing (canWriteProject: lead / PM
// member / heads / superadmin), consistent with DM1.15 №3.

type Ctx = { params: Promise<{ id: string }> };

async function resolveCtx() {
  try {
    return { ctx: await getTenantContext() };
  } catch {
    return { response: NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }) };
  }
}

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await resolveCtx();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!(await canViewProject(auth.ctx, id))) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const [view, provenance, canConfirm] = await Promise.all([
    getCurrentCheckIn(auth.ctx, id),
    getCheckInProvenance(auth.ctx, id),
    canWriteProject(auth.ctx, id),
  ]);
  return NextResponse.json({ data: { ...view, canConfirm, provenance } });
}

export async function POST(req: Request, { params }: Ctx) {
  const auth = await resolveCtx();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!(await canWriteProject(auth.ctx, id))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Confirming a check-in is PM-level." } }, { status: 403 });
  }
  const parsed = ConfirmCheckInInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid check-in." } },
      { status: 400 },
    );
  }
  const view = await confirmCheckIn(auth.ctx, id, parsed.data);
  return NextResponse.json({ data: { ...view, canConfirm: true } }, { status: 201 });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await resolveCtx();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!(await canWriteProject(auth.ctx, id))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Saving a draft is PM-level." } }, { status: 403 });
  }
  const parsed = SaveCheckInDraftInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid draft." } },
      { status: 400 },
    );
  }
  try {
    const view = await saveCheckInDraft(auth.ctx, id, parsed.data);
    return NextResponse.json({ data: { ...view, canConfirm: true } });
  } catch (e) {
    if (e instanceof CheckInError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 409 });
    }
    throw e;
  }
}
