import { withTenant, type TenantContext } from "@/lib/tenant";
import { llmChat, llmEnabled, llmModel } from "@/server/q/llm";
import { getEscalations, getUpcomingMilestones } from "@/server/dashboard";
import { listProjects, getProjectPanelData } from "@/server/projects";
import { listProjectMembers, listProjectTeams, listWorkload } from "@/server/resources";
import { listRisks } from "@/server/risks";
import { listIssues } from "@/server/issues";
import { listBlockers } from "@/server/blockers";
import { listDocuments, getDocument } from "@/server/documents";
import { getConnectedSummaries } from "@/server/connectors";

/**
 * Q reporting copilot (MVP1 Phase C). Grounded report generation over the existing
 * tenant-scoped data layer. Every context is assembled under `withTenant` (RLS), so a
 * report can only ever contain the caller's tenant data. The model is asked to use ONLY the
 * provided JSON — "if it's not in the data, say so". When the Q AI box is unconfigured (or
 * the call fails), we fall back to a deterministic Markdown summary built from the same
 * data, so the feature works end-to-end without a provider.
 *
 * The model is Q's configured LLM provider (see src/server/q/llm.ts) — Riverbank's internal
 * OpenAI-compatible box, not an external service.
 *
 * Reports are **period-aware** (weekly / monthly / all-time): for time-stamped entities we
 * add an "activity this period" block (tasks completed, status updates posted, blockers
 * raised/resolved, new risks & issues) filtered to the window, so a weekly report reads as
 * "what happened this week" rather than a static snapshot.
 *
 * We log metrics to `AiCallLog` (model / tokens / latency / usedAi) — NEVER the prompt,
 * the report text, or any PII.
 */

const MAX_TOKENS = 2000;

export type QReportType = "project" | "resource" | "portfolio" | "manager" | "member";
export type ReportPeriod = "week" | "month" | "all";

/** The report a viewer gets when they ask for "a report" with no type (PROMPT §7):
 * SuperAdmin / Executive / heads → portfolio; ProjectManager → manager; else → member. */
export function defaultReportType(roles: string[]): QReportType {
  if (
    roles.includes("PlatformSuperAdmin") ||
    roles.includes("Executive") ||
    roles.includes("HeadOfProjects") ||
    roles.includes("HeadOfQA")
  ) {
    return "portfolio";
  }
  if (roles.includes("ProjectManager")) return "manager";
  return "member";
}

export class QReportError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "BAD_TARGET",
  ) {
    super(message);
    this.name = "QReportError";
  }
}

export interface QReportResult {
  /** Human title, e.g. "Atlas migration — weekly report". Used for filenames + share cards. */
  title: string;
  /** Human window label, e.g. "week of 8 Jul – 15 Jul 2026" or "all time". */
  periodLabel: string;
  markdown: string;
  usedAi: boolean;
  model: string;
}

interface ReportContext {
  purpose: string;
  title: string;
  /** Compact JSON handed to the model as the sole source of truth. */
  data: unknown;
  /** Deterministic Markdown — used verbatim when there's no API key or the call fails. */
  fallback: string;
}

// ── Period window ────────────────────────────────────────────────────────────

interface Window {
  period: ReportPeriod;
  /** null → no lower bound (all time). */
  since: Date | null;
  /** "weekly" | "monthly" | "" — the adjective used in report titles. */
  adjective: string;
  /** Human range label for the report header. */
  label: string;
}

function periodWindow(period: ReportPeriod): Window {
  const now = new Date();
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (period === "week") {
    const since = new Date(now.getTime() - 7 * 86_400_000);
    return { period, since, adjective: "weekly", label: `week of ${fmt(since)} – ${fmt(now)}` };
  }
  if (period === "month") {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    return { period, since, adjective: "monthly", label: `month to ${fmt(now)}` };
  }
  return { period, since: null, adjective: "", label: "all time" };
}

/** Prefix a report title with the period adjective ("weekly"/"monthly"/"status"). */
function titleFor(subject: string, w: Window): string {
  const kind = w.adjective || "status";
  return `${subject} — ${kind} report`;
}

// ── Context builders (all tenant-scoped via the server layer) ──────────────────

async function projectActivity(ctx: TenantContext, projectId: string, since: Date | null) {
  return withTenant(ctx, async (tx) => {
    const base = { tenantId: ctx.tenantId, projectId };
    const gte = since ? { gte: since } : undefined;
    const [tasksCompleted, statusUpdates, blockersRaised, blockersResolved, newRisks, newIssues] =
      await Promise.all([
        tx.projectTask.count({ where: { ...base, status: "Completed", approvalStatus: { not: "Draft" }, ...(gte ? { updatedAt: gte } : {}) } }),
        tx.projectStatusUpdate.findMany({
          where: { ...base, ...(gte ? { createdAt: gte } : {}) },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { rag: true, body: true, createdAt: true },
        }),
        tx.blocker.count({ where: { ...base, ...(gte ? { dateRaised: gte } : {}) } }),
        tx.blocker.count({ where: { ...base, status: "Resolved", ...(gte ? { updatedAt: gte } : {}) } }),
        tx.risk.count({ where: { ...base, ...(gte ? { createdAt: gte } : {}) } }),
        tx.issue.count({ where: { ...base, ...(gte ? { createdAt: gte } : {}) } }),
      ]);
    return {
      tasksCompleted,
      blockersRaised,
      blockersResolved,
      newRisks,
      newIssues,
      statusUpdates: statusUpdates.map((s) => ({
        rag: s.rag,
        date: s.createdAt.toISOString().slice(0, 10),
        body: s.body.slice(0, 400),
      })),
    };
  });
}

async function projectContext(ctx: TenantContext, projectId: string, w: Window): Promise<ReportContext> {
  const project = await getProjectPanelData(ctx, projectId);
  if (!project) throw new QReportError("Project not found.", "NOT_FOUND");
  const [members, teams, risks, issues, docRows, connectors, activity] = await Promise.all([
    listProjectMembers(ctx, projectId),
    listProjectTeams(ctx, projectId),
    listRisks(ctx, { projectId }),
    listIssues(ctx, { projectId }),
    listDocuments(ctx, projectId),
    getConnectedSummaries(ctx, projectId),
    projectActivity(ctx, projectId, w.since),
  ]);

  // Ground Q on attached text documents (BRD, plans) — pull each doc's content, capped so
  // the prompt stays bounded. PDFs (fileData only) are listed but not inlined here.
  const textDocs = docRows.filter((d) => !d.hasFile).slice(0, 3);
  const documents = await Promise.all(
    textDocs.map(async (d) => {
      const full = await getDocument(ctx, d.id);
      return { title: d.title, kind: d.kind, excerpt: (full?.content ?? "").slice(0, 3000) };
    }),
  );

  const data = {
    period: w.label,
    project: {
      code: project.code,
      name: project.name,
      description: project.description,
      status: project.status,
      priority: project.priority,
      avgProgress: project.avgProgress,
      dueDate: project.dueDate ? project.dueDate.toISOString().slice(0, 10) : null,
      budget: project.budget,
      lead: members.find((m) => /lead/i.test(m.role))?.name ?? null,
    },
    activityThisPeriod: activity,
    resources: members.map((m) => ({ name: m.name, role: m.role, allocationPct: m.allocationPct })),
    teams: teams.map((t) => t.name),
    openRisks: risks
      .filter((r) => r.status !== "Closed")
      .map((r) => ({ title: r.title, probability: r.probability, impact: r.impact, status: r.status })),
    openIssues: issues
      .filter((i) => i.status !== "Closed")
      .map((i) => ({ title: i.title, severity: i.severity, status: i.status })),
    documents: documents.filter((d) => d.excerpt),
    // Live signals from connected developer tools (GitHub, …) so Q can answer "last commit",
    // "fixed vs not-yet-fixed issues", etc.
    integrations: connectors.map((c) => ({ provider: c.provider, ...c.summary })),
  };

  const activityLine =
    w.since === null
      ? ""
      : [
          `\n## Activity — ${w.label}`,
          `- ${activity.tasksCompleted} ${activity.tasksCompleted === 1 ? "task" : "tasks"} completed`,
          `- ${activity.blockersRaised} ${activity.blockersRaised === 1 ? "blocker" : "blockers"} raised · ${activity.blockersResolved} resolved`,
          `- ${activity.newRisks} new ${activity.newRisks === 1 ? "risk" : "risks"} · ${activity.newIssues} new ${activity.newIssues === 1 ? "issue" : "issues"}`,
          activity.statusUpdates.length
            ? `\n**Status updates:**\n${activity.statusUpdates.map((s) => `- [${s.rag}] ${s.date} — ${s.body}`).join("\n")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

  const fallback = [
    `# ${project.name} — ${w.adjective || "status"} report`,
    `**${project.code}** · ${project.status} · ${project.priority} priority · ${project.avgProgress}% avg progress` +
      (data.project.dueDate ? ` · due ${data.project.dueDate}` : "") +
      `\n_Reporting period: ${w.label}._`,
    project.description ? `\n${project.description}` : "",
    activityLine,
    `\n## Resources (${members.length})`,
    members.length
      ? members
          .map((m) => `- ${m.name} — ${m.role}${m.allocationPct != null ? ` (${m.allocationPct}%)` : ""}`)
          .join("\n")
      : "_No people allocated yet._",
    teams.length ? `\n**Teams:** ${teams.map((t) => t.name).join(", ")}` : "",
    `\n## Open risks (${data.openRisks.length})`,
    data.openRisks.length
      ? data.openRisks.map((r) => `- ${r.title} — P${r.probability}×I${r.impact} (${r.status})`).join("\n")
      : "_None open._",
    `\n## Open issues (${data.openIssues.length})`,
    data.openIssues.length
      ? data.openIssues.map((i) => `- ${i.title} — ${i.severity} (${i.status})`).join("\n")
      : "_None open._",
    data.documents.length ? `\n**Documents:** ${data.documents.map((d) => `${d.title} (${d.kind})`).join(", ")}` : "",
    data.integrations.length
      ? `\n## Connected tools\n${data.integrations.map((i) => `**${i.provider}** — ${i.headline}\n${i.lines.map((l) => `- ${l}`).join("\n")}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { purpose: "report:project", title: titleFor(project.name, w), data, fallback };
}

async function personActivity(ctx: TenantContext, userId: string, since: Date | null) {
  return withTenant(ctx, async (tx) => {
    const gte = since ? { gte: since } : undefined;
    const [tasksCompleted, statusUpdatesPosted, blockersRaised, blockersResolved] = await Promise.all([
      tx.projectTask.count({
        where: { tenantId: ctx.tenantId, assigneeId: userId, status: "Completed", ...(gte ? { updatedAt: gte } : {}) },
      }),
      tx.projectStatusUpdate.count({
        where: { tenantId: ctx.tenantId, postedById: userId, ...(gte ? { createdAt: gte } : {}) },
      }),
      tx.blocker.count({ where: { tenantId: ctx.tenantId, ownerId: userId, ...(gte ? { dateRaised: gte } : {}) } }),
      tx.blocker.count({
        where: { tenantId: ctx.tenantId, ownerId: userId, status: "Resolved", ...(gte ? { updatedAt: gte } : {}) },
      }),
    ]);
    return { tasksCompleted, statusUpdatesPosted, blockersRaised, blockersResolved };
  });
}

async function resourceContext(ctx: TenantContext, userId: string, w: Window): Promise<ReportContext> {
  const person = (await listWorkload(ctx)).find((p) => p.userId === userId);
  if (!person) throw new QReportError("Person not found.", "NOT_FOUND");
  const activity = await personActivity(ctx, userId, w.since);

  const data = {
    period: w.label,
    person: { name: person.name, department: person.departmentName },
    totalAllocationPct: person.totalPct,
    overAllocated: person.totalPct > 100,
    projectCount: person.projectCount,
    activityThisPeriod: activity,
    allocations: person.allocations.map((a) => ({
      project: a.projectName,
      role: a.role,
      allocationPct: a.allocationPct,
    })),
  };

  const activityLine =
    w.since === null
      ? ""
      : `\n## Activity — ${w.label}\n` +
        `- ${activity.tasksCompleted} ${activity.tasksCompleted === 1 ? "task" : "tasks"} completed\n` +
        `- ${activity.statusUpdatesPosted} status ${activity.statusUpdatesPosted === 1 ? "update" : "updates"} posted\n` +
        `- ${activity.blockersRaised} ${activity.blockersRaised === 1 ? "blocker" : "blockers"} raised · ${activity.blockersResolved} resolved`;

  const fallback = [
    `# ${person.name} — ${w.adjective || "workload"} report`,
    `${person.departmentName ?? "No department"} · ${person.projectCount} ${
      person.projectCount === 1 ? "project" : "projects"
    } · **${person.totalPct}%** allocated${person.totalPct > 100 ? " ⚠️ over-allocated" : ""}` +
      `\n_Reporting period: ${w.label}._`,
    activityLine,
    `\n## Allocations`,
    person.allocations.length
      ? person.allocations
          .map((a) => `- ${a.projectName} — ${a.role}${a.allocationPct != null ? ` (${a.allocationPct}%)` : ""}`)
          .join("\n")
      : "_Not allocated to any project yet._",
  ]
    .filter(Boolean)
    .join("\n");

  return { purpose: "report:resource", title: titleFor(person.name, w), data, fallback };
}

async function portfolioContext(ctx: TenantContext, w: Window): Promise<ReportContext> {
  const [projects, escalations, milestones] = await Promise.all([
    listProjects(ctx, {}),
    getEscalations(ctx, 8),
    getUpcomingMilestones(ctx, 8),
  ]);

  const byStatus = (s: string) => projects.filter((p) => p.status === s).length;
  const attention = projects
    .filter((p) => p.status === "AtRisk" || p.status === "Overdue")
    .map((p) => ({ code: p.code, name: p.name, status: p.status, avgProgress: p.avgProgress }));

  const data = {
    period: w.label,
    totals: {
      projects: projects.length,
      onTrack: byStatus("OnTrack"),
      atRisk: byStatus("AtRisk"),
      overdue: byStatus("Overdue"),
      planning: byStatus("Planning"),
      completed: byStatus("Completed"),
    },
    needsAttention: attention,
    openEscalations: escalations.map((e) => ({ kind: e.kind, title: e.title, meta: e.meta })),
    upcomingMilestones: milestones.map((m) => ({ text: m.text, meta: m.meta })),
  };

  const fallback = [
    `# Portfolio summary`,
    `**${projects.length} projects** · ${data.totals.onTrack} on track · ${data.totals.atRisk} at risk · ${data.totals.overdue} overdue · ${data.totals.planning} planning`,
    `\n## Needs attention (${attention.length})`,
    attention.length
      ? attention.map((p) => `- ${p.name} (${p.code}) — ${p.status}, ${p.avgProgress}%`).join("\n")
      : "_Nothing at risk or overdue._",
    `\n## Open escalations (${escalations.length})`,
    escalations.length
      ? escalations.map((e) => `- **${e.kind}:** ${e.title} — ${e.meta}`).join("\n")
      : "_None._",
    `\n## Upcoming milestones (${milestones.length})`,
    milestones.length ? milestones.map((m) => `- ${m.text} — ${m.meta}`).join("\n") : "_None scheduled._",
  ].join("\n");

  return { purpose: "report:portfolio", title: titleFor("Portfolio", w), data, fallback };
}

async function managerContext(ctx: TenantContext, w: Window): Promise<ReportContext> {
  const [projects, tasksByStatus, risks, blockers, milestones, workload] = await Promise.all([
    listProjects(ctx, {}),
    withTenant(ctx, (tx) => tx.projectTask.groupBy({ by: ["status"], _count: { _all: true } })),
    listRisks(ctx, {}),
    listBlockers(ctx, {}),
    getUpcomingMilestones(ctx, 8),
    listWorkload(ctx),
  ]);
  const taskCount = (s: string) => tasksByStatus.find((t) => t.status === s)?._count._all ?? 0;
  const openRisks = risks.filter((r) => r.status !== "Closed");
  const openBlockers = blockers.filter((b) => b.status === "Open");
  const overAllocated = workload.filter((p) => p.totalPct > 100);

  const data = {
    period: w.label,
    projects: projects.length,
    tasks: {
      total: tasksByStatus.reduce((n, t) => n + t._count._all, 0),
      completed: taskCount("Completed"),
      inProgress: taskCount("InProgress"),
      blocked: taskCount("Blocked"),
      notStarted: taskCount("NotStarted"),
    },
    openRisks: openRisks.map((r) => ({ title: r.title, probability: r.probability, impact: r.impact })),
    openBlockers: openBlockers.map((b) => ({ description: b.description, severity: b.severity, project: b.projectCode })),
    upcomingMilestones: milestones.map((m) => ({ text: m.text, meta: m.meta })),
    overAllocated: overAllocated.map((p) => ({ name: p.name, totalPct: p.totalPct })),
  };

  const fallback = [
    `# Manager report`,
    `${projects.length} projects · ${data.tasks.total} tasks — ${data.tasks.completed} done, ${data.tasks.inProgress} in progress, ${data.tasks.blocked} blocked`,
    `\n## Open blockers (${openBlockers.length})`,
    openBlockers.length
      ? openBlockers.map((b) => `- **${b.severity}:** ${b.description}${b.projectCode ? ` (${b.projectCode})` : ""}`).join("\n")
      : "_None._",
    `\n## Open risks (${openRisks.length})`,
    openRisks.length ? openRisks.map((r) => `- ${r.title} — P${r.probability}×I${r.impact}`).join("\n") : "_None._",
    `\n## Team workload`,
    overAllocated.length
      ? overAllocated.map((p) => `- ${p.name} — ${p.totalPct}% ⚠️ over-allocated`).join("\n")
      : "_No one is over-allocated._",
    `\n## Upcoming milestones (${milestones.length})`,
    milestones.length ? milestones.map((m) => `- ${m.text} — ${m.meta}`).join("\n") : "_None scheduled._",
  ].join("\n");

  return { purpose: "report:manager", title: titleFor("Delivery", w), data, fallback };
}

async function memberContext(ctx: TenantContext, userId: string, w: Window): Promise<ReportContext> {
  const [person, risks, blockers, activity] = await Promise.all([
    listWorkload(ctx).then((rows) => rows.find((p) => p.userId === userId)),
    listRisks(ctx, { ownerId: userId }),
    listBlockers(ctx, {}),
    personActivity(ctx, userId, w.since),
  ]);
  if (!person) throw new QReportError("Person not found.", "NOT_FOUND");
  const myBlockers = blockers.filter((b) => b.ownerId === userId && b.status === "Open");
  const openRisks = risks.filter((r) => r.status !== "Closed");

  const data = {
    period: w.label,
    person: { name: person.name, department: person.departmentName },
    myProjects: person.allocations.map((a) => ({ project: a.projectName, role: a.role, allocationPct: a.allocationPct })),
    totalAllocationPct: person.totalPct,
    activityThisPeriod: activity,
    risksIOwn: openRisks.map((r) => ({ title: r.title, project: r.projectCode })),
    blockersIOwn: myBlockers.map((b) => ({ description: b.description, severity: b.severity, project: b.projectCode })),
  };

  const activityLine =
    w.since === null
      ? ""
      : `\n## My activity — ${w.label}\n` +
        `- ${activity.tasksCompleted} ${activity.tasksCompleted === 1 ? "task" : "tasks"} completed\n` +
        `- ${activity.statusUpdatesPosted} status ${activity.statusUpdatesPosted === 1 ? "update" : "updates"} posted\n` +
        `- ${activity.blockersRaised} ${activity.blockersRaised === 1 ? "blocker" : "blockers"} raised · ${activity.blockersResolved} resolved`;

  const fallback = [
    `# ${person.name} — ${w.adjective ? `${w.adjective} report` : "my work"}`,
    `${person.allocations.length} ${person.allocations.length === 1 ? "project" : "projects"} · ${person.totalPct}% allocated` +
      `\n_Reporting period: ${w.label}._`,
    activityLine,
    `\n## My projects`,
    person.allocations.length
      ? person.allocations.map((a) => `- ${a.projectName} — ${a.role}${a.allocationPct != null ? ` (${a.allocationPct}%)` : ""}`).join("\n")
      : "_Not allocated to any project yet._",
    `\n## Blockers I own (${myBlockers.length})`,
    myBlockers.length ? myBlockers.map((b) => `- **${b.severity}:** ${b.description}`).join("\n") : "_None._",
    `\n## Risks I own (${openRisks.length})`,
    openRisks.length ? openRisks.map((r) => `- ${r.title}`).join("\n") : "_None._",
  ]
    .filter(Boolean)
    .join("\n");

  return { purpose: "report:member", title: titleFor(person.name, w), data, fallback };
}

// ── Public API ─────────────────────────────────────────────────────────────────

const SYSTEM = (tenantName: string) =>
  `You are Q, the reporting copilot inside QUBIT, an enterprise portfolio & programme ` +
  `management app, working for ${tenantName}. Write a clear, concise status report in ` +
  `GitHub-flavoured Markdown. Use ONLY the JSON data provided in the user message as your ` +
  `source of truth — do not invent projects, people, numbers, dates, budgets, risks, or ` +
  `facts that are not present. If something asked-about is missing, say it isn't in the ` +
  `data. When the data includes a "period" and "activityThisPeriod", frame the report ` +
  `around what happened in that window, then summarise current state. Prefer short sections ` +
  `with a one-line headline, then bullets. Lead with the most important takeaway (what needs ` +
  `attention). Do not add a preamble like "Here is the report".`;

async function logCall(
  ctx: TenantContext,
  entry: { purpose: string; usedAi: boolean; inputTokens: number; outputTokens: number; latencyMs: number },
) {
  try {
    await withTenant(ctx, (tx) =>
      tx.aiCallLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          purpose: entry.purpose,
          model: llmModel(),
          usedAi: entry.usedAi,
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          latencyMs: entry.latencyMs,
        },
      }),
    );
  } catch {
    // Logging must never break a report.
  }
}

export async function generateReport(
  ctx: TenantContext,
  opts: { type: QReportType; targetId?: string; period?: ReportPeriod; tenantName: string },
): Promise<QReportResult> {
  const w = periodWindow(opts.period ?? "all");
  let built: ReportContext;
  if (opts.type === "project") {
    if (!opts.targetId) throw new QReportError("A project is required.", "BAD_TARGET");
    built = await projectContext(ctx, opts.targetId, w);
  } else if (opts.type === "resource") {
    built = await resourceContext(ctx, opts.targetId ?? ctx.userId, w);
  } else if (opts.type === "manager") {
    built = await managerContext(ctx, w);
  } else if (opts.type === "member") {
    built = await memberContext(ctx, opts.targetId ?? ctx.userId, w);
  } else {
    built = await portfolioContext(ctx, w);
  }

  // Provider unconfigured → deterministic report from the same grounded data.
  if (!llmEnabled()) {
    await logCall(ctx, { purpose: built.purpose, usedAi: false, inputTokens: 0, outputTokens: 0, latencyMs: 0 });
    return { title: built.title, periodLabel: w.label, markdown: built.fallback, usedAi: false, model: llmModel() };
  }

  const start = Date.now();
  try {
    const response = await llmChat({
      system: SYSTEM(opts.tenantName),
      maxTokens: MAX_TOKENS,
      messages: [
        {
          role: "user",
          content:
            `Generate a ${w.adjective || ""} ${opts.type} report from this data (JSON):\n\n` +
            "```json\n" +
            JSON.stringify(built.data, null, 2) +
            "\n```",
        },
      ],
    });

    const markdown = response.text.trim();

    await logCall(ctx, {
      purpose: built.purpose,
      usedAi: true,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      latencyMs: Date.now() - start,
    });

    return {
      title: built.title,
      periodLabel: w.label,
      markdown: markdown || built.fallback,
      usedAi: markdown.length > 0,
      model: llmModel(),
    };
  } catch {
    // Any provider error (auth, rate limit, network, timeout) degrades gracefully to the
    // deterministic report rather than failing the request.
    await logCall(ctx, {
      purpose: built.purpose,
      usedAi: false,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - start,
    });
    return { title: built.title, periodLabel: w.label, markdown: built.fallback, usedAi: false, model: llmModel() };
  }
}
