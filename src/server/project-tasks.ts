import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { mockEnabled, mockPlanFromText } from "@/server/q/mock";
import { llmChat, llmEnabled, llmModel } from "@/server/q/llm";

/**
 * MVP1 PRD Modules 5–7 — executable project tasks.
 *  - AI task generation from a BRD/plan (pasted text; the internal text model can't read
 *    PDFs directly, so PDF-only input falls back to the deterministic mock).
 *  - Task management (status: NotStarted | InProgress | Blocked | Completed).
 *  - Auto progress = completed ÷ total (no manual % updates).
 * All reads/writes are tenant-scoped (RLS) and mutations are audited.
 */
export const TASK_STATUSES = ["NotStarted", "InProgress", "Blocked", "Completed"] as const;
export const TASK_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

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
  estimate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: Date | null;
  orderIndex: number;
}

export async function listProjectTasks(ctx: TenantContext, projectId: string): Promise<ProjectTaskRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.projectTask.findMany({
      where: { projectId },
      include: { assignee: { select: { name: true } } },
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
      estimate: t.estimate,
      assigneeId: t.assigneeId,
      assigneeName: t.assignee?.name ?? null,
      dueDate: t.dueDate,
      orderIndex: t.orderIndex,
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
  dueDate: Date | null;
  updatedAt: Date;
}

/** Tasks assigned to a user across all projects — powers the My Tasks page (PRD member view). */
export async function listMyTasks(ctx: TenantContext, userId: string): Promise<MyTaskRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.projectTask.findMany({
      where: { assigneeId: userId },
      include: { project: { select: { code: true, name: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((t) => ({
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      projectCode: t.project.code,
      projectName: t.project.name,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      updatedAt: t.updatedAt,
    }));
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
}): MyTaskRow {
  return {
    id: t.id,
    title: t.title,
    projectId: t.projectId,
    projectCode: t.project.code,
    projectName: t.project.name,
    status: t.status,
    priority: t.priority,
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
      where: { projectId: { in: ids }, status: { not: "Completed" }, NOT: { assigneeId: userId } },
      include: { project: { select: { code: true, name: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(rowToMyTask);
  });
}

/** Open tasks in a Testing / UAT / SIT phase — the HeadOfQA "in test" bucket in My Tasks (§6). */
export async function listTasksInTestPhase(ctx: TenantContext): Promise<MyTaskRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.projectTask.findMany({
      where: {
        status: { not: "Completed" },
        OR: [
          { phase: { contains: "Test", mode: "insensitive" } },
          { phase: { contains: "UAT", mode: "insensitive" } },
          { phase: { contains: "SIT", mode: "insensitive" } },
        ],
      },
      include: { project: { select: { code: true, name: true } } },
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

/** PRD Module 7 — progress is derived, never manually set. */
export async function getProjectProgress(ctx: TenantContext, projectId: string): Promise<ProjectProgress> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.projectTask.findMany({ where: { projectId }, select: { status: true } });
    const total = rows.length;
    const completed = rows.filter((r) => r.status === "Completed").length;
    return {
      total,
      completed,
      inProgress: rows.filter((r) => r.status === "InProgress").length,
      blocked: rows.filter((r) => r.status === "Blocked").length,
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
  estimate: z.string().nullable().optional(),
});
export type TaskInput = z.infer<typeof TaskInput>;

/** Bulk-add tasks (PM approving an AI-generated plan, or a manual add of one). Audited. */
export async function addTasks(ctx: TenantContext, projectId: string, tasks: TaskInput[]) {
  if (tasks.length === 0) throw new TaskError("No tasks to add.", "BAD_INPUT");
  return withTenant(ctx, async (tx) => {
    await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    const max = await tx.projectTask.aggregate({ where: { projectId }, _max: { orderIndex: true } });
    let order = (max._max.orderIndex ?? -1) + 1;
    await tx.projectTask.createMany({
      data: tasks.map((t) => ({
        tenantId: ctx.tenantId,
        projectId,
        title: t.title,
        description: t.description ?? null,
        phase: t.phase ?? null,
        ownerRole: t.ownerRole ?? null,
        priority: t.priority ?? "Medium",
        estimate: t.estimate ?? null,
        orderIndex: order++,
      })),
    });
    await audit(tx, ctx, {
      action: "create",
      entityType: "project_task",
      entityId: projectId,
      after: { added: tasks.length },
    });
    return { added: tasks.length };
  });
}

export const UpdateTaskInput = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInput>;

/** Update a task's status / assignee / due date (PRD M6). Audited. */
export async function updateTask(ctx: TenantContext, taskId: string, input: UpdateTaskInput) {
  return withTenant(ctx, async (tx) => {
    const before = await tx.projectTask.findUnique({ where: { id: taskId }, select: { status: true } });
    if (!before) throw new TaskError("Task not found.", "NOT_FOUND");
    if (input.assigneeId) {
      await tx.user.findUniqueOrThrow({ where: { id: input.assigneeId } }).catch(() => {
        throw new TaskError("Assignee not found.", "BAD_INPUT");
      });
    }
    const updated = await tx.projectTask.update({
      where: { id: taskId },
      data: {
        status: input.status,
        assigneeId: input.assigneeId === undefined ? undefined : input.assigneeId,
        dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
      },
    });
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
    const updated = await tx.projectTask.update({ where: { id: taskId }, data: { status } });
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
