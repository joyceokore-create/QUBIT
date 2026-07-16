import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { listProjectTeams, setProjectTeams } from "@/server/resources";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  return NextResponse.json({ data: await listProjectTeams(guard.ctx, id) });
}

const PutBody = z.object({ teamIds: z.array(z.string().uuid()) });

export async function PUT(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const parsed = PutBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  const { id } = await params;
  await setProjectTeams(guard.ctx, id, parsed.data.teamIds);
  return NextResponse.json({ ok: true });
}
