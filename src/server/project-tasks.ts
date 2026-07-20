import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { notifyUsers } from "@/server/notifications";
import { mockEnabled, mockPlanFromText } from "@/server/q/mock";
import { llmChat, llmEnabled, llmModel } from "@/server/q/llm";

/**
 * MVP1 PRD Modules 5–7 + Phase 6.1 (docs/15) — executable project tasks.
 *  - AI task generation from a BRD/plan (pasted text; the internal text model can't read
 *    PDFs directly, so PDF-only input falls back to the deterministic mock).
 *  - Task management. Status: NotStarted | InProgress | InReview | InQA | Completed.
 *    "Blocked" is a FLAG, not a status — a task is blocked while an Open Blocker links to
 *    it (flag/unflag below), so the board keeps showing WHERE work stalled.
 *  - Task keys ("<project.code>-<n>") are claimed from ProjectTaskCounter transactionally
 *    on publish/manual create; Drafts carry none (they'd burn numbers before approval).
 *  - Auto progress = completed ÷ total (no manual % updates).
 * All reads/writes are tenant-scoped (RLS) and mutations are audited.
 */
export const TASK_STATUSES = ["NotStarted", "InProgress", "InReview", "InQA", "Completed"] as const;
export const TASK_TYPES = ["Feature", "Bug", "Chore", "Spike", "Improvement"] as const;
export const TASK_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export const TASK_SEVERITIES = ["Low", "Medium", "High", "Critical"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskType = (typeof TASK_TYPES)[number];

export class TaskError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "BAD_INPUT" | "AI_UNAVAILABLE",
  ) {
    super(message);
    this.name = "TaskError";
  }
}

export interface ProjectTaskRow {
  id: string;
  title: string;
  description: string | null;
  phase: string | null;
  ownerRole: string | null;
  priority: string;
  status: string;
  approvalStatus: string;
  type: string;
  taskKey: string | null;
  severity: string | null;
  estimate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: Date | null;
  orderIndex: number;
  /** Open linked Blocker, if any — the "blocked" flag (id lets the board resolve it). */
  openBlockerId: string | null;
  blocked: boolean;
  /** Last mutation (any) — feeds the board's aging tint and the 6.4 nudger. */
  lastActivityAt: Date;
}

const OPEN_BLOCKER_SELECT = {
  where: { status: "Open" },
  select: { id: true, description: true },
  take: 1,
} as const;

export async function listProjectTasks(ctx: TenantContext, projectId: string): Promise<ProjectTaskRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.projectTask.findMany({
      where: { projectId },
      include: { assignee: { select: { name: true } }, blockers: OPEN_BLOCKER_SELECT },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      phase: t.phase,
      ownerRole: t.ownerRole,
      priority: t.priority,
      status: t.status,
      approvalStatus: t.approvalStatus,
      type: t.type,
      taskKey: t.taskKey,
      severity: t.severity,
      estimate: t.estimate,
      assigneeId: t.assigneeId,
      assigneeName: t.assignee?.name ?? null,
      dueDate: t.dueDate,
      orderIndex: t.orderIndex,
      openBlockerId: t.blockers[0]?.id ?? null,
      blocked: t.blockers.length > 0,
      lastActivityAt: t.lastActivityAt,
    }));
  });
}

export interface MyTaskRow {
  id: string;
  title: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  status: string;
  priority: string;
  blocked: boolean;
  /** Why it's stuck (the open linked blocker's description) — shown in the Blocked bucket. */
  blockedReason: string | null;
  dueDate: Date | null;
  updatedAt: Date;
}

/** Tasks assigned to a user across all projects — powers the My Tasks page (PRD member view). */
export async function listMyTasks(ctx: TenantContext, userId: string): Promise<MyTaskRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.projectTask.findMany({
      where: { assigneeId: userId, approvalStatus: { not: "Draft" } },
      include: { project: { select: { code: true, name: true } }, blockers: OPEN_BLOCKER_SELECT },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(rowToMyTask);
  });
}

const PM_PROJECT_ROLES = ["Project Manager"];

function rowToMyTask(t: {
  id: string;
  title: string;
  projectId: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  updatedAt: Date;
  project: { code: string; name: string };
  blockers: { id: string; description: string }[];
}): MyTaskRow {
  return {
    id: t.id,
    title: t.title,
    projectId: t.projectId,
    projectCode: t.project.code,
    projectName: t.project.name,
    status: t.status,
    priority: t.priority,
    blocked: t.blockers.length > 0,
    blockedReason: t.blockers[0]?.description ?? null,
    dueDate: t.dueDate,
    updatedAt: t.updatedAt,
  };
}

/** Open tasks on projects the viewer runs (lead or PM-member), assigned to someone else —
 * the PM "across my projects" bucket in My Tasks (§6). */
export async function listManagedTasks(ctx: TenantContext, userId: string): Promise<MyTaskRow[]> {
  return withTenant(ctx, async (tx) => {
    const [led, pm] = await Promise.all([
      tx.project.findMany({ where: { leadUserId: userId }, select: { id: true } }),
      tx.projectMember.findMany({ where: { userId, role: { in: PM_PROJECT_ROLES } }, select: { projectId: true } }),
    ]);
    const ids = [...new Set([...led.map((p) => p.id), ...pm.map((m) => m.projectId)])];
    if (!ids.length) return [];
    const rows = await tx.projectTask.findMany({
      where: { projectId: { in: ids }, status: { not: "Completed" }, approvalStatus: { not: "Draft" }, NOT: { assigneeId: userId } },
      include: { project: { select: { code: true, name: true } }, blockers: OPEN_BLOCKER_SELECT },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(rowToMyTask);
  });
}

/** Open tasks in a Testing / UAT / SIT phase, in a QA board status (InReview/InQA), or typed
 * Bug — the HeadOfQA "in test" bucket in My Tasks (§6, extended by Phase 6.1). */
export async function listTasksInTestPhase(ctx: TenantContext): Promise<MyTaskRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.projectTask.findMany({
      where: {
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
      include: { project: { select: { code: true, name: true } }, blockers: OPEN_BLOCKER_SELECT },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(rowToMyTask);
  });
}

export interface ProjectProgress {
  total: number;
  completed: number;
  inProgress: number;
  blocked: number;
  pct: number;
}

/** PRD Module 7 — progress is derived, never manually set. "Blocked" counts tasks with an
 * Open linked Blocker (a flag since Phase 6.1, so a blocked task keeps its column). */
export async function getProjectProgress(ctx: TenantContext, projectId: string): Promise<ProjectProgress> {
  return withTenant(ctx, async (tx) => {
    const [rows, openLinks] = await Promise.all([
      tx.projectTask.findMany({ where: { projectId, approvalStatus: { not: "Draft" } }, select: { status: true } }),
      tx.blocker.findMany({
        where: { projectId, status: "Open", taskId: { not: null }, task: { approvalStatus: { not: "Draft" } } },
        select: { taskId: true },
      }),
    ]);
    const total = rows.length;
    const completed = rows.filter((r) => r.status === "Completed").length;
    return {
      total,
      completed,
      inProgress: rows.filter((r) => r.status === "InProgress").length,
      blocked: new Set(openLinks.map((b) => b.taskId)).size,
      pct: total ? Math.round((completed / total) * 100) : 0,
    };
  });
}

export const TaskInput = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  phase: z.string().nullable().optional(),
  ownerRole: z.string().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  type: z.enum(TASK_TYPES).optional(),
  severity: z.enum(TASK_SEVERITIES).nullable().optional(),
  // Assign + place on creation (per Joyce): a writer picks the developer/tester and the
  // starting column in one step instead of creating then editing.
  status: z.enum(TASK_STATUSES).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  // Bugs: the task the defect was found while testing (QA lens, 6.2).
  parentTaskId: z.string().uuid().nullable().optional(),
  estimate: z.string().nullable().optional(),
});
export type TaskInput = z.infer<typeof TaskInput>;

/** Claim `count` sequential task keys ("<project.code>-<n>") for a project. The counter row
 * is UPDATE-locked for the duration of the enclosing transaction, so concurrent claims
 * serialize; the @@unique(projectId, taskKey) index is the backstop. Never count rows. */
async function allocateTaskKeys(
  tx: Prisma.TransactionClient,
  tenantId: string,
  projectId: string,
  count: number,
): Promise<string[]> {
  const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { code: true } });
  await tx.$executeRaw`INSERT INTO "project_task_counter" ("tenant_id", "project_id") VALUES (${tenantId}, ${projectId}) ON CONFLICT ("project_id") DO NOTHING`;
  const rows = await tx.$queryRaw<{ next: number }[]>`UPDATE "project_task_counter" SET "next" = "next" + ${count} WHERE "project_id" = ${projectId} RETURNING "next"`;
  const end = rows[0]?.next;
  if (!end) throw new TaskError("Could not allocate task keys.", "BAD_INPUT");
  const start = end - count;
  return Array.from({ length: count }, (_, i) => `${project.code}-${start + i}`);
}

/** Bulk-add tasks (PM approving an AI-generated plan, or a manual add of one). Published
 * tasks get a task key immediately; Drafts get theirs on approval (§2.2). Audited. */
export async function addTasks(
  ctx: TenantContext,
  projectId: string,
  tasks: TaskInput[],
  opts?: { approvalStatus?: "Draft" | "Published"; reporterId?: string; sourceDocumentId?: string },
) {
  if (tasks.length === 0) throw new TaskError("No tasks to add.", "BAD_INPUT");
  return withTenant(ctx, async (tx) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, name: true } });
    const assigneeIds = [...new Set(tasks.map((t) => t.assigneeId).filter((id): id is string => !!id))];
    if (assigneeIds.length) {
      const found = await tx.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true } });
      if (found.length !== assigneeIds.length) throw new TaskError("Assignee not found.", "BAD_INPUT");
    }
    const parentIds = [...new Set(tasks.map((t) => t.parentTaskId).filter((id): id is string => !!id))];
    if (parentIds.length) {
      const found = await tx.projectTask.findMany({ where: { id: { in: parentIds }, projectId }, select: { id: true } });
      if (found.length !== parentIds.length) throw new TaskError("Parent task not found on this project.", "BAD_INPUT");
    }
    const approvalStatus = opts?.approvalStatus ?? "Published";
    const keys = approvalStatus === "Published" ? await allocateTaskKeys(tx, ctx.tenantId, projectId, tasks.length) : [];
    const max = await tx.projectTask.aggregate({ where: { projectId }, _max: { orderIndex: true } });
    let order = (max._max.orderIndex ?? -1) + 1;
    const created = await tx.projectTask.createManyAndReturn({
      data: tasks.map((t, i) => ({
        tenantId: ctx.tenantId,
        projectId,
        title: t.title,
        description: t.description ?? null,
        phase: t.phase ?? null,
        ownerRole: t.ownerRole ?? null,
        priority: t.priority ?? "Medium",
        type: t.type ?? "Feature",
        severity: t.severity ?? null,
        status: t.status ?? "NotStarted",
        assigneeId: t.assigneeId ?? null,
        parentTaskId: t.parentTaskId ?? null,
        taskKey: keys[i] ?? null,
        reporterId: opts?.reporterId ?? null,
        sourceDocumentId: opts?.sourceDocumentId ?? null,
        estimate: t.estimate ?? null,
        approvalStatus,
        orderIndex: order++,
      })),
      select: { id: true, title: true, type: true, assigneeId: true },
    });
    // Tell people work landed on them (6.2) — but never for Drafts (unapproved AI output
    // must stay invisible, §2.2) and never the creator assigning to themselves. Links
    // deep-link to the highlighted card (work-cycle UX).
    if (approvalStatus === "Published") {
      await notifyUsers(
        tx,
        ctx,
        created
          .filter((t) => t.assigneeId && t.assigneeId !== ctx.userId)
          .map((t) => ({
            userId: t.assigneeId as string,
            kind: "task_assigned",
            message: `${t.type === "Bug" ? "Bug" : "Task"} assigned to you on ${project.name}: ${t.title.slice(0, 90)}`,
            link: `/projects/${projectId}?tab=Board&task=${t.id}`,
          })),
      );
    }
    await audit(tx, ctx, {
      action: "create",
      entityType: "project_task",
      entityId: projectId,
      after: { added: tasks.length, approvalStatus },
    });
    return { added: tasks.length };
  });
}

/** Approve a project's Draft tasks → Published (§2.2). Optionally a subset by id. Each
 * published task gets its key here (Drafts never hold one). Audited. */
export async function publishProjectDrafts(
  ctx: TenantContext,
  projectId: string,
  taskIds?: string[],
): Promise<{ published: number }> {
  return withTenant(ctx, async (tx) => {
    const drafts = await tx.projectTask.findMany({
      where: { projectId, approvalStatus: "Draft", ...(taskIds?.length ? { id: { in: taskIds } } : {}) },
      select: { id: true, taskKey: true },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    });
    if (drafts.length === 0) return { published: 0 };
    const needKeys = drafts.filter((d) => !d.taskKey);
    const keys = needKeys.length ? await allocateTaskKeys(tx, ctx.tenantId, projectId, needKeys.length) : [];
    const keyFor = new Map(needKeys.map((d, i) => [d.id, keys[i]]));
    const now = new Date();
    for (const d of drafts) {
      await tx.projectTask.update({
        where: { id: d.id },
        data: { approvalStatus: "Published", taskKey: keyFor.get(d.id) ?? undefined, lastActivityAt: now },
      });
    }
    await audit(tx, ctx, {
      action: "update",
      entityType: "project_task",
      entityId: projectId,
      after: { published: drafts.length },
    });
    return { published: drafts.length };
  });
}

export const UpdateTaskInput = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  type: z.enum(TASK_TYPES).optional(),
  severity: z.enum(TASK_SEVERITIES).nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  approvalStatus: z.enum(["Draft", "Published"]).optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInput>;

/** Update a task's status / type / assignee / due date (PRD M6). Publishing a single Draft
 * here also claims its task key. Every update touches lastActivityAt (nudger staleness).
 * Notifies (6.2): a newly-assigned person; the REPORTER when a Bug reaches InQA — QA closes
 * bugs, developers don't self-certify. Audited. */
export async function updateTask(ctx: TenantContext, taskId: string, input: UpdateTaskInput) {
  return withTenant(ctx, async (tx) => {
    const before = await tx.projectTask.findUnique({
      where: { id: taskId },
      select: {
        title: true, status: true, approvalStatus: true, taskKey: true, projectId: true,
        assigneeId: true, type: true, reporterId: true,
        project: { select: { name: true } },
      },
    });
    if (!before) throw new TaskError("Task not found.", "NOT_FOUND");
    if (input.assigneeId) {
      await tx.user.findUniqueOrThrow({ where: { id: input.assigneeId } }).catch(() => {
        throw new TaskError("Assignee not found.", "BAD_INPUT");
      });
    }
    const publishing = input.approvalStatus === "Published" && before.approvalStatus === "Draft" && !before.taskKey;
    const [taskKey] = publishing ? await allocateTaskKeys(tx, ctx.tenantId, before.projectId, 1) : [undefined];
    const updated = await tx.projectTask.update({
      where: { id: taskId },
      data: {
        status: input.status,
        type: input.type,
        severity: input.severity === undefined ? undefined : input.severity,
        assigneeId: input.assigneeId === undefined ? undefined : input.assigneeId,
        dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
        approvalStatus: input.approvalStatus,
        taskKey,
        lastActivityAt: new Date(),
      },
    });
    if (updated.approvalStatus === "Published") {
      const notes: { userId: string; kind: string; message: string; link?: string }[] = [];
      const label = updated.taskKey ? `${updated.taskKey} ${before.title}` : before.title;
      if (input.assigneeId && input.assigneeId !== before.assigneeId && input.assigneeId !== ctx.userId) {
        notes.push({
          userId: input.assigneeId,
          kind: "task_assigned",
          message: `${before.type === "Bug" ? "Bug" : "Task"} assigned to you on ${before.project.name}: ${label.slice(0, 90)}`,
          link: `/projects/${before.projectId}?tab=Board&task=${taskId}`,
        });
      }
      const reachedQa = input.status === "InQA" && before.status !== "InQA";
      if (reachedQa && before.type === "Bug" && before.reporterId && before.reporterId !== ctx.userId) {
        notes.push({
          userId: before.reporterId,
          kind: "bug_ready_for_qa",
          message: `Your bug is ready to verify on ${before.project.name}: ${label.slice(0, 90)}`,
          link: `/projects/${before.projectId}?tab=Board&task=${taskId}&lens=qa`,
        });
      }
      await notifyUsers(tx, ctx, notes);
    }
    await audit(tx, ctx, {
      action: "update",
      entityType: "project_task",
      entityId: taskId,
      before: { status: before.status },
      after: { status: updated.status, assigneeId: updated.assigneeId },
    });
    return updated;
  });
}

export async function setTaskStatus(ctx: TenantContext, taskId: string, status: TaskStatus) {
  return withTenant(ctx, async (tx) => {
    const task = await tx.projectTask.findUnique({ where: { id: taskId }, select: { status: true } });
    if (!task) throw new TaskError("Task not found.", "NOT_FOUND");
    const updated = await tx.projectTask.update({ where: { id: taskId }, data: { status, lastActivityAt: new Date() } });
    await audit(tx, ctx, {
      action: "update",
      entityType: "project_task",
      entityId: taskId,
      before: { status: task.status },
      after: { status },
    });
    return updated;
  });
}

/** Flag a task blocked: creates an Open Blocker linked to the task (a reason is required —
 * that's what makes the flag useful to the nudger and reports). Audited. */
export async function flagTaskBlocked(
  ctx: TenantContext,
  taskId: string,
  input: { description: string; severity?: "Low" | "Medium" | "Critical" },
) {
  if (!input.description.trim()) throw new TaskError("A blocked reason is required.", "BAD_INPUT");
  return withTenant(ctx, async (tx) => {
    const task = await tx.projectTask.findUnique({
      where: { id: taskId },
      select: { projectId: true, blockers: { where: { status: "Open" }, select: { id: true } } },
    });
    if (!task) throw new TaskError("Task not found.", "NOT_FOUND");
    if (task.blockers.length > 0) throw new TaskError("Task is already flagged blocked.", "BAD_INPUT");
    const blocker = await tx.blocker.create({
      data: {
        tenantId: ctx.tenantId,
        projectId: task.projectId,
        taskId,
        description: input.description.trim(),
        severity: input.severity ?? "Medium",
        status: "Open",
        ownerId: ctx.userId,
      },
    });
    await tx.projectTask.update({ where: { id: taskId }, data: { lastActivityAt: new Date() } });
    await audit(tx, ctx, {
      action: "create",
      entityType: "blocker",
      entityId: blocker.id,
      after: { taskId, description: blocker.description, severity: blocker.severity },
    });
    return blocker;
  });
}

/** Unflag: resolve the task's Open linked Blocker(s). Audited. */
export async function unflagTaskBlocked(ctx: TenantContext, taskId: string, resolutionNotes?: string) {
  return withTenant(ctx, async (tx) => {
    const open = await tx.blocker.findMany({ where: { taskId, status: "Open" }, select: { id: true } });
    if (open.length === 0) return { resolved: 0 };
    await tx.blocker.updateMany({
      where: { id: { in: open.map((b) => b.id) } },
      data: { status: "Resolved", resolutionNotes: resolutionNotes?.trim() || "Unflagged from the board" },
    });
    await tx.projectTask.update({ where: { id: taskId }, data: { lastActivityAt: new Date() } });
    for (const b of open) {
      await audit(tx, ctx, {
        action: "update",
        entityType: "blocker",
        entityId: b.id,
        before: { status: "Open" },
        after: { status: "Resolved", taskId },
      });
    }
    return { resolved: open.length };
  });
}

export async function removeTask(ctx: TenantContext, taskId: string) {
  return withTenant(ctx, async (tx) => {
    await tx.projectTask.deleteMany({ where: { id: taskId } });
    await audit(tx, ctx, { action: "delete", entityType: "project_task", entityId: taskId, before: { id: taskId } });
    return { id: taskId };
  });
}

// ── AI plan/task generation (PRD Modules 3–5) ────────────────────────────────────

const PlanSchema = z.object({
  summary: z.string().default(""),
  risks: z.array(z.string()).default([]),
  phases: z
    .array(
      z.object({
        name: z.string(),
        tasks: z
          .array(
            z.object({
              title: z.string(),
              description: z.string().optional().default(""),
              ownerRole: z.string().optional().default(""),
              priority: z.enum(TASK_PRIORITIES).optional().default("Medium"),
              estimate: z.string().optional().default(""),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});
export type GeneratedPlan = z.infer<typeof PlanSchema>;

const SYSTEM =
  "You are Q, a senior project planner. From the supplied business requirements " +
  "(BRD/plan text or document), produce an executable project plan for review. Use the " +
  "standard delivery phases where they fit (Discovery, Requirements, Design, Development, " +
  "Testing, UAT, Deployment, Hypercare) and derive concrete, actionable tasks under each. " +
  "For every task give a short title, a one-line description, a suggested owner role (from: " +
  "Sponsor, Business Owner, Project Manager, Product Owner, Business Analyst, Technical Lead, " +
  "QA Lead, Developer, UX Designer, Stakeholder), a priority (Low|Medium|High|Critical), and a " +
  "rough estimate (e.g. '3d'). Base everything ONLY on the provided material; do not invent " +
  "scope. Respond with ONLY a JSON object of shape " +
  '{"summary":string,"risks":string[],"phases":[{"name":string,"tasks":[{"title":string,' +
  '"description":string,"ownerRole":string,"priority":string,"estimate":string}]}]} — no prose, no code fences.';

/** Generate a plan+tasks PREVIEW from a document (not persisted). Logs metrics to AiCallLog. */
export async function generatePlan(
  ctx: TenantContext,
  projectId: string,
  input: { text?: string; pdfBase64?: string; tenantName: string },
): Promise<GeneratedPlan> {
  if (!input.text?.trim() && !input.pdfBase64) {
    throw new TaskError("Provide a document or pasted requirements text.", "BAD_INPUT");
  }
  // The internal box is a text model (no native PDF): PDF-only input uses the mock if on,
  // otherwise asks for pasted text. Text input works with the provider or the mock.
  if (!llmEnabled() || (!input.text?.trim() && input.pdfBase64)) {
    if (mockEnabled()) return mockPlanFromText(input.text ?? "");
    if (!llmEnabled())
      throw new TaskError("AI generation needs the Q AI service configured. You can still add tasks manually.", "AI_UNAVAILABLE");
    throw new TaskError("This AI provider can't read PDFs directly — paste the requirements text instead.", "BAD_INPUT");
  }
  await withTenant(ctx, (tx) => tx.project.findUniqueOrThrow({ where: { id: projectId } }));

  const start = Date.now();
  let plan: GeneratedPlan;
  let usage = { input_tokens: 0, output_tokens: 0 };
  try {
    const response = await llmChat({
      maxTokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: `Business requirements:\n\n${input.text!.trim()}` }],
    });
    usage = { input_tokens: response.inputTokens, output_tokens: response.outputTokens };
    const text = response.text.trim();
    const json = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    plan = PlanSchema.parse(JSON.parse(json));
  } catch (e) {
    if (e instanceof TaskError) throw e;
    throw new TaskError("The AI couldn’t produce a usable plan from that input. Try clearer text.", "BAD_INPUT");
  }

  await withTenant(ctx, (tx) =>
    tx.aiCallLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        purpose: "plan:generate",
        model: llmModel(),
        usedAi: true,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        latencyMs: Date.now() - start,
      },
    }),
  ).catch(() => {});

  return plan;
}
