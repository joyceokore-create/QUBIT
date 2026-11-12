import "server-only";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { dayKey } from "@/lib/dates";
import { isoWeekId, shiftIsoWeek } from "@/lib/iso-week";
import { startOfDayInZone } from "@/lib/list-query";
import { GATE_LABELS } from "@/lib/cockpit-gates";
import { isTestingCheckpoint, TESTING_GATE_KEYS } from "@/lib/testing-gates";
import { getTenantTimeZone } from "@/server/preferences";
import type { CockpitProject } from "@/server/dashboard-cockpit";

/**
 * UX9 — quality across EVERY project (Head of QA's Quality home and Reports › Quality).
 * `dashboard-qa.ts` stays as it is (it is the QA engineer's view of their own projects, and
 * it advances "last seen"); this is the estate-wide read, under the tenant's RLS context,
 * reusing the same rules:
 *  - test work = the QA queue's predicate (a test phase, InReview/InQA, or a bug);
 *  - a critical issue = an open Critical bug or an open Critical issue (the Brief's rule);
 *  - requirement coverage = the cockpit's `coveragePct` (dashboard-qa's traceability rule).
 * Pass rate is not tracked yet (no test-case results in QUBIT), so it is not shown.
 */

export const TEST_WORK: Prisma.ProjectTaskWhereInput = {
  OR: [
    { phase: { contains: "Test", mode: "insensitive" } },
    { phase: { contains: "UAT", mode: "insensitive" } },
    { phase: { contains: "SIT", mode: "insensitive" } },
    { status: { in: ["InReview", "InQA"] } },
    { type: "Bug" },
  ],
};
const OPEN_TASK = { status: { not: "Completed" }, approvalStatus: "Published" } as const;

export interface QualityProject {
  id: string;
  name: string;
  code: string;
  pmName: string | null;
  currentGate: string | null;
  /** Testing gates on the project's track that are live (in progress / late / blocked). */
  testingGates: { key: string; label: string; state: "prog" | "late" | "block" }[];
  inTesting: boolean;
  coveragePct: number | null;
  openBugs: { critical: number; high: number; medium: number; low: number };
  criticalOpen: number;
  overdueTests: number;
  unassignedTests: number;
}

export interface CriticalItem {
  id: string;
  kind: "bug" | "issue";
  title: string;
  projectId: string;
  projectName: string;
  owner: string | null;
  openedAt: Date;
}

export interface TestTaskItem {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  dueDate: Date | null;
  assignee: string | null;
}

export interface QualityOverview {
  timeZone: string;
  projects: QualityProject[];
  critical: CriticalItem[];
  unassigned: TestTaskItem[];
  overdue: TestTaskItem[];
  /** Critical bugs + issues OPENED per ISO week, oldest first (for the trend). */
  weekly: { isoWeek: string; opened: number }[];
}

export async function getQualityOverview(ctx: TenantContext, cockpit: CockpitProject[], now = new Date(), weeks = 8): Promise<QualityOverview> {
  const live = cockpit.filter((p) => !["Completed", "Cancelled"].includes(p.status));
  const ids = live.map((p) => p.id);
  const timeZone = await getTenantTimeZone(ctx);
  const todayStart = startOfDayInZone(dayKey(now, timeZone), timeZone);
  const weekIds = Array.from({ length: weeks }, (_, i) => shiftIsoWeek(isoWeekId(now), i - (weeks - 1)));
  const since = new Date(now.getTime() - weeks * 7 * 86_400_000);

  const data = ids.length
    ? await withTenant(ctx, async (tx) => {
        const [bugs, issueCounts, issues, tests, openedBugs, openedIssues] = await Promise.all([
          tx.projectTask.groupBy({ by: ["projectId", "severity"], where: { projectId: { in: ids }, type: "Bug", ...OPEN_TASK }, _count: { _all: true } }),
          // Uncapped per-project count of open Critical issues (the lists below are capped for display).
          tx.issue.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, severity: "Critical", status: "Open" }, _count: { _all: true } }),
          tx.issue.findMany({
            where: { projectId: { in: ids }, severity: "Critical", status: "Open" },
            select: { id: true, title: true, projectId: true, createdAt: true, ownerId: true },
            orderBy: { createdAt: "asc" },
            take: 200,
          }),
          tx.projectTask.findMany({
            where: { projectId: { in: ids }, ...OPEN_TASK, ...TEST_WORK },
            select: { id: true, title: true, projectId: true, type: true, severity: true, dueDate: true, createdAt: true, assignee: { select: { name: true } } },
            orderBy: { createdAt: "asc" },
            take: 1000,
          }),
          tx.projectTask.findMany({ where: { projectId: { in: ids }, type: "Bug", severity: "Critical", approvalStatus: "Published", createdAt: { gte: since } }, select: { createdAt: true } }),
          tx.issue.findMany({ where: { projectId: { in: ids }, severity: "Critical", createdAt: { gte: since } }, select: { createdAt: true } }),
        ]);
        // Issue.ownerId has no relation — resolve the names in the same tenant transaction.
        const ownerIds = [...new Set(issues.map((i) => i.ownerId).filter((x): x is string => !!x))];
        const owners = ownerIds.length ? await tx.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } }) : [];
        return { bugs, issueCounts, issues, tests, openedBugs, openedIssues, owners };
      })
    : { bugs: [], issueCounts: [], issues: [], tests: [], openedBugs: [], openedIssues: [], owners: [] };

  const name = new Map(live.map((p) => [p.id, p.name]));
  const ownerName = new Map(data.owners.map((u) => [u.id, u.name]));
  const bugCount = (pid: string, sev: string) => data.bugs.find((b) => b.projectId === pid && b.severity === sev)?._count._all ?? 0;

  const critical: CriticalItem[] = [
    ...data.tests
      .filter((t) => t.type === "Bug" && t.severity === "Critical")
      .map((t) => ({ id: t.id, kind: "bug" as const, title: t.title, projectId: t.projectId, projectName: name.get(t.projectId) ?? "", owner: t.assignee?.name ?? null, openedAt: t.createdAt })),
    ...data.issues.map((i) => ({ id: i.id, kind: "issue" as const, title: i.title, projectId: i.projectId!, projectName: name.get(i.projectId!) ?? "", owner: (i.ownerId && ownerName.get(i.ownerId)) || null, openedAt: i.createdAt })),
  ].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());

  const toTest = (t: (typeof data.tests)[number]): TestTaskItem => ({ id: t.id, title: t.title, projectId: t.projectId, projectName: name.get(t.projectId) ?? "", dueDate: t.dueDate, assignee: t.assignee?.name ?? null });
  const unassigned = data.tests.filter((t) => !t.assignee).map(toTest);
  const overdue = data.tests.filter((t) => t.dueDate && t.dueDate < todayStart).map(toTest).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());

  const projects: QualityProject[] = live.map((p) => {
    const testingGates = p.buildTrack
      ? TESTING_GATE_KEYS.filter((k) => ["prog", "late", "block"].includes(p.gates[k])).map((k) => ({ key: k, label: GATE_LABELS[k], state: p.gates[k] as "prog" | "late" | "block" }))
      : [];
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      pmName: p.pmName,
      currentGate: p.currentGate,
      testingGates,
      inTesting: testingGates.length > 0 || (!!p.currentGate && isTestingCheckpoint({ name: p.currentGate })),
      coveragePct: p.coveragePct,
      openBugs: { critical: bugCount(p.id, "Critical"), high: bugCount(p.id, "High"), medium: bugCount(p.id, "Medium"), low: bugCount(p.id, "Low") },
      // Uncapped: open Critical bugs (groupBy) + open Critical issues (groupBy), the Brief's rule.
      criticalOpen: bugCount(p.id, "Critical") + (data.issueCounts.find((r) => r.projectId === p.id)?._count._all ?? 0),
      overdueTests: overdue.filter((t) => t.projectId === p.id).length,
      unassignedTests: unassigned.filter((t) => t.projectId === p.id).length,
    };
  });

  const counts = new Map(weekIds.map((w) => [w, 0]));
  for (const r of [...data.openedBugs, ...data.openedIssues]) {
    const w = isoWeekId(r.createdAt);
    if (counts.has(w)) counts.set(w, counts.get(w)! + 1);
  }

  return { timeZone, projects, critical, unassigned, overdue, weekly: weekIds.map((w) => ({ isoWeek: w, opened: counts.get(w) ?? 0 })) };
}

/**
 * WS1 — one project's open critical items, the same rule as the overview above (an open
 * Critical bug in published work, or an open Critical issue). The testing-gate sign-off
 * drawer lists them, and the engine counts them to allow "sign off with exception".
 * Runs inside the caller's tenant transaction.
 */
export async function openCriticalForProject(tx: Prisma.TransactionClient, projectId: string, take = 20): Promise<{ total: number; items: CriticalItem[] }> {
  const [bugs, issues, bugCount, issueCount, project] = await Promise.all([
    tx.projectTask.findMany({
      where: { projectId, type: "Bug", severity: "Critical", ...OPEN_TASK },
      select: { id: true, title: true, createdAt: true, assignee: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take,
    }),
    tx.issue.findMany({ where: { projectId, severity: "Critical", status: "Open" }, select: { id: true, title: true, createdAt: true, ownerId: true }, orderBy: { createdAt: "asc" }, take }),
    tx.projectTask.count({ where: { projectId, type: "Bug", severity: "Critical", ...OPEN_TASK } }),
    tx.issue.count({ where: { projectId, severity: "Critical", status: "Open" } }),
    tx.project.findUnique({ where: { id: projectId }, select: { name: true } }),
  ]);
  const ownerIds = [...new Set(issues.map((i) => i.ownerId).filter((x): x is string => !!x))];
  const owners = new Map(ownerIds.length ? (await tx.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]) : []);
  const projectName = project?.name ?? "";
  const items: CriticalItem[] = [
    ...bugs.map((b) => ({ id: b.id, kind: "bug" as const, title: b.title, projectId, projectName, owner: b.assignee?.name ?? null, openedAt: b.createdAt })),
    ...issues.map((i) => ({ id: i.id, kind: "issue" as const, title: i.title, projectId, projectName, owner: (i.ownerId && owners.get(i.ownerId)) || null, openedAt: i.createdAt })),
  ].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  return { total: bugCount + issueCount, items: items.slice(0, take) };
}
