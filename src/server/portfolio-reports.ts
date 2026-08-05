// M-P3b (docs/34, docs/19 §6) — the Head of PMs' weekly roll-up: PM check-ins land in
// the Head's queue; the Head builds, annotates and APPROVES; the approved roll-up is
// what the executive reads. Draft is rebuildable from live data; Approved freezes the
// payload — what the Head signed never mutates underneath the exec.
import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { isoWeekId } from "@/lib/iso-week";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { effectiveRag } from "@/server/checkins";
import { projectRag, type Rag } from "@/server/health";
import { emitDomainEvent } from "@/server/events";

export class RollupError extends Error {
  code: string;
  constructor(message: string, code = "ROLLUP_ERROR") {
    super(message);
    this.code = code;
  }
}

function assertHead(ctx: TenantContext): void {
  if (!ctx.roles.some((r) => r === "HeadOfProjects" || r === "PlatformSuperAdmin")) {
    throw new RollupError("The roll-up is the Head of PMs' to build and approve.", "FORBIDDEN");
  }
}

export interface RollupRow {
  projectId: string;
  code: string;
  name: string;
  pmName: string | null;
  rag: Rag;
  checkIn: "Confirmed" | "Draft" | "None";
  submittedToHead: boolean;
  narrative: string | null;
}

export interface RollupView {
  isoWeek: string;
  status: "Draft" | "Approved" | "None";
  narrative: string | null;
  rows: RollupRow[];
  approvedByName: string | null;
  approvedAt: Date | null;
  /** Honesty counters for the header line. */
  confirmed: number;
  submitted: number;
  total: number;
}

/** Assemble this week's rows from live data (active projects × check-ins). */
async function assembleRows(tx: Prisma.TransactionClient, isoWeek: string): Promise<RollupRow[]> {
  const [projects, checkIns] = await Promise.all([
    tx.project.findMany({
      where: { status: { notIn: ["Completed", "Cancelled"] } },
      select: { id: true, code: true, name: true, status: true, lead: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    tx.checkIn.findMany({ where: { isoWeek } }),
  ]);
  const ciByProject = new Map(checkIns.map((c) => [c.projectId, c]));
  const now = new Date();
  return projects.map((p) => {
    const ci = ciByProject.get(p.id);
    return {
      projectId: p.id,
      code: p.code,
      name: p.name,
      pmName: p.lead?.name ?? null,
      // The check-in's effective RAG when one exists (override-aware); the health
      // engine's project RAG otherwise — one vocabulary everywhere.
      rag: ci ? effectiveRag(ci, now) : projectRag(p.status),
      checkIn: ci?.status === "Confirmed" ? "Confirmed" : ci ? "Draft" : "None",
      submittedToHead: Boolean(ci?.submittedToHeadAt),
      narrative: ci?.status === "Confirmed" ? ci.narrative : null,
    };
  });
}

function toView(
  isoWeek: string,
  row: { status: string; narrative: string | null; payload: unknown; approvedAt: Date | null; approvedBy?: { name: string } | null } | null,
  liveRows: RollupRow[] | null,
): RollupView {
  const rows = row?.status === "Approved" ? ((row.payload as RollupRow[]) ?? []) : (liveRows ?? []);
  return {
    isoWeek,
    status: (row?.status as "Draft" | "Approved") ?? "None",
    narrative: row?.narrative ?? null,
    rows,
    approvedByName: row?.approvedBy?.name ?? null,
    approvedAt: row?.approvedAt ?? null,
    confirmed: rows.filter((r) => r.checkIn === "Confirmed").length,
    submitted: rows.filter((r) => r.submittedToHead).length,
    total: rows.length,
  };
}

/** The current week's roll-up: frozen rows when Approved, live rows otherwise. */
export async function getRollup(ctx: TenantContext, now = new Date()): Promise<RollupView> {
  return withTenant(ctx, async (tx) => {
    const isoWeek = isoWeekId(now);
    const row = await tx.portfolioReport.findUnique({
      where: { tenantId_isoWeek: { tenantId: ctx.tenantId, isoWeek } },
      include: { approvedBy: { select: { name: true } } },
    });
    const live = row?.status === "Approved" ? null : await assembleRows(tx, isoWeek);
    return toView(isoWeek, row, live);
  });
}

/** Head-only: (re)build this week's DRAFT from live check-ins. Approved is immutable. */
export async function buildRollup(ctx: TenantContext, now = new Date()): Promise<RollupView> {
  assertHead(ctx);
  return withTenant(ctx, async (tx) => {
    const isoWeek = isoWeekId(now);
    const existing = await tx.portfolioReport.findUnique({
      where: { tenantId_isoWeek: { tenantId: ctx.tenantId, isoWeek } },
      select: { id: true, status: true },
    });
    if (existing?.status === "Approved") {
      throw new RollupError("This week's roll-up is already approved.", "ALREADY_APPROVED");
    }
    const rows = await assembleRows(tx, isoWeek);
    const row = await tx.portfolioReport.upsert({
      where: { tenantId_isoWeek: { tenantId: ctx.tenantId, isoWeek } },
      create: { tenantId: ctx.tenantId, isoWeek, status: "Draft", payload: rows as unknown as Prisma.InputJsonValue },
      update: { payload: rows as unknown as Prisma.InputJsonValue },
      include: { approvedBy: { select: { name: true } } },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "portfolio_report",
      entityId: row.id,
      after: { isoWeek, status: "Draft", projects: rows.length },
    });
    return toView(isoWeek, row, rows);
  });
}

/** Head-only: approve — freeze the rows AS ASSEMBLED NOW, stamp, tell the executives. */
export async function approveRollup(ctx: TenantContext, narrative: string, now = new Date()): Promise<RollupView> {
  assertHead(ctx);
  const text = narrative.trim();
  if (text.length < 5) throw new RollupError("The roll-up needs the Head's narrative line.", "NARRATIVE_REQUIRED");
  return withTenant(ctx, async (tx) => {
    const isoWeek = isoWeekId(now);
    const existing = await tx.portfolioReport.findUnique({
      where: { tenantId_isoWeek: { tenantId: ctx.tenantId, isoWeek } },
      select: { status: true },
    });
    if (existing?.status === "Approved") {
      throw new RollupError("This week's roll-up is already approved.", "ALREADY_APPROVED");
    }
    const rows = await assembleRows(tx, isoWeek);
    const row = await tx.portfolioReport.upsert({
      where: { tenantId_isoWeek: { tenantId: ctx.tenantId, isoWeek } },
      create: {
        tenantId: ctx.tenantId,
        isoWeek,
        status: "Approved",
        narrative: text,
        payload: rows as unknown as Prisma.InputJsonValue,
        approvedById: ctx.userId,
        approvedAt: now,
      },
      update: {
        status: "Approved",
        narrative: text,
        payload: rows as unknown as Prisma.InputJsonValue,
        approvedById: ctx.userId,
        approvedAt: now,
      },
      include: { approvedBy: { select: { name: true } } },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "portfolio_report",
      entityId: row.id,
      after: { isoWeek, status: "Approved", projects: rows.length },
    });
    const execs = await tx.roleAssignment.findMany({
      where: { role: "Executive" },
      select: { userId: true },
    });
    await emitDomainEvent(tx, ctx, {
      type: "rollup.approved",
      entityType: "portfolio_report",
      entityId: row.id,
      payload: { isoWeek },
      notify: [...new Set(execs.map((e) => e.userId))]
        .filter((id) => id !== ctx.userId)
        .map((userId) => ({
          userId,
          kind: "rollup.approved",
          message: `The week ${isoWeek.split("-W")[1]} delivery roll-up is approved: ${text.slice(0, 120)}`,
          link: "/dashboard?persona=executive",
        })),
    });
    return toView(isoWeek, row, null);
  });
}

/** The approved roll-up for the exec hero (null until the Head signs). */
export async function getApprovedRollup(
  ctx: TenantContext,
  now = new Date(),
): Promise<{ isoWeek: string; narrative: string | null; approvedByName: string | null } | null> {
  return withTenant(ctx, async (tx) => {
    const row = await tx.portfolioReport.findUnique({
      where: { tenantId_isoWeek: { tenantId: ctx.tenantId, isoWeek: isoWeekId(now) } },
      include: { approvedBy: { select: { name: true } } },
    });
    if (!row || row.status !== "Approved") return null;
    return { isoWeek: row.isoWeek, narrative: row.narrative, approvedByName: row.approvedBy?.name ?? null };
  });
}
