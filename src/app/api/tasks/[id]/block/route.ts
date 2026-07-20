import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { canWriteTask } from "@/lib/access";
import { flagTaskBlocked, unflagTaskBlocked, TaskError } from "@/server/project-tasks";

/** Phase 6.1 blocked-as-flag: POST flags the task blocked (creates a linked Open Blocker —
 * a reason is required), DELETE unflags it (resolves the linked blocker). */

type Ctx = { params: Promise<{ id: string }> };

const FlagBody = z.object({
  description: z.string().min(1).max(500),
  severity: z.enum(["Low", "Medium", "Critical"]).optional(),
});

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canWriteTask(guard.ctx, id))) {
    return forbidden("You can only flag tasks assigned to you or on a project you're part of.");
  }
  const parsed = FlagBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "A blocked reason (max 500 chars) is required." } },
      { status: 400 },
    );
  }
  try {
    const blocker = await flagTaskBlocked(guard.ctx, id, parsed.data);
    return NextResponse.json({ ok: true, blockerId: blocker.id }, { status: 201 });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === "NOT_FOUND" ? 404 : 400 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canWriteTask(guard.ctx, id))) {
    return forbidden("You can only unflag tasks assigned to you or on a project you're part of.");
  }
  const res = await unflagTaskBlocked(guard.ctx, id);
  return NextResponse.json({ ok: true, resolved: res.resolved });
}
