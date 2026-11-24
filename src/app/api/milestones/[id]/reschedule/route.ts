import { NextResponse } from "next/server";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { canWriteProject } from "@/lib/access";
import { dayKey } from "@/lib/dates";
import { isDayKey, startOfDayInZone } from "@/lib/list-query";
import { getTenantTimeZone } from "@/server/preferences";
import { milestoneProjectId, MilestoneError, RescheduleMilestoneInput, rescheduleMilestone } from "@/server/milestones";

type Ctx = { params: Promise<{ id: string }> };

const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * UX7 — POST: move an overdue milestone to a new date with a reason (PM Today drawer).
 * PM-level on that project (canWriteProject). The new day is read in the tenant's time zone
 * and stored as the LAST instant of that day, so every overdue check — tenant-day ones and
 * the cockpit's plain `dueDate < now` — agrees the milestone isn't overdue until the day ends.
 */
export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const projectId = await milestoneProjectId(guard.ctx, id);
  if (!projectId) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Milestone not found." } }, { status: 404 });
  if (!(await canWriteProject(guard.ctx, projectId))) return forbidden("Only the project's PM can move its milestones.");

  const parsed = RescheduleMilestoneInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isDayKey(parsed.data.newDate)) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.success ? "Choose a real date." : (parsed.error.issues[0]?.message ?? "Check the details.") } },
      { status: 400 },
    );
  }
  const tz = await getTenantTimeZone(guard.ctx);
  try {
    const m = await rescheduleMilestone(guard.ctx, id, {
      ...parsed.data,
      dueAt: new Date(startOfDayInZone(nextDay(parsed.data.newDate), tz).getTime() - 1),
      todayKey: dayKey(new Date(), tz),
    });
    return NextResponse.json({ data: { id: m.id, dueDate: m.dueDate } });
  } catch (e) {
    if (e instanceof MilestoneError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === "NOT_FOUND" ? 404 : 400 });
    }
    throw e;
  }
}
