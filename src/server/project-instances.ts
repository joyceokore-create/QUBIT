import "server-only";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { emitDomainEvent } from "@/server/events";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { derivedProgress, type CheckpointState } from "@/server/checkpoints";

/**
 * docs/38 (Joyce, 2026-10-07) — a product's NAMED INSTANCES and MODULES, both rows of
 * `project_module` told apart by `kind`:
 *  - an INSTANCE (Asset Valuation "for Schools", "for Marketplace") acts like a single
 *    project: its own gate states, recorded with the SAME track in every market the product
 *    ships to (and at product level), plus a state per market;
 *  - a MODULE (Swipe "USSD", "Agent Portal") is a component of the product or of one
 *    instance (`parentId`), tracked by a state per market (Planned · Build · UAT · Live ·
 *    N/A); it tracks its own gates only when `ownGates` is switched on — per module.
 * States live on `module_instance_status`. Everything runs under RLS and is audited.
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

export type ModuleKind = "instance" | "module";

export interface ProjectInstanceRow {
  id: string;
  code: string;
  name: string;
  orderIndex: number;
  kind: ModuleKind;
  /** Modules only: the instance they sit under (null = the product). */
  parentId: string | null;
  /** Instances always track gates; a module only when switched on. */
  ownGates: boolean;
  /** The gate track this row follows — its own template, or null = the project's. */
  checkpointTemplateId: string | null;
  checkpointTemplateName: string | null;
  cells: InstanceCell[];
}

/** A short code from a name: "For Schools" → SCHOOLS, "Agent Portal" → AGENTPO. */
export function instanceCode(name: string, i = 0): string {
  const words = name.toUpperCase().replace(/^FOR\s+/, "").split(/[^A-Z0-9]+/).filter(Boolean);
  const base = (words.length >= 2 ? words.map((w) => w.slice(0, 4)).join("").slice(0, 8) : (words[0] ?? "").slice(0, 8)) || `INST${i + 1}`;
  return base;
}

export async function listProjectInstances(ctx: TenantContext, projectId: string, kind: ModuleKind = "instance"): Promise<ProjectInstanceRow[]> {
  return withTenant(ctx, async (tx) => {
    const [rows, statuses, gates, project] = await Promise.all([
      tx.projectModule.findMany({ where: { projectId, kind }, select: { id: true, code: true, name: true, orderIndex: true, kind: true, parentId: true, ownGates: true, checkpointTemplateId: true, checkpointTemplate: { select: { name: true, _count: { select: { checkpoints: true } } } } }, orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] }),
      tx.moduleInstanceStatus.findMany({ where: { projectId }, select: { moduleId: true, orgUnitId: true, state: true, note: true } }),
      tx.checkpointStatus.findMany({ where: { projectId, moduleId: { not: null } }, select: { moduleId: true, orgUnitId: true, state: true } }),
      tx.project.findUnique({
        where: { id: projectId },
        select: { checkpointTemplate: { select: { _count: { select: { checkpoints: true } } } }, orgStatuses: { where: { retiredAt: null }, select: { orgUnitId: true } } },
      }),
    ]);
    const projectTotal = project?.checkpointTemplate?._count.checkpoints ?? 0;
    const markets: (string | null)[] = [null, ...(project?.orgStatuses.map((o) => o.orgUnitId) ?? [])];
    const key = (m: string, u: string | null) => `${m}:${u ?? "-"}`;
    const statusByKey = new Map(statuses.map((s) => [key(s.moduleId, s.orgUnitId), s]));
    const gatesByKey = new Map<string, CheckpointState[]>();
    for (const g of gates) gatesByKey.set(key(g.moduleId!, g.orgUnitId), [...(gatesByKey.get(key(g.moduleId!, g.orgUnitId)) ?? []), g.state as CheckpointState]);
    return rows.map(({ checkpointTemplate, ...r }) => ({
      ...r,
      kind: r.kind as ModuleKind,
      checkpointTemplateName: checkpointTemplate?.name ?? null,
      cells: markets.map((u) => {
        // One track for all markets; it may differ per instance (its own template).
        const total = checkpointTemplate?._count.checkpoints ?? projectTotal;
        const st = statusByKey.get(key(r.id, u));
        const states = gatesByKey.get(key(r.id, u)) ?? [];
        const tracksGates = r.kind === "instance" || r.ownGates;
        return {
          orgUnitId: u,
          state: st?.state ?? "Planned",
          note: st?.note ?? null,
          progress: tracksGates && total > 0 ? derivedProgress([...states, ...Array<CheckpointState>(Math.max(0, total - states.length)).fill("NotStarted")]) : 0,
        };
      }),
    }));
  });
}

export const CreateInstanceInput = z.object({
  name: z.string().trim().min(1).max(60),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,12}$/).optional(),
  kind: z.enum(["instance", "module"]).optional(),
  /** Modules: the instance to sit under (null / omitted = the product). */
  parentId: z.string().min(1).nullable().optional(),
  /** Modules: track their own gates (chosen when adding; can be switched later). */
  ownGates: z.boolean().optional(),
});

export async function createProjectInstance(ctx: TenantContext, projectId: string, input: z.infer<typeof CreateInstanceInput>): Promise<ProjectInstanceRow[]> {
  await withTenant(ctx, async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, _count: { select: { modules: true } } } });
    if (!project) throw new ProjectInstanceError("Project not found.", "NOT_FOUND");
    const kind: ModuleKind = input.kind ?? "instance";
    const parentId = kind === "module" ? (input.parentId ?? null) : null;
    if (parentId) {
      const parent = await tx.projectModule.findFirst({ where: { id: parentId, projectId, kind: "instance" }, select: { id: true } });
      if (!parent) throw new ProjectInstanceError("A module can only sit under one of this project's instances.", "NOT_FOUND");
    }
    let code = input.code ?? instanceCode(input.name, project._count.modules);
    for (let n = 2; await tx.projectModule.findUnique({ where: { projectId_code: { projectId, code } }, select: { id: true } }); n++) {
      if (input.code) throw new ProjectInstanceError(`${code} is already an instance of this project.`, "CODE_TAKEN");
      code = `${instanceCode(input.name).slice(0, 10)}${n}`;
    }
    const row = await tx.projectModule.create({ data: { tenantId: ctx.tenantId, projectId, code, name: input.name, orderIndex: project._count.modules, kind, parentId, ownGates: kind === "instance" ? true : Boolean(input.ownGates) } });
    await audit(tx, ctx, { action: "create", entityType: kind === "module" ? "project_module" : "project_instance", entityId: row.id, after: { projectId, code, name: input.name, kind, parentId, ownGates: row.ownGates } });
    await emitDomainEvent(tx, ctx, { type: kind === "module" ? "module.created" : "instance.created", entityType: kind === "module" ? "project_module" : "project_instance", entityId: row.id, payload: { projectId, code, name: input.name, parentId } });
  });
  return listProjectInstances(ctx, projectId, input.kind ?? "instance");
}

export const UpdateInstanceInput = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  orderIndex: z.number().int().min(0).max(999).optional(),
  /** Modules: switch their own gates on or off (gate rows already recorded are kept). */
  ownGates: z.boolean().optional(),
  parentId: z.string().min(1).nullable().optional(),
  /** The gate track this instance / module follows; null = the project's template. */
  checkpointTemplateId: z.string().min(1).nullable().optional(),
});

export async function updateProjectInstance(ctx: TenantContext, projectId: string, instanceId: string, input: z.infer<typeof UpdateInstanceInput>): Promise<ProjectInstanceRow[]> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.projectModule.findFirst({ where: { id: instanceId, projectId }, select: { id: true, name: true, orderIndex: true, code: true, kind: true, ownGates: true, parentId: true } });
    if (!before) throw new ProjectInstanceError("That instance is not on this project.", "NOT_FOUND");
    if (input.parentId) {
      const parent = await tx.projectModule.findFirst({ where: { id: input.parentId, projectId, kind: "instance" }, select: { id: true } });
      if (!parent || before.kind !== "module") throw new ProjectInstanceError("A module can only sit under one of this project's instances.", "NOT_FOUND");
    }
    if (input.checkpointTemplateId) {
      const t = await tx.checkpointTemplate.findUnique({ where: { id: input.checkpointTemplateId }, select: { id: true } });
      if (!t) throw new ProjectInstanceError("Checkpoint template not found.", "NOT_FOUND");
    }
    await tx.projectModule.update({
      where: { id: instanceId },
      data: {
        name: input.name,
        orderIndex: input.orderIndex,
        checkpointTemplateId: input.checkpointTemplateId === undefined ? undefined : input.checkpointTemplateId,
        ...(before.kind === "module" ? { ownGates: input.ownGates, parentId: input.parentId === undefined ? undefined : input.parentId } : {}),
      },
    });
    await audit(tx, ctx, { action: "update", entityType: before.kind === "module" ? "project_module" : "project_instance", entityId: instanceId, before: { name: before.name, orderIndex: before.orderIndex, ownGates: before.ownGates, parentId: before.parentId }, after: { code: before.code, ...input } });
  });
  return listProjectInstances(ctx, projectId, (await kindOf(ctx, projectId, instanceId)) ?? "instance");
}

async function kindOf(ctx: TenantContext, projectId: string, id: string): Promise<ModuleKind | null> {
  const r = await withTenant(ctx, (tx) => tx.projectModule.findFirst({ where: { id, projectId }, select: { kind: true } }));
  return (r?.kind as ModuleKind | undefined) ?? null;
}

/** Remove an instance that carries no work (tagged items or recorded gates); otherwise refuse. */
export async function removeProjectInstance(ctx: TenantContext, projectId: string, instanceId: string): Promise<ProjectInstanceRow[]> {
  let kindRemoved: ModuleKind = "instance";
  await withTenant(ctx, async (tx) => {
    const row = await tx.projectModule.findFirst({ where: { id: instanceId, projectId }, select: { id: true, code: true, kind: true, _count: { select: { tasks: true, documents: true, risks: true, issues: true, blockers: true, milestones: true, checkpointStatuses: true, children: true } } } });
    if (!row) throw new ProjectInstanceError("That instance is not on this project.", "NOT_FOUND");
    const work = Object.values(row._count).reduce((a, b) => a + b, 0);
    if (work > 0) throw new ProjectInstanceError(`${row.code} still has ${work} ${work === 1 ? "item" : "items"} (work, gate states or modules) on it — it cannot be removed.`, "HAS_WORK");
    await tx.projectModule.delete({ where: { id: instanceId } });
    await audit(tx, ctx, { action: "delete", entityType: row.kind === "module" ? "project_module" : "project_instance", entityId: instanceId, before: { code: row.code, kind: row.kind } });
    kindRemoved = row.kind as ModuleKind;
  });
  return listProjectInstances(ctx, projectId, kindRemoved);
}

export const SetInstanceStateInput = z.object({
  orgUnitId: z.string().uuid().nullable(),
  state: z.enum(INSTANCE_STATES),
  note: z.string().trim().max(200).nullable().optional(),
  /** At "All": apply to the product level and every live market at once. */
  allMarkets: z.boolean().optional(),
});

/** The state of one instance in one market (or at product level). Audited; event `instance.state_changed`. */
export async function setInstanceState(ctx: TenantContext, projectId: string, instanceId: string, input: z.infer<typeof SetInstanceStateInput>): Promise<ProjectInstanceRow[]> {
  let kindSet: ModuleKind = "instance";
  await withTenant(ctx, async (tx) => {
    const inst = await tx.projectModule.findFirst({ where: { id: instanceId, projectId }, select: { id: true, code: true, kind: true } });
    if (!inst) throw new ProjectInstanceError("That instance is not on this project.", "NOT_FOUND");
    kindSet = inst.kind as ModuleKind;
    if (input.orgUnitId) {
      const mk = await tx.projectOrgStatus.findFirst({ where: { projectId, orgUnitId: input.orgUnitId, retiredAt: null }, select: { id: true } });
      if (!mk) throw new ProjectInstanceError("That market is not on this project.", "BAD_MARKET");
    }
    // The selected market, or — at "All" — the product level plus every live market.
    const units: (string | null)[] =
      input.allMarkets && !input.orgUnitId
        ? [null, ...(await tx.projectOrgStatus.findMany({ where: { projectId, retiredAt: null }, select: { orgUnitId: true } })).map((m) => m.orgUnitId)]
        : [input.orgUnitId];
    for (const orgUnitId of units) {
      const existing = await tx.moduleInstanceStatus.findFirst({ where: { moduleId: instanceId, orgUnitId }, select: { id: true, state: true, note: true } });
      const data = { state: input.state, note: input.note === undefined ? undefined : input.note, updatedById: ctx.userId };
      const row = existing
        ? await tx.moduleInstanceStatus.update({ where: { id: existing.id }, data })
        : await tx.moduleInstanceStatus.create({ data: { tenantId: ctx.tenantId, projectId, moduleId: instanceId, orgUnitId, ...data, note: input.note ?? null } });
      if (existing?.state === input.state && (input.note === undefined || input.note === existing.note)) continue;
      await audit(tx, ctx, { action: "update", entityType: "instance_state", entityId: row.id, before: { state: existing?.state ?? "Planned" }, after: { instance: inst.code, orgUnitId, state: input.state, note: input.note ?? undefined } });
      await emitDomainEvent(tx, ctx, { type: "instance.state_changed", entityType: "instance_state", entityId: row.id, payload: { projectId, instanceId, orgUnitId, from: existing?.state ?? "Planned", to: input.state } });
    }
  });
  return listProjectInstances(ctx, projectId, kindSet);
}
