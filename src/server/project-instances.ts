import "server-only";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { emitDomainEvent } from "@/server/events";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { derivedProgress, type CheckpointState } from "@/server/checkpoints";

/**
 * docs/38 (Joyce, 2026-10-07) — a product's NAMED INSTANCES: Asset Valuation "for Schools"
 * and "for Marketplace", Swipe "POS" and "USSD". Each acts like a single project — its own
 * gate states, recorded with the SAME track in every market the product ships to (and at
 * product level when no market is selected) — and a state per market (Planned · Build · UAT
 * · Live · N/A). Stored on the `project_module` / `module_instance_status` tables from the
 * I1 migration (the spec's first name for the idea was "module"; the UI says instance).
 * Everything runs under RLS and is audited.
 */

export const INSTANCE_STATES = ["Planned", "Build", "UAT", "Live", "NotApplicable"] as const;
export type InstanceState = (typeof INSTANCE_STATES)[number];

export class ProjectInstanceError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "CODE_TAKEN" | "HAS_WORK" | "BAD_MARKET",
  ) {
    super(message);
    this.name = "ProjectInstanceError";
  }
}

export interface InstanceCell {
  /** null = the product level (no market). */
  orgUnitId: string | null;
  state: string;
  note: string | null;
  /** Gate-derived % of this instance's own track in this market (stored/derived rule as markets). */
  progress: number;
}

export interface ProjectInstanceRow {
  id: string;
  code: string;
  name: string;
  orderIndex: number;
  cells: InstanceCell[];
}

/** A short code from a name: "For Schools" → SCHOOLS, "Agent Portal" → AGENTPO. */
export function instanceCode(name: string, i = 0): string {
  const words = name.toUpperCase().replace(/^FOR\s+/, "").split(/[^A-Z0-9]+/).filter(Boolean);
  const base = (words.length >= 2 ? words.map((w) => w.slice(0, 4)).join("").slice(0, 8) : (words[0] ?? "").slice(0, 8)) || `INST${i + 1}`;
  return base;
}

export async function listProjectInstances(ctx: TenantContext, projectId: string): Promise<ProjectInstanceRow[]> {
  return withTenant(ctx, async (tx) => {
    const [rows, statuses, gates, project] = await Promise.all([
      tx.projectModule.findMany({ where: { projectId }, select: { id: true, code: true, name: true, orderIndex: true }, orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] }),
      tx.moduleInstanceStatus.findMany({ where: { projectId }, select: { moduleId: true, orgUnitId: true, state: true, note: true } }),
      tx.checkpointStatus.findMany({ where: { projectId, moduleId: { not: null } }, select: { moduleId: true, orgUnitId: true, state: true } }),
      tx.project.findUnique({
        where: { id: projectId },
        select: { checkpointTemplate: { select: { _count: { select: { checkpoints: true } } } }, orgStatuses: { where: { retiredAt: null }, select: { orgUnitId: true } } },
      }),
    ]);
    const total = project?.checkpointTemplate?._count.checkpoints ?? 0;
    const markets: (string | null)[] = [null, ...(project?.orgStatuses.map((o) => o.orgUnitId) ?? [])];
    const key = (m: string, u: string | null) => `${m}:${u ?? "-"}`;
    const statusByKey = new Map(statuses.map((s) => [key(s.moduleId, s.orgUnitId), s]));
    const gatesByKey = new Map<string, CheckpointState[]>();
    for (const g of gates) gatesByKey.set(key(g.moduleId!, g.orgUnitId), [...(gatesByKey.get(key(g.moduleId!, g.orgUnitId)) ?? []), g.state as CheckpointState]);
    return rows.map((r) => ({
      ...r,
      cells: markets.map((u) => {
        const st = statusByKey.get(key(r.id, u));
        const states = gatesByKey.get(key(r.id, u)) ?? [];
        return {
          orgUnitId: u,
          state: st?.state ?? "Planned",
          note: st?.note ?? null,
          progress: total > 0 ? derivedProgress([...states, ...Array<CheckpointState>(Math.max(0, total - states.length)).fill("NotStarted")]) : 0,
        };
      }),
    }));
  });
}

export const CreateInstanceInput = z.object({
  name: z.string().trim().min(1).max(60),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,12}$/).optional(),
});

export async function createProjectInstance(ctx: TenantContext, projectId: string, input: z.infer<typeof CreateInstanceInput>): Promise<ProjectInstanceRow[]> {
  await withTenant(ctx, async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, _count: { select: { modules: true } } } });
    if (!project) throw new ProjectInstanceError("Project not found.", "NOT_FOUND");
    let code = input.code ?? instanceCode(input.name, project._count.modules);
    for (let n = 2; await tx.projectModule.findUnique({ where: { projectId_code: { projectId, code } }, select: { id: true } }); n++) {
      if (input.code) throw new ProjectInstanceError(`${code} is already an instance of this project.`, "CODE_TAKEN");
      code = `${instanceCode(input.name).slice(0, 10)}${n}`;
    }
    const row = await tx.projectModule.create({ data: { tenantId: ctx.tenantId, projectId, code, name: input.name, orderIndex: project._count.modules } });
    await audit(tx, ctx, { action: "create", entityType: "project_instance", entityId: row.id, after: { projectId, code, name: input.name } });
    await emitDomainEvent(tx, ctx, { type: "instance.created", entityType: "project_instance", entityId: row.id, payload: { projectId, code, name: input.name } });
  });
  return listProjectInstances(ctx, projectId);
}

export const UpdateInstanceInput = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  orderIndex: z.number().int().min(0).max(999).optional(),
});

export async function updateProjectInstance(ctx: TenantContext, projectId: string, instanceId: string, input: z.infer<typeof UpdateInstanceInput>): Promise<ProjectInstanceRow[]> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.projectModule.findFirst({ where: { id: instanceId, projectId }, select: { id: true, name: true, orderIndex: true, code: true } });
    if (!before) throw new ProjectInstanceError("That instance is not on this project.", "NOT_FOUND");
    await tx.projectModule.update({ where: { id: instanceId }, data: { name: input.name, orderIndex: input.orderIndex } });
    await audit(tx, ctx, { action: "update", entityType: "project_instance", entityId: instanceId, before: { name: before.name, orderIndex: before.orderIndex }, after: { code: before.code, ...input } });
  });
  return listProjectInstances(ctx, projectId);
}

/** Remove an instance that carries no work (tagged items or recorded gates); otherwise refuse. */
export async function removeProjectInstance(ctx: TenantContext, projectId: string, instanceId: string): Promise<ProjectInstanceRow[]> {
  await withTenant(ctx, async (tx) => {
    const row = await tx.projectModule.findFirst({ where: { id: instanceId, projectId }, select: { id: true, code: true, _count: { select: { tasks: true, documents: true, risks: true, issues: true, blockers: true, milestones: true, checkpointStatuses: true } } } });
    if (!row) throw new ProjectInstanceError("That instance is not on this project.", "NOT_FOUND");
    const work = Object.values(row._count).reduce((a, b) => a + b, 0);
    if (work > 0) throw new ProjectInstanceError(`${row.code} still has ${work} ${work === 1 ? "item" : "items"} (work or gate states) on it — it cannot be removed.`, "HAS_WORK");
    await tx.projectModule.delete({ where: { id: instanceId } });
    await audit(tx, ctx, { action: "delete", entityType: "project_instance", entityId: instanceId, before: { code: row.code } });
  });
  return listProjectInstances(ctx, projectId);
}

export const SetInstanceStateInput = z.object({
  orgUnitId: z.string().uuid().nullable(),
  state: z.enum(INSTANCE_STATES),
  note: z.string().trim().max(200).nullable().optional(),
});

/** The state of one instance in one market (or at product level). Audited; event `instance.state_changed`. */
export async function setInstanceState(ctx: TenantContext, projectId: string, instanceId: string, input: z.infer<typeof SetInstanceStateInput>): Promise<ProjectInstanceRow[]> {
  await withTenant(ctx, async (tx) => {
    const inst = await tx.projectModule.findFirst({ where: { id: instanceId, projectId }, select: { id: true, code: true } });
    if (!inst) throw new ProjectInstanceError("That instance is not on this project.", "NOT_FOUND");
    if (input.orgUnitId) {
      const mk = await tx.projectOrgStatus.findFirst({ where: { projectId, orgUnitId: input.orgUnitId, retiredAt: null }, select: { id: true } });
      if (!mk) throw new ProjectInstanceError("That market is not on this project.", "BAD_MARKET");
    }
    const existing = await tx.moduleInstanceStatus.findFirst({ where: { moduleId: instanceId, orgUnitId: input.orgUnitId }, select: { id: true, state: true, note: true } });
    const data = { state: input.state, note: input.note === undefined ? undefined : input.note, updatedById: ctx.userId };
    const row = existing
      ? await tx.moduleInstanceStatus.update({ where: { id: existing.id }, data })
      : await tx.moduleInstanceStatus.create({ data: { tenantId: ctx.tenantId, projectId, moduleId: instanceId, orgUnitId: input.orgUnitId, ...data, note: input.note ?? null } });
    if (existing?.state === input.state && (input.note === undefined || input.note === existing.note)) return;
    await audit(tx, ctx, { action: "update", entityType: "instance_state", entityId: row.id, before: { state: existing?.state ?? "Planned" }, after: { instance: inst.code, orgUnitId: input.orgUnitId, state: input.state, note: input.note ?? undefined } });
    await emitDomainEvent(tx, ctx, { type: "instance.state_changed", entityType: "instance_state", entityId: row.id, payload: { projectId, instanceId, orgUnitId: input.orgUnitId, from: existing?.state ?? "Planned", to: input.state } });
  });
  return listProjectInstances(ctx, projectId);
}
