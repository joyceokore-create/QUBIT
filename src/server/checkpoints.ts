import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { emitDomainEvent } from "@/server/events";

/**
 * Delivery checkpoints (docs/18 §2). The gates a project marches through are DATA — a
 * tenant-scoped template holds an ordered list, the project picks one, and state is
 * tracked per unit of tracking: the project itself (orgUnitId null, the pipeline lens)
 * or a project × market track (rollout lens, M-D-B).
 *
 * The point of all this: **% complete is DERIVED from checkpoint state and never typed**
 * (§2). The slide's hand-maintained percentages become computed and therefore current.
 */

export const CHECKPOINT_STATES = ["NotStarted", "InProgress", "Done", "Blocked"] as const;
export type CheckpointState = (typeof CHECKPOINT_STATES)[number];

/** Done counts fully, InProgress counts half; Blocked and NotStarted count nothing —
 * a blocked gate is honest about being stuck, not half-credited (§2 "weighted count"). */
const WEIGHT: Record<CheckpointState, number> = { Done: 1, InProgress: 0.5, Blocked: 0, NotStarted: 0 };

/** Derived completion for one track. Pure, so the maths is unit-testable. */
export function derivedProgress(states: CheckpointState[]): number {
  if (states.length === 0) return 0;
  const earned = states.reduce((sum, s) => sum + (WEIGHT[s] ?? 0), 0);
  return Math.round((earned / states.length) * 100);
}

export interface CheckpointRow {
  checkpointId: string;
  name: string;
  orderIndex: number;
  state: CheckpointState;
  blockerId: string | null;
  blockerReason: string | null;
}

export interface ProjectCheckpoints {
  templateId: string | null;
  templateName: string | null;
  rows: CheckpointRow[];
  /** Derived % across the rows — the number every surface shows. */
  progress: number;
}

/** The project's own checkpoint track (orgUnitId null). Rows exist for every checkpoint
 * in the template, whether or not a status row has been written yet. */
export async function getProjectCheckpoints(
  ctx: TenantContext,
  projectId: string,
): Promise<ProjectCheckpoints> {
  return withTenant(ctx, async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        checkpointTemplateId: true,
        checkpointTemplate: {
          select: { name: true, checkpoints: { select: { id: true, name: true, orderIndex: true }, orderBy: { orderIndex: "asc" } } },
        },
      },
    });
    if (!project?.checkpointTemplateId || !project.checkpointTemplate) {
      return { templateId: null, templateName: null, rows: [], progress: 0 };
    }
    const statuses = await tx.checkpointStatus.findMany({
      where: { projectId, orgUnitId: null },
      select: { checkpointId: true, state: true, blockerId: true, blocker: { select: { description: true } } },
    });
    const byCheckpoint = new Map(statuses.map((s) => [s.checkpointId, s]));

    const rows: CheckpointRow[] = project.checkpointTemplate.checkpoints.map((c) => {
      const s = byCheckpoint.get(c.id);
      return {
        checkpointId: c.id,
        name: c.name,
        orderIndex: c.orderIndex,
        state: ((s?.state ?? "NotStarted") as CheckpointState),
        blockerId: s?.blockerId ?? null,
        blockerReason: s?.blocker?.description ?? null,
      };
    });
    return {
      templateId: project.checkpointTemplateId,
      templateName: project.checkpointTemplate.name,
      rows,
      progress: derivedProgress(rows.map((r) => r.state)),
    };
  });
}

/** Derived % for many projects at once — used by the pipeline/dashboard surfaces so they
 * never disagree with the workspace. Projects without a template are absent from the map
 * and keep their per-subsidiary rollup (see progressFor). */
export async function checkpointProgressByProject(
  tx: Prisma.TransactionClient,
  projectIds: string[],
): Promise<Map<string, number>> {
  if (!projectIds.length) return new Map();
  const [projects, statuses] = await Promise.all([
    tx.project.findMany({
      where: { id: { in: projectIds }, checkpointTemplateId: { not: null } },
      select: { id: true, checkpointTemplate: { select: { _count: { select: { checkpoints: true } } } } },
    }),
    tx.checkpointStatus.findMany({
      where: { projectId: { in: projectIds }, orgUnitId: null },
      select: { projectId: true, state: true },
    }),
  ]);
  const statesByProject = new Map<string, CheckpointState[]>();
  for (const s of statuses) {
    const list = statesByProject.get(s.projectId) ?? [];
    list.push(s.state as CheckpointState);
    statesByProject.set(s.projectId, list);
  }
  const out = new Map<string, number>();
  for (const p of projects) {
    const total = p.checkpointTemplate?._count.checkpoints ?? 0;
    if (!total) continue;
    // Checkpoints with no status row yet are NotStarted — pad so the denominator is the
    // whole template, never just the rows somebody happened to touch.
    const states = statesByProject.get(p.id) ?? [];
    const padded = [...states, ...Array<CheckpointState>(Math.max(0, total - states.length)).fill("NotStarted")];
    out.set(p.id, derivedProgress(padded.slice(0, total)));
  }
  return out;
}

/** Ordered gate states per project, padded to the full template — the pipeline row's
 * tick strip (docs/18 §2/§10 "stage headers with counts, gate ticks, %"). Projects
 * without a template are absent from the map. */
export async function gateTicksByProject(
  tx: Prisma.TransactionClient,
  projectIds: string[],
): Promise<Map<string, CheckpointState[]>> {
  if (!projectIds.length) return new Map();
  const projects = await tx.project.findMany({
    where: { id: { in: projectIds }, checkpointTemplateId: { not: null } },
    select: {
      id: true,
      checkpointTemplate: { select: { checkpoints: { select: { id: true }, orderBy: { orderIndex: "asc" } } } },
    },
  });
  if (!projects.length) return new Map();

  const statuses = await tx.checkpointStatus.findMany({
    where: { projectId: { in: projects.map((p) => p.id) }, orgUnitId: null },
    select: { projectId: true, checkpointId: true, state: true },
  });
  const stateFor = new Map(statuses.map((s) => [`${s.projectId}:${s.checkpointId}`, s.state as CheckpointState]));

  const out = new Map<string, CheckpointState[]>();
  for (const p of projects) {
    const ordered = (p.checkpointTemplate?.checkpoints ?? []).map(
      (c) => stateFor.get(`${p.id}:${c.id}`) ?? ("NotStarted" as CheckpointState),
    );
    if (ordered.length) out.set(p.id, ordered);
  }
  return out;
}

export class CheckpointError extends Error {
  code: "NOT_FOUND" | "BLOCKER_REQUIRED" | "TEMPLATE_MISMATCH";
  constructor(message: string, code: CheckpointError["code"]) {
    super(message);
    this.code = code;
  }
}

export const SetCheckpointStateInput = z.object({
  checkpointId: z.string().min(1),
  state: z.enum(CHECKPOINT_STATES),
  /** Required when moving to Blocked — same flag pattern as tasks (§2). */
  blockerId: z.string().uuid().nullable().optional(),
});
export type SetCheckpointStateInputT = z.infer<typeof SetCheckpointStateInput>;

/** Set one checkpoint's state on the project's own track. Caller holds the governance
 * gate (canWriteProject OR project:stage) — enforced at the route, never here. */
export async function setCheckpointState(
  ctx: TenantContext,
  projectId: string,
  input: SetCheckpointStateInputT,
): Promise<ProjectCheckpoints> {
  await withTenant(ctx, async (tx) => {
    const [project, checkpoint] = await Promise.all([
      tx.project.findUnique({ where: { id: projectId }, select: { checkpointTemplateId: true } }),
      tx.checkpoint.findUnique({ where: { id: input.checkpointId }, select: { id: true, name: true, templateId: true } }),
    ]);
    if (!project || !checkpoint) throw new CheckpointError("Checkpoint not found.", "NOT_FOUND");
    if (project.checkpointTemplateId !== checkpoint.templateId) {
      throw new CheckpointError("That checkpoint belongs to a different template.", "TEMPLATE_MISMATCH");
    }
    if (input.state === "Blocked" && !input.blockerId) {
      throw new CheckpointError("Blocked needs a linked blocker — say what is stuck.", "BLOCKER_REQUIRED");
    }
    if (input.blockerId) {
      const blocker = await tx.blocker.findFirst({
        where: { id: input.blockerId, projectId, status: "Open" },
        select: { id: true },
      });
      if (!blocker) throw new CheckpointError("That blocker is not open on this project.", "NOT_FOUND");
    }

    const before = await tx.checkpointStatus.findFirst({
      where: { projectId, checkpointId: input.checkpointId, orgUnitId: null },
      select: { id: true, state: true },
    });
    const blockerId = input.state === "Blocked" ? (input.blockerId ?? null) : null;

    if (before) {
      await tx.checkpointStatus.update({ where: { id: before.id }, data: { state: input.state, blockerId } });
    } else {
      await tx.checkpointStatus.create({
        data: { tenantId: ctx.tenantId, projectId, checkpointId: input.checkpointId, orgUnitId: null, state: input.state, blockerId },
      });
    }
    if (before?.state === input.state) return;

    await audit(tx, ctx, {
      action: "update",
      entityType: "checkpoint_status",
      entityId: `${projectId}:${input.checkpointId}`,
      before: { state: before?.state ?? "NotStarted" },
      after: { state: input.state, checkpoint: checkpoint.name },
    });
    // The exec delta feed narrates gate movement like any other tracked change.
    await emitDomainEvent(tx, ctx, {
      type: "checkpoint.state_changed",
      entityType: "checkpoint_status",
      entityId: `${projectId}:${input.checkpointId}`,
      payload: { projectId, checkpoint: checkpoint.name, from: before?.state ?? "NotStarted", to: input.state },
    });
  });
  return getProjectCheckpoints(ctx, projectId);
}

export const SetTemplateInput = z.object({ templateId: z.string().min(1).nullable() });

/** Attach (or detach) a project's checkpoint template. Detaching keeps the status rows —
 * re-attaching the same template restores the picture rather than losing history. */
export async function setProjectTemplate(
  ctx: TenantContext,
  projectId: string,
  templateId: string | null,
): Promise<ProjectCheckpoints> {
  await withTenant(ctx, async (tx) => {
    if (templateId) {
      const tmpl = await tx.checkpointTemplate.findUnique({ where: { id: templateId }, select: { id: true, name: true } });
      if (!tmpl) throw new CheckpointError("Template not found.", "NOT_FOUND");
    }
    const before = await tx.project.findUnique({ where: { id: projectId }, select: { checkpointTemplateId: true } });
    if (!before) throw new CheckpointError("Project not found.", "NOT_FOUND");
    if (before.checkpointTemplateId === templateId) return;

    await tx.project.update({ where: { id: projectId }, data: { checkpointTemplateId: templateId } });
    await audit(tx, ctx, {
      action: "update",
      entityType: "project",
      entityId: projectId,
      before: { checkpointTemplateId: before.checkpointTemplateId },
      after: { checkpointTemplateId: templateId },
    });
  });
  return getProjectCheckpoints(ctx, projectId);
}

export interface TemplateOption {
  id: string;
  name: string;
  checkpointCount: number;
}

export async function listCheckpointTemplates(ctx: TenantContext): Promise<TemplateOption[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.checkpointTemplate.findMany({
      select: { id: true, name: true, _count: { select: { checkpoints: true } } },
      orderBy: { name: "asc" },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, checkpointCount: r._count.checkpoints }));
  });
}
