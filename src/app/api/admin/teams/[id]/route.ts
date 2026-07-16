import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { updateTeam, deleteTeam, getTeam, UpdateTeamInput, TeamError } from "@/server/teams";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const team = await getTeam(guard.ctx, id);
  if (!team) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Team not found." } }, { status: 404 });
  return NextResponse.json({ data: team });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  const parsed = UpdateTeamInput.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  try {
    const { id } = await params;
    await updateTeam(guard.ctx, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TeamError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  await deleteTeam(guard.ctx, id);
  return NextResponse.json({ ok: true });
}
