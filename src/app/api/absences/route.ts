import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { can } from "@/lib/rbac";
import { AbsenceError, CreateAbsenceInput, createAbsence, listAbsences } from "@/server/absence";

// GET  /api/absences?userId= — who is away (defaults to the next 30 days)
// POST /api/absences         — record an absence by hand (docs/16 §5 manual path)
//
// Reading is open to anyone who can see people — knowing a colleague is away is not
// sensitive within a tenant, and every surface that reacts to leave needs it. WRITING
// is gated on iam:manage (people admins) or project:update (PMs, who staff the work):
// leave is an HR fact, not something a peer edits.

export async function GET(req: Request) {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;
  const userId = new URL(req.url).searchParams.get("userId") ?? undefined;
  return NextResponse.json({
    data: await listAbsences(guard.ctx, { userId }),
    canEdit: can(guard.ctx, "iam:manage") || can(guard.ctx, "project:update"),
  });
}

export async function POST(req: Request) {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;
  if (!(can(guard.ctx, "iam:manage") || can(guard.ctx, "project:update"))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const parsed = CreateAbsenceInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input." } },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({ data: await createAbsence(guard.ctx, parsed.data) });
  } catch (e) {
    if (e instanceof AbsenceError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === "NOT_FOUND" ? 404 : 400 });
    }
    throw e;
  }
}
