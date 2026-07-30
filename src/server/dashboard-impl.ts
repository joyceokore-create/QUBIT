import { withTenant, type TenantContext } from "@/lib/tenant";
import { projectRag, type Rag } from "@/server/health";

/**
 * Implementor preset data (docs/17 §7). First question: "what goes live next, and is
 * it ready?" INTERIM DATA SOURCE (§7.2, stated in the UI): the 16-revamp M8 stage
 * machine doesn't exist yet, so "gates" are the project's milestones and a project is
 * in the rollout window when a milestone name reads like UAT / pilot / go-live. When M8
 * ships gate checklists, this module repoints — the preset's shape doesn't change.
 * Scoped to the viewer's projects (member or lead), like every hands-on persona.
 */

const day = 86_400_000;
/** Milestone-name tag that marks a project as in the rollout window (interim, §7.2). */
const ROLLOUT_TAG = /\buat\b|\bsit\b|pilot|go[- ]?live|rollout|launch|deploy|hypercare/i;
const UAT_TAG = /\buat\b|\bsit\b/i;

export interface ImplGateItem {
  name: string;
  /** Pending with a due date already past. */
  late: boolean;
}

export interface ImplNextGoLive {
  projectId: string;
  projectCode: string;
  projectName: string;
  milestoneName: string;
  dueDate: Date;
  daysUntil: number; // negative = overdue
  rag: Rag;
  openGates: ImplGateItem[];
  gatesDone: number;
  gatesTotal: number;
}

export interface ImplPilotRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  stage: "UAT" | "Pilot";
  gatesDone: number;
  gatesTotal: number;
  hasLateGate: boolean;
  goLive: Date | null;
  rag: Rag;
}

export interface ImplIssue {
  id: string;
  description: string;
  severity: string;
  projectId: string;
  projectCode: string;
  ownerName: string | null;
  ageDays: number;
}

export interface ImplCalendarEvent {
  date: Date;
  label: string;
  projectId: string;
  projectCode: string;
}

export interface ImplHandoverDoc {
  id: string;
  title: string;
  projectId: string;
  projectCode: string;
  ageDays: number;
}

export interface ImplDashboard {
  nextGoLive: ImplNextGoLive | null;
  pilots: ImplPilotRow[];
  issues: ImplIssue[];
  /** Milestone due dates on rollout projects within the next 30 days. */
  calendar: ImplCalendarEvent[];
  handoverDocs: ImplHandoverDoc[];
}

export async function getImplDashboard(ctx: TenantContext, now = new Date()): Promise<ImplDashboard> {
  const live = await withTenant(ctx, async (tx) => {
    const [led, memberships] = await Promise.all([
      tx.project.findMany({ where: { leadUserId: ctx.userId }, select: { id: true } }),
      tx.projectMember.findMany({ where: { userId: ctx.userId }, select: { projectId: true } }),
    ]);
    const projectIds = [...new Set([...led.map((p) => p.id), ...memberships.map((m) => m.projectId)])];
    if (!projectIds.length) return { projects: [], milestones: [], blockers: [], docs: [] };

    const [projects, milestones, blockers, docs] = await Promise.all([
      tx.project.findMany({
        where: { id: { in: projectIds }, status: { notIn: ["Completed", "Cancelled"] } },
        select: { id: true, code: true, name: true, status: true },
        orderBy: { name: "asc" },
      }),
      tx.projectMilestone.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true, projectId: true, name: true, status: true, dueDate: true },
        orderBy: [{ dueDate: "asc" }, { orderIndex: "asc" }],
      }),
      tx.blocker.findMany({
        where: { projectId: { in: projectIds }, status: "Open" },
        select: {
          id: true, projectId: true, description: true, severity: true, dateRaised: true,
          owner: { select: { name: true } },
        },
        orderBy: { dateRaised: "asc" },
      }),
      tx.projectDocument.findMany({
        where: { projectId: { in: projectIds }, status: "PendingReview" },
        select: { id: true, projectId: true, title: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return { projects, milestones, blockers, docs };
  });

  const milestonesByProject = new Map<string, typeof live.milestones>();
  for (const m of live.milestones) {
    const list = milestonesByProject.get(m.projectId) ?? [];
    list.push(m);
    milestonesByProject.set(m.projectId, list);
  }

  // A project is in the rollout window when any milestone carries a rollout tag (§7.2).
  const pilots: ImplPilotRow[] = live.projects
    .map((p) => {
      const ms = milestonesByProject.get(p.id) ?? [];
      if (!ms.some((m) => ROLLOUT_TAG.test(m.name))) return null;
      const pending = ms.filter((m) => m.status !== "Done");
      // Interim gates = ALL milestones of the project; done ⇔ milestone Done.
      const goLive = pending.find((m) => m.dueDate)?.dueDate ?? null;
      return {
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        stage: pending.some((m) => UAT_TAG.test(m.name)) ? ("UAT" as const) : ("Pilot" as const),
        gatesDone: ms.length - pending.length,
        gatesTotal: ms.length,
        hasLateGate: pending.some((m) => m.dueDate && m.dueDate < now),
        goLive,
        rag: projectRag(p.status),
      };
    })
    .filter((r): r is ImplPilotRow => r !== null)
    .sort((a, b) => (a.goLive?.getTime() ?? Infinity) - (b.goLive?.getTime() ?? Infinity));

  const pilotIds = new Set(pilots.map((p) => p.projectId));

  // Next go-live: the earliest dated pending milestone across rollout projects —
  // overdue ones surface FIRST (they're the most urgent go-live, not history).
  let nextGoLive: ImplNextGoLive | null = null;
  const candidates = live.milestones
    .filter((m) => pilotIds.has(m.projectId) && m.status !== "Done" && m.dueDate)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
  const head = candidates[0];
  if (head) {
    const project = live.projects.find((p) => p.id === head.projectId)!;
    const ms = milestonesByProject.get(head.projectId) ?? [];
    const pending = ms.filter((m) => m.status !== "Done");
    nextGoLive = {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      milestoneName: head.name,
      dueDate: head.dueDate!,
      daysUntil: Math.round((head.dueDate!.getTime() - now.getTime()) / day),
      rag: projectRag(project.status),
      openGates: pending.slice(0, 3).map((m) => ({ name: m.name, late: !!m.dueDate && m.dueDate < now })),
      gatesDone: ms.length - pending.length,
      gatesTotal: ms.length,
    };
  }

  const codeById = new Map(live.projects.map((p) => [p.id, p.code]));
  const issues: ImplIssue[] = live.blockers
    .filter((b) => pilotIds.has(b.projectId))
    .map((b) => ({
      id: b.id,
      description: b.description,
      severity: b.severity,
      projectId: b.projectId,
      projectCode: codeById.get(b.projectId) ?? "",
      ownerName: b.owner?.name ?? null,
      ageDays: Math.max(0, Math.floor((now.getTime() - b.dateRaised.getTime()) / day)),
    }));

  const in30d = new Date(now.getTime() + 30 * day);
  const calendar: ImplCalendarEvent[] = live.milestones
    .filter((m) => pilotIds.has(m.projectId) && m.status !== "Done" && m.dueDate && m.dueDate >= now && m.dueDate <= in30d)
    .map((m) => ({ date: m.dueDate!, label: m.name, projectId: m.projectId, projectCode: codeById.get(m.projectId) ?? "" }));

  const handoverDocs: ImplHandoverDoc[] = live.docs.map((d) => ({
    id: d.id,
    title: d.title,
    projectId: d.projectId,
    projectCode: codeById.get(d.projectId) ?? "",
    ageDays: Math.max(0, Math.floor((now.getTime() - d.createdAt.getTime()) / day)),
  }));

  return { nextGoLive, pilots, issues, calendar, handoverDocs };
}
