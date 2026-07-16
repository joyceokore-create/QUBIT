import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { createTeam, CreateTeamInput, TeamError } from "@/server/teams";

export async function POST(req: Request) {
  const guard = await requirePermission("iam:manage");
  if ("response" in guard) return guard.response;
  const parsed = CreateTeamInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  }
  try {
    const team = await createTeam(guard.ctx, parsed.data);
    return NextResponse.json({ id: team.id }, { status: 201 });
  } catch (e) {
    if (e instanceof TeamError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    // Unique-name violation surfaces as a Prisma error → 409.
    return NextResponse.json({ error: { code: "CONFLICT", message: "A team with that name already exists." } }, { status: 409 });
  }
}
