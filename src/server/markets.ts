import "server-only";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { emitDomainEvent } from "@/server/events";
import { flagEnabled } from "@/lib/flags";
import { isoWeekId } from "@/lib/iso-week";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { derivedProgress, type CheckpointState } from "@/server/checkpoints";

/**
 * docs/38 (DM1.77, Joyce 2026-10-07: "markets are the same as subsidiaries") — a project's
 * MARKETS: where the product ships (Kenya, Uganda …), one `ProjectOrgStatus` row each. The
 * row is the track: gate states per market (`CheckpointStatus.orgUnitId`), the weekly
 * market check-in (`MarketCheckIn`), the states of the product's named instances in that
 * market (project-instances.ts), an optional market lead (counts as a PM of the product
 * when the project's `pmScope` is "instance") and a note. Markets are never deleted once
 * they carry work — they are retired (`retiredAt`), which hides them everywhere and keeps
 * the audit trail. Everything here runs under RLS and is audited.
 */

export const MARKET_LABELS = ["Market", "Subsidiary", "Instance"] as const;
export type MarketLabel = (typeof MARKET_LABELS)[number];

/** Which org-unit kinds a project may use as markets. Markets and subsidiaries are the
 * same thing to Riverbank, so every kind qualifies; `instanceLabel` only narrows it when
 * a tenant ever wants to. */
export function marketKinds(label: string): string[] {
  return label === "Subsidiary" ? ["Internal"] : label === "Market" ? ["Market", "Internal"] : ["Market", "Internal"];
}

export class MarketError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "BAD_UNIT" | "ALREADY_ON" | "HAS_WORK" | "LEAD_NOT_FOUND",
  ) {
    super(message);
    this.name = "MarketError";
  }
}

export interface MarketRow {
  orgUnitId: string;
  code: string;
  name: string;
  flag: string | null;
  kind: string;
  status: string;
  progress: number;
  leadUserId: string | null;
  leadName: string | null;
  note: string | null;
  retiredAt: Date | null;
  createdAt: Date;
}

export async function listProjectMarkets(ctx: TenantContext, projectId: string, { includeRetired = false } = {}): Promise<MarketRow[]> {
  return withTenant(ctx, async (tx) => {
    const [rows, gates, template] = await Promise.all([
      tx.projectOrgStatus.findMany({
        where: { projectId, ...(includeRetired ? {} : { retiredAt: null }) },
        select: {
          orgUnitId: true, status: true, progress: true, leadUserId: true, note: true, retiredAt: true, createdAt: true,
          lead: { select: { name: true } },
          orgUnit: { select: { code: true, name: true, flag: true, kind: true } },
        },
        orderBy: { orgUnit: { code: "asc" } },
      }),
      tx.checkpointStatus.findMany({ where: { projectId, orgUnitId: { not: null }, moduleId: null }, select: { orgUnitId: true, state: true } }),
      tx.project.findUnique({ where: { id: projectId }, select: { checkpointTemplate: { select: { _count: { select: { checkpoints: true } } } } } }),
    ]);
    // Same rule as the workspace header (rollout.ts): with a template the % is gate-derived.
    const total = template?.checkpointTemplate?._count.checkpoints ?? 0;
    const statesByUnit = new Map<string, CheckpointState[]>();
    for (const g of gates) statesByUnit.set(g.orgUnitId!, [...(statesByUnit.get(g.orgUnitId!) ?? []), g.state as CheckpointState]);
    const progressOf = (r: { orgUnitId: string; progress: number }) => {
      const states = statesByUnit.get(r.orgUnitId) ?? [];
      return total > 0 ? derivedProgress([...states, ...Array<CheckpointState>(Math.max(0, total - states.length)).fill("NotStarted")]) : r.progress;
    };
    return rows.map((r) => ({
      orgUnitId: r.orgUnitId,
      code: r.orgUnit.code,
      name: r.orgUnit.name,
      flag: r.orgUnit.flag,
      kind: r.orgUnit.kind,
      status: r.status,
      progress: progressOf(r),
      leadUserId: r.leadUserId,
      leadName: r.lead?.name ?? null,
      note: r.note,
      retiredAt: r.retiredAt,
      createdAt: r.createdAt,
    }));
  });
}

/** Org units the project could still add as markets (minus the ones already on it). */
export async function listAddableMarkets(ctx: TenantContext, projectId: string): Promise<{ id: string; code: string; name: string; flag: string | null; kind: string }[]> {
  return withTenant(ctx, async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { instanceLabel: true } });
    if (!project) throw new MarketError("Project not found.", "NOT_FOUND");
    return tx.orgUnit.findMany({
      where: { kind: { in: marketKinds(project.instanceLabel) }, projectOrgStatuses: { none: { projectId, retiredAt: null } } },
      select: { id: true, code: true, name: true, flag: true, kind: true },
      orderBy: { code: "asc" },
    });
  });
}

export const AddMarketsInput = z.object({
  orgUnitIds: z.array(z.string().uuid()).min(1).max(30),
});

/** Add markets (or revive retired ones). Audited per market; event `market.added`. */
export async function addMarkets(ctx: TenantContext, projectId: string, input: z.infer<typeof AddMarketsInput>): Promise<MarketRow[]> {
  await withTenant(ctx, async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, instanceLabel: true } });
    if (!project) throw new MarketError("Project not found.", "NOT_FOUND");
    const kinds = marketKinds(project.instanceLabel);
    const units = await tx.orgUnit.findMany({ where: { id: { in: input.orgUnitIds } }, select: { id: true, code: true, kind: true } });
    if (units.length !== new Set(input.orgUnitIds).size) throw new MarketError("One or more org units were not found.", "NOT_FOUND");
    const wrong = units.find((u) => !kinds.includes(u.kind));
    if (wrong) throw new MarketError(`${wrong.code} cannot be a market of this project.`, "BAD_UNIT");
    for (const u of units) {
      const existing = await tx.projectOrgStatus.findUnique({ where: { projectId_orgUnitId: { projectId, orgUnitId: u.id } }, select: { id: true, retiredAt: true } });
      if (existing && !existing.retiredAt) continue; // already on — idempotent
      const row = existing
        ? await tx.projectOrgStatus.update({ where: { id: existing.id }, data: { retiredAt: null } })
        : await tx.projectOrgStatus.create({ data: { tenantId: ctx.tenantId, projectId, orgUnitId: u.id, progress: 0, status: "Planning" } });
      await audit(tx, ctx, { action: existing ? "update" : "create", entityType: "project_market", entityId: row.id, after: { projectId, orgUnitId: u.id, code: u.code, revived: Boolean(existing) } });
      await emitDomainEvent(tx, ctx, { type: "market.added", entityType: "project_market", entityId: row.id, payload: { projectId, orgUnitId: u.id, code: u.code } });
    }
  });
  return listProjectMarkets(ctx, projectId);
}

/** Retire a market: hidden everywhere, history kept. Refused while it still carries open work. */
export async function retireMarket(ctx: TenantContext, projectId: string, orgUnitId: string): Promise<MarketRow[]> {
  await withTenant(ctx, async (tx) => {
    const row = await tx.projectOrgStatus.findUnique({ where: { projectId_orgUnitId: { projectId, orgUnitId } }, select: { id: true, retiredAt: true, orgUnit: { select: { code: true } } } });
    if (!row || row.retiredAt) throw new MarketError("That market is not on this project.", "NOT_FOUND");
    const [tasks, blockers] = await Promise.all([
      tx.projectTask.count({ where: { projectId, orgUnitId, status: { notIn: ["Done", "Completed", "Cancelled"] } } }),
      tx.blocker.count({ where: { projectId, orgUnitId, status: "Open" } }),
    ]);
    if (tasks + blockers > 0) throw new MarketError(`${row.orgUnit.code} still has ${tasks} open ${tasks === 1 ? "task" : "tasks"} and ${blockers} open ${blockers === 1 ? "blocker" : "blockers"} tagged to it — close or re-tag them first.`, "HAS_WORK");
    await tx.projectOrgStatus.update({ where: { id: row.id }, data: { retiredAt: new Date() } });
    await audit(tx, ctx, { action: "update", entityType: "project_market", entityId: row.id, before: { retired: false }, after: { retired: true, code: row.orgUnit.code } });
    await emitDomainEvent(tx, ctx, { type: "market.retired", entityType: "project_market", entityId: row.id, payload: { projectId, orgUnitId, code: row.orgUnit.code } });
  });
  return listProjectMarkets(ctx, projectId);
}

export const UpdateMarketInput = z.object({
  leadUserId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  status: z.enum(["Planning", "InProgress", "UAT", "Live", "OnHold", "Retired"]).optional(),
});

/** Lead, note or status of one market. The lead counts as a PM of the product when the
 * project's pmScope is "instance" (docs/38 §2 — the value name is kept; it reads "a lead
 * per market" in the UI). */
export async function updateMarket(ctx: TenantContext, projectId: string, orgUnitId: string, input: z.infer<typeof UpdateMarketInput>): Promise<MarketRow[]> {
  await withTenant(ctx, async (tx) => {
    const row = await tx.projectOrgStatus.findUnique({ where: { projectId_orgUnitId: { projectId, orgUnitId } }, select: { id: true, leadUserId: true, note: true, status: true, retiredAt: true, orgUnit: { select: { code: true } } } });
    if (!row || row.retiredAt) throw new MarketError("That market is not on this project.", "NOT_FOUND");
    if (input.leadUserId) {
      const user = await tx.user.findFirst({ where: { id: input.leadUserId, status: "ACTIVE" }, select: { id: true } });
      if (!user) throw new MarketError("That person is not an active user.", "LEAD_NOT_FOUND");
    }
    const data = {
      ...(input.leadUserId !== undefined ? { leadUserId: input.leadUserId } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };
    if (Object.keys(data).length === 0) return;
    await tx.projectOrgStatus.update({ where: { id: row.id }, data });
    await audit(tx, ctx, {
      action: "update",
      entityType: "project_market",
      entityId: row.id,
      before: { leadUserId: row.leadUserId, note: row.note, status: row.status },
      after: { code: row.orgUnit.code, ...data },
    });
    if (input.leadUserId !== undefined && input.leadUserId !== row.leadUserId) {
      await emitDomainEvent(tx, ctx, {
        type: "market.lead_changed",
        entityType: "project_market",
        entityId: row.id,
        payload: { projectId, orgUnitId, code: row.orgUnit.code, from: row.leadUserId, to: input.leadUserId },
        ...(input.leadUserId ? { notify: [{ userId: input.leadUserId, kind: "project.assigned", message: `You now lead this project in ${row.orgUnit.code}.`, link: `/projects/${projectId}?market=${orgUnitId}` }] } : {}),
      });
    }
  });
  return listProjectMarkets(ctx, projectId);
}

export interface MarketSetup {
  gates: boolean;
  documents: boolean;
  lead: boolean;
  youtrack: boolean | null;
  thisWeek: boolean;
  done: number;
  total: number;
}

/** The per-market set-up signals (the checklist when a market is selected): a gate state
 * recorded for it, a document tagged to it, a lead, YouTrack (inherited from the project),
 * and this week's market check-in. */
export async function getMarketSetup(ctx: TenantContext, projectId: string, orgUnitId: string, now = new Date()): Promise<MarketSetup> {
  const isoWeek = isoWeekId(now);
  const ytOn = flagEnabled("youtrack");
  const [row, gates, documents, youtrack, checkIn] = await withTenant(ctx, (tx) =>
    Promise.all([
      tx.projectOrgStatus.findUnique({ where: { projectId_orgUnitId: { projectId, orgUnitId } }, select: { leadUserId: true } }),
      tx.checkpointStatus.count({ where: { projectId, orgUnitId, moduleId: null } }),
      tx.projectDocument.count({ where: { projectId, orgUnitId } }),
      ytOn ? tx.projectIntegration.findFirst({ where: { projectId, provider: "youtrack", connected: true }, select: { id: true } }) : Promise.resolve(null),
      tx.marketCheckIn.findUnique({ where: { projectId_orgUnitId_isoWeek: { projectId, orgUnitId, isoWeek } }, select: { id: true } }),
    ]),
  );
  const items = { gates: gates > 0, documents: documents > 0, lead: Boolean(row?.leadUserId), youtrack: ytOn ? Boolean(youtrack) : null, thisWeek: Boolean(checkIn) };
  const counted = [items.gates, items.documents, items.lead, ...(ytOn ? [items.youtrack as boolean] : []), items.thisWeek];
  return { ...items, done: counted.filter(Boolean).length, total: counted.length };
}
