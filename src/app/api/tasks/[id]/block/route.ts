import { NextResponse } from "next/server";
import { formMessages as m } from "@/lib/form-messages";
import { validationError } from "@/server/errors";
import { z } from "zod";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { canWriteTask } from "@/lib/access";
import { flagTaskBlocked, unflagTaskBlocked, TaskError } from "@/server/project-tasks";
import { getTenantTimeZone } from "@/server/preferences";
import { isDayKey, startOfDayInZone } from "@/lib/list-query";
import { dayKey } from "@/lib/dates";

/** Phase 6.1 blocked-as-flag: POST flags the task blocked (creates a linked Open Blocker —
 * a reason is required), DELETE unflags it (resolves the linked blocker). */

type Ctx = { params: Promise<{ id: string }> };

const FlagBody = z.object({
  description: z.string().trim().min(1, "Say what is blocking this task.").max(500, m.maxLength("the reason", 500)),
  severity: z.enum(["Low", "Medium", "Critical"]).optional(),
  // UX6 "Raise a blocker": who can unblock it (someone on the project — checked in the
  // engine) and the tenant-local day it started ("YYYY-MM-DD").
  unblockerId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).nullish(),
  since: z.string().refine(isDayKey, "since must be a YYYY-MM-DD day").optional(),
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
    return validationError(parsed.error);
  }
  try {
    const { since, unblockerId, ...rest } = parsed.data;
    // A start day of today means "now"; an earlier day means the start of that day in the
    // tenant's zone (U5), so "since Monday" reads Monday wherever the server runs.
    const now = new Date();
    const tz = since ? await getTenantTimeZone(guard.ctx) : null;
    const sinceAt = since && tz && since !== dayKey(now, tz) ? startOfDayInZone(since, tz) : undefined;
    const blocker = await flagTaskBlocked(guard.ctx, id, { ...rest, unblockerId: unblockerId ?? null, since: sinceAt }, now);
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
