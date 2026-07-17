import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { canManageTeam } from "@/lib/access";
import { updateTeam, deleteTeam, getTeam, UpdateTeamInput, TeamError } from "@/server/teams";

type Ctx = { params: Promise<{ id: string }> };

// PROMPT §5: managing a team (rename/archive/delete) is allowed for SuperAdmin + heads
// (teams:manage:all) or the team's lead — enforced server-side per action via canManageTeam.
function forbidden() {
  return NextResponse.json(
    { error: { code: "FORBIDDEN", message: "Only the team lead, a head, or a super admin can manage this team." } },
    { status: 403 },
  );
}

export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("admin:access");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const team = await getTeam(guard.ctx, id);
  if (!team) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Team not found." } }, { status: 404 });
  return NextResponse.json({ data: team });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("admin:access");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canManageTeam(guard.ctx, id))) return forbidden();
  const parsed = UpdateTeamInput.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  try {
    await updateTeam(guard.ctx, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TeamError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("admin:access");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canManageTeam(guard.ctx, id))) return forbidden();
  await deleteTeam(guard.ctx, id);
  return NextResponse.json({ ok: true });
}
