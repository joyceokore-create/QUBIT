import { withTenant, type TenantContext } from "@/lib/tenant";

/**
 * Personalized relevance engine (PROMPT §3). `getBriefing(viewer)` returns the top-N
 * "needs YOUR attention" items scoped to the viewer — replacing the old shared briefing.
 *
 * Split into a PURE ranker (`buildBriefing`, fixture-testable, deterministic) and a thin
 * tenant-scoped fetch (`getBriefing`). Candidate pools are selected by the viewer's roles
 * (multi-role = union); each item is scored by severity × urgency × ownership proximity and
 * ranked with a stable tie-break (due date, then id) so the output is fully deterministic.
 *
 * Deferred pools (data lands later, wired then — logged here, not silently dropped):
 *   - "approvals waiting on me" / "join requests pending" (no JoinRequest model yet — Phase 3)
 *   - "AI plans awaiting approval" (no ProjectTask.approvalStatus yet — Phase 5)
 *   - true week-over-week RAG deltas (§3.5) — worst-RAG uses current status for now.
 */

export type BriefingSeverity = "red" | "amber" | "info";
export type BriefingKind = "task" | "blocker" | "risk" | "issue" | "milestone" | "project" | "workload";

export interface BriefingItem {
  /** Stable per (kind,id) — used for dedupe and as the React key. */
  id: string;
  kind: BriefingKind;
  title: string;
  meta: string;
  severity: BriefingSeverity;
  href: string;
}

export interface BriefingViewer {
  userId: string;
  roles: string[];
  /** Projects the viewer leads or is a PM-member of — drives PM ownership proximity. */
  myProjectIds: string[];
}

// ── Normalized inputs (fetched under RLS by getBriefing, or built in tests) ──────
export interface RelevanceTask {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  assigneeId: string | null;
  phase: string | null;
  projectId: string;
  projectCode: string;
}
export interface RelevanceBlocker {
  id: string;
  description: string;
  severity: string;
  status: string;
  ownerId: string | null;
  projectId: string;
  projectCode: string | null;
}
export interface RelevanceRisk {
  id: string;
  title: string;
  probability: number;
  impact: number;
  status: string;
  projectId: string | null;
  projectCode: string | null;
}
export interface RelevanceIssue {
  id: string;
  title: string;
  severity: string;
  status: string;
  projectId: string | null;
  projectCode: string | null;
}
export interface RelevanceMilestone {
  id: string;
  name: string;
  dueDate: Date | null;
  status: string;
  projectId: string;
  projectCode: string;
}
export interface RelevanceProject {
  id: string;
  code: string;
  name: string;
  status: string;
  leadUserId: string | null;
  lastStatusAt: Date | null;
}
export interface RelevanceWorkloadPerson {
  userId: string;
  name: string;
  totalPct: number;
}
export interface RelevanceData {
  tasks: RelevanceTask[];
  blockers: RelevanceBlocker[];
  risks: RelevanceRisk[];
  issues: RelevanceIssue[];
  milestones: RelevanceMilestone[];
  projects: RelevanceProject[];
  workload: RelevanceWorkloadPerson[];
}

// ── Scoring ──────────────────────────────────────────────────────────────────────
const SEV_WEIGHT: Record<BriefingSeverity, number> = { red: 3, amber: 2, info: 1 };
const DAY = 86_400_000;

/** Urgency from a due date: overdue > due-soon > later > undated. */
function urgencyForDate(due: Date | null, now: number): number {
  if (!due) return 1;
  const days = (due.getTime() - now) / DAY;
  if (days < 0) return 3;
  if (days <= 3) return 2.5;
  if (days <= 14) return 1.5;
  return 0.75;
}

function isQaPhase(phase: string | null): boolean {
  return !!phase && /\b(uat|sit|test)/i.test(phase);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

interface Candidate extends BriefingItem {
  score: number;
  dueTs: number; // tie-break; +Infinity when undated
}

function candidate(
  item: BriefingItem,
  opts: { urgency: number; ownership: number; dueTs?: number },
): Candidate {
  return { ...item, score: SEV_WEIGHT[item.severity] * opts.urgency * opts.ownership, dueTs: opts.dueTs ?? Infinity };
}

/**
 * PURE: rank the viewer's attention items from the supplied data. Deterministic given
 * (viewer, data, now). Two viewers on the same tenant get different briefings when their
 * work differs — see tests/unit/relevance.test.ts.
 */
export function buildBriefing(
  viewer: BriefingViewer,
  data: RelevanceData,
  now: Date,
  limit = 3,
): BriefingItem[] {
  const t = now.getTime();
  const has = (r: string) => viewer.roles.includes(r);
  const mine = new Set(viewer.myProjectIds);
  const out: Candidate[] = [];

  // ── Self pools — everyone (scoped to the viewer's own work) ──
  for (const task of data.tasks) {
    if (task.assigneeId !== viewer.userId || task.status === "Completed") continue;
    if (task.dueDate && task.dueDate.getTime() < t) {
      out.push(
        candidate(
          { id: task.id, kind: "task", title: `${task.title} is overdue`, meta: `${task.projectCode} · due ${fmtDate(task.dueDate)}`, severity: "red", href: "/my-tasks" },
          { urgency: urgencyForDate(task.dueDate, t), ownership: 3, dueTs: task.dueDate.getTime() },
        ),
      );
    } else if (task.status === "Blocked") {
      out.push(
        candidate(
          { id: task.id, kind: "task", title: `${task.title} is blocked`, meta: `${task.projectCode} · your task`, severity: "amber", href: "/my-tasks" },
          { urgency: 2, ownership: 3, dueTs: task.dueDate?.getTime() },
        ),
      );
    }
  }
  for (const b of data.blockers) {
    if (b.ownerId !== viewer.userId || b.status !== "Open") continue;
    out.push(
      candidate(
        { id: b.id, kind: "blocker", title: b.description, meta: `${b.projectCode ?? "—"} · blocker you own`, severity: b.severity === "Critical" ? "red" : "amber", href: `/projects/${b.projectId}` },
        { urgency: 2, ownership: 3 },
      ),
    );
  }

  // ── ProjectManager — escalations + overdue milestones on projects they run ──
  if (has("ProjectManager")) {
    for (const r of data.risks) {
      if (!r.projectId || !mine.has(r.projectId) || r.status === "Closed") continue;
      const heat = r.probability * r.impact;
      if (heat < 9) continue; // material risks only (of 25)
      out.push(
        candidate(
          { id: r.id, kind: "risk", title: r.title, meta: `${r.projectCode ?? "—"} · risk P${r.probability}×I${r.impact}`, severity: heat >= 15 ? "red" : "amber", href: `/projects/${r.projectId}` },
          { urgency: 1.5, ownership: 2 },
        ),
      );
    }
    for (const i of data.issues) {
      if (!i.projectId || !mine.has(i.projectId) || i.status === "Closed") continue;
      if (i.severity !== "High" && i.severity !== "Critical") continue;
      out.push(
        candidate(
          { id: i.id, kind: "issue", title: i.title, meta: `${i.projectCode ?? "—"} · ${i.severity} issue`, severity: i.severity === "Critical" ? "red" : "amber", href: `/projects/${i.projectId}` },
          { urgency: 1.5, ownership: 2 },
        ),
      );
    }
    for (const m of data.milestones) {
      if (!mine.has(m.projectId) || m.status === "Done" || !m.dueDate || m.dueDate.getTime() >= t) continue;
      out.push(
        candidate(
          { id: m.id, kind: "milestone", title: `${m.name} is overdue`, meta: `${m.projectCode} · due ${fmtDate(m.dueDate)}`, severity: "red", href: `/projects/${m.projectId}` },
          { urgency: urgencyForDate(m.dueDate, t), ownership: 2, dueTs: m.dueDate.getTime() },
        ),
      );
    }
  }

  // ── HeadOfProjects — delivery governance ──
  if (has("HeadOfProjects")) {
    for (const p of data.projects) {
      if (!p.leadUserId) {
        out.push(
          candidate(
            { id: p.id, kind: "project", title: `${p.name} has no project lead`, meta: `${p.code} · unstaffed`, severity: "amber", href: `/projects/${p.id}` },
            { urgency: 1.5, ownership: 1 },
          ),
        );
      }
      if (p.status !== "Completed" && (!p.lastStatusAt || t - p.lastStatusAt.getTime() > 14 * DAY)) {
        out.push(
          candidate(
            { id: p.id, kind: "project", title: `${p.name} status is stale`, meta: `${p.code} · no update in 14+ days`, severity: "info", href: `/projects/${p.id}` },
            { urgency: 1, ownership: 1 },
          ),
        );
      }
    }
    for (const w of data.workload) {
      if (w.totalPct <= 100) continue;
      out.push(
        candidate(
          { id: w.userId, kind: "workload", title: `${w.name} is over-allocated`, meta: `${w.totalPct}% allocated`, severity: "amber", href: "/people" },
          { urgency: 1.5, ownership: 1 },
        ),
      );
    }
  }

  // ── HeadOfQA — quality governance ──
  if (has("HeadOfQA")) {
    for (const task of data.tasks) {
      if (task.status === "Blocked" && isQaPhase(task.phase)) {
        out.push(
          candidate(
            { id: task.id, kind: "task", title: `${task.title} is blocked in ${task.phase}`, meta: `${task.projectCode} · QA`, severity: "red", href: `/projects/${task.projectId}` },
            { urgency: 2, ownership: 1 },
          ),
        );
      }
    }
    for (const i of data.issues) {
      if (i.status === "Closed" || (i.severity !== "High" && i.severity !== "Critical")) continue;
      out.push(
        candidate(
          { id: i.id, kind: "issue", title: i.title, meta: `${i.projectCode ?? "—"} · ${i.severity} issue`, severity: i.severity === "Critical" ? "red" : "amber", href: "/risks" },
          { urgency: 1.5, ownership: 1 },
        ),
      );
    }
  }

  // ── Executive / PlatformSuperAdmin — portfolio view ──
  if (has("Executive") || has("PlatformSuperAdmin")) {
    for (const p of data.projects) {
      if (p.status !== "Overdue" && p.status !== "AtRisk") continue;
      out.push(
        candidate(
          { id: p.id, kind: "project", title: `${p.name} is ${p.status === "Overdue" ? "overdue" : "at risk"}`, meta: `${p.code} · portfolio`, severity: p.status === "Overdue" ? "red" : "amber", href: `/projects/${p.id}` },
          { urgency: 1.5, ownership: 1 },
        ),
      );
    }
    for (const b of data.blockers) {
      if (b.status !== "Open" || b.severity !== "Critical") continue;
      out.push(
        candidate(
          { id: b.id, kind: "blocker", title: b.description, meta: `${b.projectCode ?? "—"} · critical blocker`, severity: "red", href: `/projects/${b.projectId}` },
          { urgency: 2, ownership: 1 },
        ),
      );
    }
    for (const m of data.milestones) {
      if (m.status === "Done" || !m.dueDate || m.dueDate.getTime() >= t) continue;
      out.push(
        candidate(
          { id: m.id, kind: "milestone", title: `${m.name} slipped`, meta: `${m.projectCode} · due ${fmtDate(m.dueDate)}`, severity: "red", href: `/projects/${m.projectId}` },
          { urgency: urgencyForDate(m.dueDate, t), ownership: 1, dueTs: m.dueDate.getTime() },
        ),
      );
    }
  }
  if (has("PlatformSuperAdmin")) {
    for (const p of data.projects) {
      if (p.leadUserId) continue;
      out.push(
        candidate(
          { id: p.id, kind: "project", title: `${p.name} has no project lead`, meta: `${p.code} · platform`, severity: "amber", href: `/projects/${p.id}` },
          { urgency: 1, ownership: 1 },
        ),
      );
    }
  }

  // Dedupe by (kind,id) keeping the highest-scoring framing, then rank deterministically.
  const byKey = new Map<string, Candidate>();
  for (const c of out) {
    const key = `${c.kind}:${c.id}`;
    const prev = byKey.get(key);
    if (!prev || c.score > prev.score) byKey.set(key, c);
  }
  return [...byKey.values()]
    .sort((a, b) => b.score - a.score || a.dueTs - b.dueTs || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(({ score: _score, dueTs: _dueTs, ...item }) => item);
}

// ── Tenant-scoped fetch ────────────────────────────────────────────────────────────
const PM_PROJECT_ROLES = ["Project Manager"];

/** Fetch the viewer's relevance data (RLS) and rank the top-N briefing items. */
export async function getBriefing(ctx: TenantContext, limit = 3): Promise<BriefingItem[]> {
  const { data, myProjectIds } = await withTenant(ctx, async (tx) => {
    const [tasks, blockers, risks, issues, milestones, projects, statusAgg, led, pmMemberships, people] =
      await Promise.all([
        tx.projectTask.findMany({
          where: { status: { not: "Completed" }, approvalStatus: { not: "Draft" } },
          select: { id: true, title: true, status: true, dueDate: true, assigneeId: true, phase: true, projectId: true, project: { select: { code: true } } },
        }),
        tx.blocker.findMany({
          where: { status: "Open" },
          select: { id: true, description: true, severity: true, status: true, ownerId: true, projectId: true, project: { select: { code: true } } },
        }),
        tx.risk.findMany({
          where: { status: { notIn: ["Closed", "Mitigated"] } },
          select: { id: true, title: true, probability: true, impact: true, status: true, projectId: true, project: { select: { code: true } } },
        }),
        tx.issue.findMany({
          where: { status: { not: "Closed" } },
          select: { id: true, title: true, severity: true, status: true, projectId: true, project: { select: { code: true } } },
        }),
        tx.projectMilestone.findMany({
          where: { status: { not: "Done" } },
          select: { id: true, name: true, dueDate: true, status: true, projectId: true, project: { select: { code: true } } },
        }),
        tx.project.findMany({ select: { id: true, code: true, name: true, status: true, leadUserId: true } }),
        tx.projectStatusUpdate.groupBy({ by: ["projectId"], _max: { createdAt: true } }),
        tx.project.findMany({ where: { leadUserId: ctx.userId }, select: { id: true } }),
        tx.projectMember.findMany({ where: { userId: ctx.userId, role: { in: PM_PROJECT_ROLES } }, select: { projectId: true } }),
        tx.user.findMany({
          where: { status: { not: "DELETED" } },
          select: { id: true, name: true, projectAllocations: { select: { allocationPct: true } } },
        }),
      ]);

    const lastStatusByProject = new Map(statusAgg.map((s) => [s.projectId, s._max.createdAt]));
    const myProjectIds = [...new Set([...led.map((p) => p.id), ...pmMemberships.map((m) => m.projectId)])];

    const relData: RelevanceData = {
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate, assigneeId: t.assigneeId, phase: t.phase, projectId: t.projectId, projectCode: t.project.code })),
      blockers: blockers.map((b) => ({ id: b.id, description: b.description, severity: b.severity, status: b.status, ownerId: b.ownerId, projectId: b.projectId, projectCode: b.project?.code ?? null })),
      risks: risks.map((r) => ({ id: r.id, title: r.title, probability: r.probability, impact: r.impact, status: r.status, projectId: r.projectId, projectCode: r.project?.code ?? null })),
      issues: issues.map((i) => ({ id: i.id, title: i.title, severity: i.severity, status: i.status, projectId: i.projectId, projectCode: i.project?.code ?? null })),
      milestones: milestones.map((m) => ({ id: m.id, name: m.name, dueDate: m.dueDate, status: m.status, projectId: m.projectId, projectCode: m.project.code })),
      projects: projects.map((p) => ({ id: p.id, code: p.code, name: p.name, status: p.status, leadUserId: p.leadUserId, lastStatusAt: lastStatusByProject.get(p.id) ?? null })),
      workload: people.map((u) => ({ userId: u.id, name: u.name, totalPct: u.projectAllocations.reduce((n, a) => n + (a.allocationPct ?? 0), 0) })),
    };
    return { data: relData, myProjectIds };
  });

  return buildBriefing({ userId: ctx.userId, roles: ctx.roles, myProjectIds }, data, new Date(), limit);
}
