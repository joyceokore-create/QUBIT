import { withTenant, type TenantContext } from "@/lib/tenant";
import { AGING_BUSINESS_DAYS, businessDaysBetween } from "@/lib/board-lens";

/**
 * QA preset data (docs/17 §5). First question: "what's ready for me to test, and which
 * of my bugs are stuck?" Everything is scoped to the viewer's projects (member or lead)
 * — HeadOfQA-style oversight lives on the executive persona, not here. Aging reuses the
 * board-lens business-day clock so the dashboard and the QA board lens can't disagree
 * (bad > AGING_BUSINESS_DAYS; warn from 3). Requirement coverage became real with
 * M8-C's traceability — the quality strip shows the derived number, never a placeholder.
 */

const day = 86_400_000;
/** Warn band starts at 3 business days; bad past the board-lens threshold (5). */
export const QA_WARN_BUSINESS_DAYS = 3;

export type QaAging = "ok" | "warn" | "bad";

export interface QaQueueItem {
  id: string;
  title: string;
  projectId: string;
  /** TEST for verification work (InReview/InQA/test-phase), BUG for bugs. */
  kind: "test" | "bug";
  ageBusinessDays: number;
  aging: QaAging;
}

export interface QaTriageRow {
  id: string;
  title: string;
  projectId: string;
  projectCode: string;
}

export interface QaProjectGroup {
  projectId: string;
  projectCode: string;
  projectName: string;
  items: QaQueueItem[];
}

export interface QaBugRaised {
  id: string;
  title: string;
  projectId: string;
  projectCode: string;
  severity: string; // Low | Medium | High | Critical (Bugs only, docs/15)
  status: string;
  reopened: boolean;
  raisedDaysAgo: number;
}

export interface QaProjectQuality {
  projectId: string;
  projectName: string;
  /** docs/16 §6 traceability — null when the project captured no requirements. */
  coveragePct: number | null;
  /** OPEN bugs by severity. */
  bySeverity: { critical: number; high: number; medium: number; low: number };
  /** reopened ÷ ever-completed bugs, percent; null before any bug completed. */
  reopenRatePct: number | null;
}

export interface QaDashboard {
  hero: { inQa: number; criticalUnassigned: number; agingOverThreshold: number };
  triage: QaTriageRow[];
  queue: QaProjectGroup[];
  bugsRaised: QaBugRaised[];
  quality: QaProjectQuality[];
}

function agingBand(days: number): QaAging {
  if (days > AGING_BUSINESS_DAYS) return "bad";
  if (days >= QA_WARN_BUSINESS_DAYS) return "warn";
  return "ok";
}

export async function getQaDashboard(ctx: TenantContext, now = new Date()): Promise<QaDashboard> {
  const live = await withTenant(ctx, async (tx) => {
    const [led, memberships] = await Promise.all([
      tx.project.findMany({ where: { leadUserId: ctx.userId }, select: { id: true } }),
      tx.projectMember.findMany({ where: { userId: ctx.userId }, select: { projectId: true } }),
    ]);
    const projectIds = [...new Set([...led.map((p) => p.id), ...memberships.map((m) => m.projectId)])];
    if (!projectIds.length) return { projects: [], queueTasks: [], myBugs: [], projectBugs: [], requirements: [], events: [] };

    const [projects, queueTasks, myBugs, projectBugs, requirements] = await Promise.all([
      tx.project.findMany({
        where: { id: { in: projectIds }, status: { notIn: ["Completed", "Cancelled"] } },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
      // The test queue (17 §5.2): verification work on MY projects — same predicate
      // family as listTasksInTestPhase, scoped.
      tx.projectTask.findMany({
        where: {
          projectId: { in: projectIds },
          status: { not: "Completed" },
          approvalStatus: { not: "Draft" },
          OR: [
            { phase: { contains: "Test", mode: "insensitive" } },
            { phase: { contains: "UAT", mode: "insensitive" } },
            { phase: { contains: "SIT", mode: "insensitive" } },
            { status: { in: ["InReview", "InQA"] } },
            { type: "Bug" },
          ],
        },
        select: {
          id: true, title: true, projectId: true, type: true, status: true,
          severity: true, assigneeId: true, lastActivityAt: true, createdAt: true,
        },
        orderBy: [{ lastActivityAt: "asc" }],
      }),
      // Bugs I raised (17 §5.3) — reporter = me, any status.
      tx.projectTask.findMany({
        where: { type: "Bug", reporterId: ctx.userId, approvalStatus: { not: "Draft" } },
        select: {
          id: true, title: true, projectId: true, status: true, severity: true,
          createdAt: true, project: { select: { code: true } },
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 12,
      }),
      // Every bug on my projects — quality strip counts + reopen denominators.
      tx.projectTask.findMany({
        where: { projectId: { in: projectIds }, type: "Bug", approvalStatus: { not: "Draft" } },
        select: { id: true, projectId: true, status: true, severity: true },
      }),
      // M8-C: requirement coverage per project — a requirement is covered by at least
      // one PUBLISHED task (docs/16 §6).
      tx.requirement.findMany({
        where: { projectId: { in: projectIds }, status: "Accepted" },
        select: { projectId: true, taskLinks: { select: { task: { select: { approvalStatus: true } } } } },
      }),
    ]);

    // Reopen signal: a task.status_changed event leaving Completed (docs/17 §5.3).
    const bugIds = [...new Set([...myBugs.map((b) => b.id), ...projectBugs.map((b) => b.id)])];
    const events = bugIds.length
      ? await tx.domainEvent.findMany({
          where: { entityType: "project_task", entityId: { in: bugIds }, type: { in: ["task.status_changed", "task.completed"] } },
          select: { entityId: true, type: true, payload: true },
        })
      : [];
    return { projects, queueTasks, myBugs, projectBugs, requirements, events };
  });

  const reopenedIds = new Set(
    live.events
      .filter((e) => e.type === "task.status_changed" && (e.payload as { from?: string })?.from === "Completed")
      .map((e) => e.entityId),
  );
  const everCompletedIds = new Set(
    live.events.filter((e) => e.type === "task.completed").map((e) => e.entityId),
  );
  // A bug sitting in Completed counts as completed even without an event (seeded rows).
  for (const b of live.projectBugs) if (b.status === "Completed") everCompletedIds.add(b.id);

  const triage: QaTriageRow[] = [];
  const queueByProject = new Map<string, QaQueueItem[]>();
  const projectById = new Map(live.projects.map((p) => [p.id, p]));

  for (const t of live.queueTasks) {
    const project = projectById.get(t.projectId);
    if (!project) continue; // project completed/cancelled — not test work anymore
    if (t.type === "Bug" && !t.assigneeId && t.severity === "Critical") {
      triage.push({ id: t.id, title: t.title, projectId: t.projectId, projectCode: project.code });
      continue; // triage rows don't repeat in the per-project groups
    }
    const ageBusinessDays = businessDaysBetween(t.lastActivityAt, now);
    const items = queueByProject.get(t.projectId) ?? [];
    items.push({
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      kind: t.type === "Bug" ? "bug" : "test",
      ageBusinessDays,
      aging: agingBand(ageBusinessDays),
    });
    queueByProject.set(t.projectId, items);
  }

  const queue: QaProjectGroup[] = live.projects
    .filter((p) => queueByProject.has(p.id))
    .map((p) => ({
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      // Oldest first inside a group — the thing that's been waiting longest leads.
      items: queueByProject.get(p.id)!.sort((a, b) => b.ageBusinessDays - a.ageBusinessDays),
    }));

  const bugsRaised: QaBugRaised[] = live.myBugs.map((b) => ({
    id: b.id,
    title: b.title,
    projectId: b.projectId,
    projectCode: b.project.code,
    severity: b.severity ?? "Medium",
    status: b.status,
    reopened: reopenedIds.has(b.id),
    raisedDaysAgo: Math.max(0, Math.floor((now.getTime() - b.createdAt.getTime()) / day)),
  }));

  const coverageByProject = new Map<string, number>();
  for (const p of live.projects) {
    const reqs = live.requirements.filter((r) => r.projectId === p.id);
    if (!reqs.length) continue; // no requirements captured → no coverage claim
    const covered = reqs.filter((r) => r.taskLinks.some((l) => l.task.approvalStatus !== "Draft")).length;
    coverageByProject.set(p.id, Math.round((covered / reqs.length) * 100));
  }

  const quality: QaProjectQuality[] = live.projects
    .map((p) => {
      const bugs = live.projectBugs.filter((b) => b.projectId === p.id);
      const coveragePct = coverageByProject.get(p.id) ?? null;
      // A project with neither bugs nor requirements has nothing to say here.
      if (!bugs.length && coveragePct === null) return null;
      const open = bugs.filter((b) => b.status !== "Completed");
      const completed = bugs.filter((b) => everCompletedIds.has(b.id));
      const reopened = bugs.filter((b) => reopenedIds.has(b.id));
      const count = (sev: string) => open.filter((b) => (b.severity ?? "Medium") === sev).length;
      return {
        projectId: p.id,
        projectName: p.name,
        coveragePct,
        bySeverity: { critical: count("Critical"), high: count("High"), medium: count("Medium"), low: count("Low") },
        reopenRatePct: completed.length ? Math.round((reopened.length / completed.length) * 100) : null,
      };
    })
    .filter((q): q is QaProjectQuality => q !== null);

  const allQueueItems = [...queueByProject.values()].flat();
  return {
    hero: {
      inQa: allQueueItems.length + triage.length,
      criticalUnassigned: triage.length,
      agingOverThreshold: allQueueItems.filter((i) => i.aging === "bad").length,
    },
    triage,
    queue,
    bugsRaised,
    quality,
  };
}
