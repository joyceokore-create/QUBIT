// M-P4a (docs/35 §1, docs/26 §5.4) — the front of the funnel. An idea enters from
// anywhere in the tenant, the Head/PMO triages it on a two-lane board, and an accepted
// idea becomes a project in Exploring with nothing retyped. Three outcomes, all audited:
// accept (→ project, linked inside the wizard's own transaction), park (reason REQUIRED —
// a parked idea is never deleted, the reason it stopped is the record), merge (provenance
// on the receiving project).
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { emitDomainEvent } from "@/server/events";

export const IDEA_STATUSES = ["New", "Reviewing", "Accepted", "Parked", "Merged"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export class IdeaError extends Error {
  code: string;
  constructor(message: string, code = "IDEA_ERROR") {
    super(message);
    this.code = code;
  }
}

function canTriage(ctx: TenantContext): boolean {
  return ctx.roles.some((r) => r === "HeadOfProjects" || r === "PlatformSuperAdmin");
}

function assertTriage(ctx: TenantContext): void {
  if (!canTriage(ctx)) {
    throw new IdeaError("Triage is the Head of PMs' to run.", "FORBIDDEN");
  }
}

export const SubmitIdeaInput = z.object({
  title: z.string().trim().min(4, "Give the idea a title.").max(140),
  sponsor: z.string().trim().min(2, "Name the sponsor — an idea needs someone behind it.").max(120),
  problem: z.string().trim().min(10, "Describe the problem it solves.").max(2000),
  expectedValue: z.string().trim().max(500).nullable().optional(),
  suggestedPortfolioId: z.string().uuid().nullable().optional(),
});
export type SubmitIdeaInputT = z.infer<typeof SubmitIdeaInput>;

export interface IdeaView {
  id: string;
  title: string;
  sponsor: string;
  problem: string;
  expectedValue: string | null;
  status: IdeaStatus;
  parkReason: string | null;
  /** Q may fill this later; null means NOT summarised — never a fabricated line (docs/35 §3). */
  summary: string | null;
  suggestedPortfolio: { id: string; name: string } | null;
  submittedByName: string | null;
  submittedAt: Date;
  triagedByName: string | null;
  triagedAt: Date | null;
  outcomeProject: { id: string; code: string; name: string } | null;
  /** True when the viewer submitted it — the board shows "yours" without leaking names. */
  mine: boolean;
}

const INCLUDE = {
  submittedBy: { select: { name: true } },
  triagedBy: { select: { name: true } },
  suggestedPortfolio: { select: { id: true, name: true } },
  acceptedProject: { select: { id: true, code: true, name: true } },
  mergedIntoProject: { select: { id: true, code: true, name: true } },
} satisfies Prisma.IdeaInclude;

type IdeaRow = Prisma.IdeaGetPayload<{ include: typeof INCLUDE }>;

function toView(row: IdeaRow, viewerId: string): IdeaView {
  return {
    id: row.id,
    title: row.title,
    sponsor: row.sponsor,
    problem: row.problem,
    expectedValue: row.expectedValue,
    status: row.status as IdeaStatus,
    parkReason: row.parkReason,
    summary: row.summary,
    suggestedPortfolio: row.suggestedPortfolio ? { id: row.suggestedPortfolio.id, name: row.suggestedPortfolio.name } : null,
    submittedByName: row.submittedBy?.name ?? null,
    submittedAt: row.createdAt,
    triagedByName: row.triagedBy?.name ?? null,
    triagedAt: row.triagedAt,
    outcomeProject: row.acceptedProject ?? row.mergedIntoProject ?? null,
    mine: row.submittedById === viewerId,
  };
}

/** Anyone in the tenant may submit (docs/35 §1) — the Heads are notified, never bypassed. */
export async function submitIdea(ctx: TenantContext, input: SubmitIdeaInputT): Promise<IdeaView> {
  return withTenant(ctx, async (tx) => {
    if (input.suggestedPortfolioId) {
      await tx.portfolio.findUniqueOrThrow({ where: { id: input.suggestedPortfolioId } }).catch(() => {
        throw new IdeaError("Portfolio not found.", "PORTFOLIO_NOT_FOUND");
      });
    }
    const row = await tx.idea.create({
      data: {
        tenantId: ctx.tenantId,
        title: input.title,
        sponsor: input.sponsor,
        problem: input.problem,
        expectedValue: input.expectedValue ?? null,
        suggestedPortfolioId: input.suggestedPortfolioId ?? null,
        submittedById: ctx.userId,
        status: "New",
      },
      include: INCLUDE,
    });
    await audit(tx, ctx, {
      action: "create",
      entityType: "idea",
      entityId: row.id,
      after: { title: row.title, sponsor: row.sponsor, status: row.status },
    });
    const heads = await tx.roleAssignment.findMany({ where: { role: "HeadOfProjects" }, select: { userId: true } });
    await emitDomainEvent(tx, ctx, {
      type: "idea.submitted",
      entityType: "idea",
      entityId: row.id,
      payload: { title: row.title },
      notify: [...new Set(heads.map((h) => h.userId))]
        .filter((id) => id !== ctx.userId)
        .map((userId) => ({
          userId,
          kind: "idea.submitted",
          message: `New idea for triage: ${row.title}`,
          link: "/ideas",
        })),
    });
    return toView(row, ctx.userId);
  });
}

export interface IdeaBoard {
  /** True when the viewer may accept/park/merge — the board renders read-only otherwise. */
  canTriage: boolean;
  /** The two triage lanes as drawn in the wireframe. */
  lanes: { key: "New" | "Reviewing"; ideas: IdeaView[] }[];
  /** Everything already decided, newest first — accepted, parked and merged. */
  decided: IdeaView[];
}

/**
 * The triage board. A triager sees every idea in the tenant; everyone else sees only
 * their OWN submissions (userId scoping on top of RLS — intake is open, the queue is not).
 */
export async function getIdeaBoard(ctx: TenantContext): Promise<IdeaBoard> {
  const triager = canTriage(ctx);
  return withTenant(ctx, async (tx) => {
    const rows = await tx.idea.findMany({
      where: triager ? {} : { submittedById: ctx.userId },
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const views = rows.map((r) => toView(r, ctx.userId));
    return {
      canTriage: triager,
      lanes: [
        { key: "New" as const, ideas: views.filter((v) => v.status === "New") },
        { key: "Reviewing" as const, ideas: views.filter((v) => v.status === "Reviewing") },
      ],
      decided: views.filter((v) => v.status === "Accepted" || v.status === "Parked" || v.status === "Merged"),
    };
  });
}

/** Head-only: move an idea between the two open lanes (New ⇄ Reviewing). */
export async function setIdeaReviewing(ctx: TenantContext, ideaId: string, reviewing: boolean): Promise<IdeaView> {
  assertTriage(ctx);
  return withTenant(ctx, async (tx) => {
    const before = await tx.idea.findUnique({ where: { id: ideaId }, select: { status: true } });
    if (!before) throw new IdeaError("Idea not found.", "NOT_FOUND");
    if (before.status !== "New" && before.status !== "Reviewing") {
      throw new IdeaError("This idea has already been decided.", "ALREADY_DECIDED");
    }
    const row = await tx.idea.update({
      where: { id: ideaId },
      data: { status: reviewing ? "Reviewing" : "New" },
      include: INCLUDE,
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "idea",
      entityId: ideaId,
      before: { status: before.status },
      after: { status: row.status },
    });
    return toView(row, ctx.userId);
  });
}

export const ParkIdeaInput = z.object({
  reason: z.string().trim().min(5, "Say why it is being parked — the reason is the record.").max(1000),
});

/** Head-only: park with a REQUIRED reason. Never deletes; the submitter is told why. */
export async function parkIdea(ctx: TenantContext, ideaId: string, reason: string, now = new Date()): Promise<IdeaView> {
  assertTriage(ctx);
  const text = reason.trim();
  if (text.length < 5) throw new IdeaError("Say why it is being parked — the reason is the record.", "REASON_REQUIRED");
  return withTenant(ctx, async (tx) => {
    const before = await tx.idea.findUnique({ where: { id: ideaId }, select: { status: true, submittedById: true, title: true } });
    if (!before) throw new IdeaError("Idea not found.", "NOT_FOUND");
    if (before.status !== "New" && before.status !== "Reviewing") {
      throw new IdeaError("This idea has already been decided.", "ALREADY_DECIDED");
    }
    const row = await tx.idea.update({
      where: { id: ideaId },
      data: { status: "Parked", parkReason: text, triagedById: ctx.userId, triagedAt: now },
      include: INCLUDE,
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "idea",
      entityId: ideaId,
      before: { status: before.status },
      after: { status: "Parked", parkReason: text },
    });
    await emitDomainEvent(tx, ctx, {
      type: "idea.parked",
      entityType: "idea",
      entityId: ideaId,
      payload: { reason: text },
      notify:
        before.submittedById === ctx.userId
          ? []
          : [
              {
                userId: before.submittedById,
                kind: "idea.parked",
                message: `Your idea "${before.title}" was parked: ${text.slice(0, 120)}`,
                link: "/ideas",
              },
            ],
    });
    return toView(row, ctx.userId);
  });
}

/** Head-only: fold the idea into an existing project — provenance, not deletion. */
export async function mergeIdea(ctx: TenantContext, ideaId: string, projectId: string, now = new Date()): Promise<IdeaView> {
  assertTriage(ctx);
  return withTenant(ctx, async (tx) => {
    const before = await tx.idea.findUnique({ where: { id: ideaId }, select: { status: true, submittedById: true, title: true } });
    if (!before) throw new IdeaError("Idea not found.", "NOT_FOUND");
    if (before.status !== "New" && before.status !== "Reviewing") {
      throw new IdeaError("This idea has already been decided.", "ALREADY_DECIDED");
    }
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true } });
    if (!project) throw new IdeaError("Project not found.", "PROJECT_NOT_FOUND");
    const row = await tx.idea.update({
      where: { id: ideaId },
      data: { status: "Merged", mergedIntoProjectId: projectId, triagedById: ctx.userId, triagedAt: now },
      include: INCLUDE,
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "idea",
      entityId: ideaId,
      before: { status: before.status },
      after: { status: "Merged", mergedIntoProjectId: projectId },
    });
    await emitDomainEvent(tx, ctx, {
      type: "idea.merged",
      entityType: "idea",
      entityId: ideaId,
      payload: { projectId },
      notify:
        before.submittedById === ctx.userId
          ? []
          : [
              {
                userId: before.submittedById,
                kind: "idea.merged",
                message: `Your idea "${before.title}" was folded into ${project.name} (${project.code}).`,
                link: `/projects/${project.id}`,
              },
            ],
    });
    return toView(row, ctx.userId);
  });
}

/**
 * Called INSIDE the project wizard's transaction (docs/35 §1): the idea is stamped
 * Accepted and linked to the new project, so a failed create leaves no half-accepted
 * idea behind. Triage rights are asserted here too — the wizard's project:create is not
 * a licence to decide intake.
 */
export async function acceptIdeaInTx(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  ideaId: string,
  projectId: string,
  now = new Date(),
): Promise<void> {
  assertTriage(ctx);
  const before = await tx.idea.findUnique({ where: { id: ideaId }, select: { status: true, submittedById: true, title: true } });
  if (!before) throw new IdeaError("Idea not found.", "NOT_FOUND");
  if (before.status !== "New" && before.status !== "Reviewing") {
    throw new IdeaError("This idea has already been decided.", "ALREADY_DECIDED");
  }
  await tx.idea.update({
    where: { id: ideaId },
    data: { status: "Accepted", acceptedProjectId: projectId, triagedById: ctx.userId, triagedAt: now },
  });
  await audit(tx, ctx, {
    action: "update",
    entityType: "idea",
    entityId: ideaId,
    before: { status: before.status },
    after: { status: "Accepted", acceptedProjectId: projectId },
  });
  await emitDomainEvent(tx, ctx, {
    type: "idea.accepted",
    entityType: "idea",
    entityId: ideaId,
    payload: { projectId },
    notify:
      before.submittedById === ctx.userId
        ? []
        : [
            {
              userId: before.submittedById,
              kind: "idea.accepted",
              message: `Your idea "${before.title}" is now a project.`,
              link: `/projects/${projectId}`,
            },
          ],
  });
}

/** The wizard's prefill source: an open idea the viewer may accept. Null otherwise —
 * the wizard then behaves exactly as it always has. */
export async function getIdeaForPrefill(
  ctx: TenantContext,
  ideaId: string,
): Promise<{
  id: string;
  title: string;
  sponsor: string;
  problem: string;
  expectedValue: string | null;
  suggestedPortfolioId: string | null;
} | null> {
  if (!canTriage(ctx)) return null;
  return withTenant(ctx, async (tx) => {
    const row = await tx.idea.findUnique({
      where: { id: ideaId },
      // DM1.73 — expectedValue included so the idea → project handoff keeps it.
      select: { id: true, title: true, sponsor: true, problem: true, expectedValue: true, suggestedPortfolioId: true, status: true },
    });
    if (!row || (row.status !== "New" && row.status !== "Reviewing")) return null;
    const { status: _status, ...rest } = row;
    return rest;
  });
}

/** Provenance for a project's Overview: the ideas that became or folded into it. */
export async function listProjectIdeaProvenance(
  ctx: TenantContext,
  projectId: string,
): Promise<{ id: string; title: string; kind: "accepted" | "merged"; submittedByName: string | null }[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.idea.findMany({
      where: { OR: [{ acceptedProjectId: projectId }, { mergedIntoProjectId: projectId }] },
      select: { id: true, title: true, acceptedProjectId: true, submittedBy: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.acceptedProjectId === projectId ? ("accepted" as const) : ("merged" as const),
      submittedByName: r.submittedBy?.name ?? null,
    }));
  });
}
