import "server-only";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { canWriteProject } from "@/lib/access";
import { dayKey } from "@/lib/dates";
import { containsText, startOfDayInZone } from "@/lib/list-query";
import { pageInfo, type PageInfo } from "@/lib/list-state";
import { emitDomainEvent, type NotifyEntry } from "@/server/events";
import { getTenantTimeZone } from "@/server/preferences";
import {
  addDays,
  buildOptions,
  canCompleteGlcAction,
  canCreateGlcAction,
  canDecide,
  dueFilterDays,
  isHead,
  raisedByLine,
  readOptions,
  registerTitle,
  WAITING_STATUSES,
  type DecideInputT,
  type DecisionRow,
  type DecisionTab,
  type DueFilter,
  type GlcCreateInputT,
  type GlcRow,
  type GlcStatus,
  type Outcome,
  type RaiseInputT,
  type RequestStatus,
} from "@/lib/decisions";

/**
 * WS2 (UX fidelity Tier 4) — the Decisions engine: decision requests waiting on the Group and
 * the Group-level committee's (GLC) action items. Every read and write runs under the caller's
 * tenant RLS context (withTenant); every mutation writes a dedicated audit row in the SAME
 * transaction and emits one domain event (which carries the in-app notifications):
 *   decision_raise   → Executives are notified;
 *   decision_decide  → the raiser and the project's PM; a project's request also writes the
 *                      Register `Decision` row, linked by decision_request.decision_id;
 *   decision_defer   → the raiser and the project's PM;
 *   glc_action_create → the owner; glc_action_complete.
 * Who may do what lives in src/lib/decisions.ts (pure, unit-tested); the PM's "own project"
 * check is canWriteProject (lead, PM-role member or instance lead — never a client claim).
 */

export class DecisionError extends Error {
  constructor(
    message: string,
    public code: "FORBIDDEN" | "NOT_FOUND" | "BAD_INPUT" | "CONFLICT",
  ) {
    super(message);
    this.name = "DecisionError";
  }
}

type Tx = Prisma.TransactionClient;

/** May the viewer raise a decision for this project (or for none)? Heads: any project, or
 * none. Anyone else: only a project they may write (the PM's own; Super Admin via
 * project:write). A project-less request is a Head's. */
export async function mayRaise(ctx: TenantContext, projectId: string | null | undefined): Promise<boolean> {
  if (isHead(ctx.roles)) return true;
  if (!projectId) return false;
  return canWriteProject(ctx, projectId);
}

/** The projects the viewer may raise a decision for (the raise form's list). Active only. */
export async function raiseableProjects(ctx: TenantContext): Promise<{ id: string; name: string }[]> {
  const active: Prisma.ProjectWhereInput = { status: { notIn: ["Completed", "Cancelled"] } };
  return withTenant(ctx, async (tx) => {
    if (isHead(ctx.roles) || ctx.roles.includes("PlatformSuperAdmin")) {
      return tx.project.findMany({ where: active, select: { id: true, name: true }, orderBy: { name: "asc" } });
    }
    // The PM's own: lead, PM-role member, or instance lead (the canWriteProject rule).
    return tx.project.findMany({
      where: {
        ...active,
        OR: [
          { leadUserId: ctx.userId },
          { members: { some: { userId: ctx.userId, role: "Project Manager" } } },
          { pmScope: "instance", orgStatuses: { some: { leadUserId: ctx.userId, retiredAt: null } } },
        ],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });
}

/** Today's tenant-local day; a due day must be today or later (a deferral: after today). */
async function dueInstant(ctx: TenantContext, day: string, opts: { afterToday: boolean }): Promise<Date> {
  const tz = await getTenantTimeZone(ctx);
  const today = dayKey(new Date(), tz);
  if (opts.afterToday ? day <= today : day < today) {
    throw new DecisionError(opts.afterToday ? "Defer to a day after today." : "The due date can't be in the past.", "BAD_INPUT");
  }
  return startOfDayInZone(day, tz);
}

async function executives(tx: Tx): Promise<string[]> {
  const rows = await tx.roleAssignment.findMany({ where: { role: "Executive", user: { status: "ACTIVE" } }, select: { userId: true } });
  return [...new Set(rows.map((r) => r.userId))];
}

/** The project's PM: its lead plus any "Project Manager" member. */
async function projectPms(tx: Tx, projectId: string | null): Promise<string[]> {
  if (!projectId) return [];
  const [p, members] = await Promise.all([
    tx.project.findUnique({ where: { id: projectId }, select: { leadUserId: true } }),
    tx.projectMember.findMany({ where: { projectId, role: "Project Manager" }, select: { userId: true } }),
  ]);
  return [...new Set([p?.leadUserId, ...members.map((m) => m.userId)].filter((x): x is string => !!x))];
}

const notifyAll = (ids: string[], actorId: string, entry: Omit<NotifyEntry, "userId">): NotifyEntry[] =>
  [...new Set(ids)].filter((id) => id !== actorId).map((userId) => ({ userId, ...entry }));

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function raiseDecision(ctx: TenantContext, input: RaiseInputT): Promise<{ id: string }> {
  const projectId = input.projectId ?? null;
  if (projectId) {
    const exists = await withTenant(ctx, (tx) => tx.project.findUnique({ where: { id: projectId }, select: { id: true } }));
    if (!exists) throw new DecisionError("Project not found.", "NOT_FOUND");
  }
  if (!(await mayRaise(ctx, projectId))) {
    throw new DecisionError(projectId ? "Only a Head or this project's PM can raise a decision for it." : "Only a Head can raise a decision without a project.", "FORBIDDEN");
  }
  const due = input.dueDate ? await dueInstant(ctx, input.dueDate, { afterToday: false }) : null;
  const options = buildOptions(input);

  return withTenant(ctx, async (tx) => {
    const row = await tx.decisionRequest.create({
      data: {
        tenantId: ctx.tenantId,
        projectId,
        title: input.title,
        context: input.context || null,
        options: options as Prisma.InputJsonValue,
        raisedById: ctx.userId,
        dueDate: due,
      },
      select: { id: true, title: true, project: { select: { name: true } } },
    });
    await audit(tx, ctx, {
      action: "decision.raise",
      entityType: "decision_request",
      entityId: row.id,
      after: { title: row.title, projectId, dueDate: due?.toISOString() ?? null, status: "waiting" },
    });
    await emitDomainEvent(tx, ctx, {
      type: "decision_request.raised",
      entityType: "decision_request",
      entityId: row.id,
      payload: { projectId, title: row.title },
      notify: notifyAll(await executives(tx), ctx.userId, {
        kind: "decision.raised",
        message: `Decision waiting on the Group: ${row.title}${row.project ? ` (${row.project.name})` : ""}`,
        link: `/decisions?open=${row.id}`,
      }),
    });
    return { id: row.id };
  });
}

/** Approve, decline or defer — Executives only. A request with a project gets its Register
 * `Decision` row on approve/decline, in the same transaction. */
export async function decideRequest(ctx: TenantContext, id: string, input: DecideInputT): Promise<{ id: string; status: RequestStatus; decisionId: string | null }> {
  if (!canDecide(ctx.roles)) throw new DecisionError("Only an Executive can record the Group's decision.", "FORBIDDEN");
  const due = input.action === "defer" ? await dueInstant(ctx, input.dueDate, { afterToday: true }) : null;

  return withTenant(ctx, async (tx) => {
    const before = await tx.decisionRequest.findUnique({
      where: { id },
      select: { id: true, title: true, status: true, projectId: true, raisedById: true, dueDate: true, project: { select: { name: true } } },
    });
    if (!before) throw new DecisionError("Decision not found.", "NOT_FOUND");
    if (!(WAITING_STATUSES as string[]).includes(before.status)) throw new DecisionError("This decision has already been recorded.", "CONFLICT");

    const note = input.note?.trim() || null;
    const recipients = [before.raisedById, ...(await projectPms(tx, before.projectId))];
    const where = before.project ? ` (${before.project.name})` : "";

    if (input.action === "defer") {
      // Conditional update: a concurrent decision can't be overwritten.
      const n = await tx.decisionRequest.updateMany({
        where: { id, status: { in: WAITING_STATUSES } },
        data: { status: "deferred", dueDate: due, outcomeNote: note },
      });
      if (n.count === 0) throw new DecisionError("This decision has already been recorded.", "CONFLICT");
      await audit(tx, ctx, {
        action: "decision.defer",
        entityType: "decision_request",
        entityId: id,
        before: { status: before.status, dueDate: before.dueDate?.toISOString() ?? null },
        after: { status: "deferred", dueDate: due?.toISOString() ?? null, note },
      });
      await emitDomainEvent(tx, ctx, {
        type: "decision_request.deferred",
        entityType: "decision_request",
        entityId: id,
        payload: { projectId: before.projectId, dueDate: due?.toISOString() ?? null },
        notify: notifyAll(recipients, ctx.userId, { kind: "decision.deferred", message: `Decision deferred: ${before.title}${where}`, link: `/decisions?open=${id}` }),
      });
      return { id, status: "deferred" as const, decisionId: null };
    }

    const outcome: Outcome = input.action === "approve" ? "approved" : "declined";
    const decidedAt = new Date();
    const n = await tx.decisionRequest.updateMany({
      where: { id, status: { in: WAITING_STATUSES } },
      data: { status: "decided", outcome, outcomeNote: note, decidedById: ctx.userId, decidedAt },
    });
    if (n.count === 0) throw new DecisionError("This decision has already been recorded.", "CONFLICT");

    let decisionId: string | null = null;
    if (before.projectId) {
      const d = await tx.decision.create({
        data: { tenantId: ctx.tenantId, projectId: before.projectId, title: registerTitle(outcome, before.title), rationale: note, decidedById: ctx.userId, decidedAt },
        select: { id: true },
      });
      decisionId = d.id;
      await tx.decisionRequest.update({ where: { id }, data: { decisionId } });
      await audit(tx, ctx, { action: "create", entityType: "decision", entityId: d.id, after: { title: registerTitle(outcome, before.title), decisionRequestId: id } });
    }
    await audit(tx, ctx, {
      action: "decision.decide",
      entityType: "decision_request",
      entityId: id,
      before: { status: before.status },
      after: { status: "decided", outcome, note, decisionId },
    });
    await emitDomainEvent(tx, ctx, {
      type: "decision_request.decided",
      entityType: "decision_request",
      entityId: id,
      payload: { projectId: before.projectId, outcome, decisionId },
      notify: notifyAll(recipients, ctx.userId, {
        kind: "decision.decided",
        message: `Decision ${outcome}: ${before.title}${where}`,
        link: `/decisions?tab=decided&open=${id}`,
      }),
    });
    return { id, status: "decided" as const, decisionId };
  });
}

export async function createGlcAction(ctx: TenantContext, input: GlcCreateInputT): Promise<{ id: string }> {
  if (!canCreateGlcAction(ctx.roles)) throw new DecisionError("Only an Executive or a Head can add a GLC action.", "FORBIDDEN");
  const due = input.dueDate ? await dueInstant(ctx, input.dueDate, { afterToday: false }) : null;
  return withTenant(ctx, async (tx) => {
    // Every referenced row must exist IN THIS TENANT (RLS hides another tenant's).
    const [project, owner, request] = await Promise.all([
      input.projectId ? tx.project.findUnique({ where: { id: input.projectId }, select: { id: true } }) : null,
      input.ownerId ? tx.user.findFirst({ where: { id: input.ownerId, status: { not: "DELETED" } }, select: { id: true } }) : null,
      input.decisionRequestId ? tx.decisionRequest.findUnique({ where: { id: input.decisionRequestId }, select: { id: true, projectId: true } }) : null,
    ]);
    if (input.projectId && !project) throw new DecisionError("Project not found.", "NOT_FOUND");
    if (input.ownerId && !owner) throw new DecisionError("Owner not found.", "NOT_FOUND");
    if (input.decisionRequestId && !request) throw new DecisionError("Decision not found.", "NOT_FOUND");
    const projectId = input.projectId ?? request?.projectId ?? null;

    const row = await tx.glcAction.create({
      data: { tenantId: ctx.tenantId, title: input.title, projectId, decisionRequestId: request?.id ?? null, ownerId: owner?.id ?? null, dueDate: due },
      select: { id: true, title: true },
    });
    await audit(tx, ctx, {
      action: "glc_action.create",
      entityType: "glc_action",
      entityId: row.id,
      after: { title: row.title, projectId, ownerId: owner?.id ?? null, dueDate: due?.toISOString() ?? null, status: "open" },
    });
    await emitDomainEvent(tx, ctx, {
      type: "glc_action.created",
      entityType: "glc_action",
      entityId: row.id,
      payload: { projectId, decisionRequestId: request?.id ?? null },
      notify: owner ? notifyAll([owner.id], ctx.userId, { kind: "glc_action.assigned", message: `GLC action for you: ${row.title}`, link: "/decisions?tab=actions" }) : [],
    });
    return { id: row.id };
  });
}

export async function completeGlcAction(ctx: TenantContext, id: string): Promise<{ id: string; status: GlcStatus }> {
  return withTenant(ctx, async (tx) => {
    const before = await tx.glcAction.findUnique({ where: { id }, select: { id: true, status: true, ownerId: true, projectId: true } });
    if (!before) throw new DecisionError("Action not found.", "NOT_FOUND");
    if (!canCompleteGlcAction(ctx.roles, ctx.userId, before.ownerId)) throw new DecisionError("Only the owner, an Executive or a Head can mark this done.", "FORBIDDEN");
    const n = await tx.glcAction.updateMany({ where: { id, status: "open" }, data: { status: "done" } });
    if (n.count === 0) throw new DecisionError("This action is already done.", "CONFLICT");
    await audit(tx, ctx, { action: "glc_action.complete", entityType: "glc_action", entityId: id, before: { status: before.status }, after: { status: "done" } });
    await emitDomainEvent(tx, ctx, { type: "glc_action.completed", entityType: "glc_action", entityId: id, payload: { projectId: before.projectId } });
    return { id, status: "done" as const };
  });
}

// ── Reads ─────────────────────────────────────────────────────────────────────

const REQUEST_SELECT = {
  id: true,
  title: true,
  context: true,
  options: true,
  projectId: true,
  project: {
    select: {
      name: true,
      leadUserId: true,
      lead: { select: { name: true } },
      members: { where: { role: "Project Manager" }, select: { userId: true, user: { select: { name: true } } } },
    },
  },
  raisedById: true,
  raisedBy: { select: { name: true } },
  dueDate: true,
  status: true,
  outcome: true,
  outcomeNote: true,
  decidedBy: { select: { name: true } },
  decidedAt: true,
  decisionId: true,
  createdAt: true,
} satisfies Prisma.DecisionRequestSelect;
type RequestRecord = Prisma.DecisionRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

async function rolesOf(tx: Tx, userIds: string[]): Promise<Map<string, string[]>> {
  const ids = [...new Set(userIds)];
  const rows = ids.length ? await tx.roleAssignment.findMany({ where: { userId: { in: ids } }, select: { userId: true, role: true } }) : [];
  const out = new Map<string, string[]>();
  for (const r of rows) (out.get(r.userId) ?? out.set(r.userId, []).get(r.userId)!).push(r.role);
  return out;
}

function toRow(r: RequestRecord, roles: Map<string, string[]>): DecisionRow {
  const raiserName = r.raisedBy.name;
  // The people a decision notifies (decideRequest's recipients): the raiser and the PM(s).
  const pms = new Map<string, string>();
  if (r.project?.leadUserId && r.project.lead) pms.set(r.project.leadUserId, r.project.lead.name);
  for (const m of r.project?.members ?? []) pms.set(m.userId, m.user.name);
  pms.delete(r.raisedById);
  return {
    id: r.id,
    title: r.title,
    context: r.context,
    options: readOptions(r.options),
    projectId: r.projectId,
    projectName: r.project?.name ?? null,
    raisedBy: { id: r.raisedById, name: raiserName, roles: roles.get(r.raisedById) ?? [] },
    dueDate: r.dueDate?.toISOString() ?? null,
    status: r.status as RequestStatus,
    outcome: (r.outcome as Outcome | null) ?? null,
    outcomeNote: r.outcomeNote,
    decidedByName: r.decidedBy?.name ?? null,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    decisionId: r.decisionId,
    createdAt: r.createdAt.toISOString(),
    notifyNames: [raiserName, ...[...pms.values()].map((n) => `PM ${n}`)],
  };
}

export interface DecisionListParams {
  tab: DecisionTab;
  q: string;
  page: number;
  size: number;
  projectId?: string;
  /** Raised By (decisions) or Owner (GLC actions). */
  personId?: string;
  due?: DueFilter;
}

function dueWhere(due: DueFilter | undefined, now: Date, tz: string): Prisma.DateTimeNullableFilter | null | undefined {
  if (!due) return undefined;
  if (due === "none") return null;
  const { from, to } = dueFilterDays(due, dayKey(now, tz));
  return { ...(from && { gte: startOfDayInZone(from, tz) }), ...(to && { lt: startOfDayInZone(addDays(to, 1), tz) }) };
}

export interface DecisionsPageData {
  counts: { waiting: number; decided: number; actions: number };
  requests: DecisionRow[];
  actions: GlcRow[];
  info: PageInfo;
  filters: { projects: { value: string; label: string }[]; people: { value: string; label: string }[] };
}

export async function getDecisionsPage(ctx: TenantContext, p: DecisionListParams, now: Date, tz: string): Promise<DecisionsPageData> {
  return withTenant(ctx, async (tx) => {
    const dueFilter = dueWhere(p.due, now, tz);
    const counts = await Promise.all([
      tx.decisionRequest.count({ where: { status: { in: WAITING_STATUSES } } }),
      tx.decisionRequest.count({ where: { status: "decided" } }),
      tx.glcAction.count({ where: { status: "open" } }),
    ]);

    if (p.tab === "actions") {
      const where: Prisma.GlcActionWhereInput = {
        ...(p.q && { OR: [{ title: containsText(p.q) }, { project: { name: containsText(p.q) } }] }),
        ...(p.projectId && { projectId: p.projectId }),
        ...(p.personId && { ownerId: p.personId }),
        ...(dueFilter !== undefined && { dueDate: dueFilter }),
      };
      const total = await tx.glcAction.count({ where });
      const info = pageInfo(total, p.page, p.size);
      const [rows, projects, owners] = await Promise.all([
        tx.glcAction.findMany({
          where,
          // Open before done; soonest due first; then oldest.
          orderBy: [{ status: "desc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }],
          skip: info.skip,
          take: info.size,
          select: {
            id: true,
            title: true,
            projectId: true,
            project: { select: { name: true } },
            ownerId: true,
            owner: { select: { name: true } },
            dueDate: true,
            status: true,
            decisionRequestId: true,
            decisionRequest: { select: { title: true } },
            createdAt: true,
          },
        }),
        tx.glcAction.findMany({ where: { projectId: { not: null } }, distinct: ["projectId"], select: { project: { select: { id: true, name: true } } } }),
        tx.glcAction.findMany({ where: { ownerId: { not: null } }, distinct: ["ownerId"], select: { owner: { select: { id: true, name: true } } } }),
      ]);
      return {
        counts: { waiting: counts[0], decided: counts[1], actions: counts[2] },
        requests: [],
        actions: rows.map((a) => ({
          id: a.id,
          title: a.title,
          projectId: a.projectId,
          projectName: a.project?.name ?? null,
          ownerId: a.ownerId,
          ownerName: a.owner?.name ?? null,
          dueDate: a.dueDate?.toISOString() ?? null,
          status: a.status as GlcStatus,
          decisionRequestId: a.decisionRequestId,
          decisionTitle: a.decisionRequest?.title ?? null,
          createdAt: a.createdAt.toISOString(),
        })),
        info,
        filters: {
          projects: options(projects.map((x) => x.project)),
          people: options(owners.map((x) => x.owner)),
        },
      };
    }

    const statusWhere: Prisma.DecisionRequestWhereInput = p.tab === "waiting" ? { status: { in: WAITING_STATUSES } } : { status: "decided" };
    const where: Prisma.DecisionRequestWhereInput = {
      ...statusWhere,
      ...(p.q && { OR: [{ title: containsText(p.q) }, { project: { name: containsText(p.q) } }] }),
      ...(p.projectId && { projectId: p.projectId }),
      ...(p.personId && { raisedById: p.personId }),
      ...(dueFilter !== undefined && { dueDate: dueFilter }),
    };
    const total = await tx.decisionRequest.count({ where });
    const info = pageInfo(total, p.page, p.size);
    const [rows, projects, raisers] = await Promise.all([
      tx.decisionRequest.findMany({
        where,
        orderBy:
          p.tab === "waiting"
            ? [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }]
            : [{ decidedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
        skip: info.skip,
        take: info.size,
        select: REQUEST_SELECT,
      }),
      tx.decisionRequest.findMany({ where: { ...statusWhere, projectId: { not: null } }, distinct: ["projectId"], select: { project: { select: { id: true, name: true } } } }),
      tx.decisionRequest.findMany({ where: statusWhere, distinct: ["raisedById"], select: { raisedBy: { select: { id: true, name: true } } } }),
    ]);
    const roles = await rolesOf(tx, rows.map((r) => r.raisedById));
    return {
      counts: { waiting: counts[0], decided: counts[1], actions: counts[2] },
      requests: rows.map((r) => toRow(r, roles)),
      actions: [],
      info,
      filters: { projects: options(projects.map((x) => x.project)), people: options(raisers.map((x) => x.raisedBy)) },
    };
  });
}

function options(xs: ({ id: string; name: string } | null)[]): { value: string; label: string }[] {
  return xs
    .filter((x): x is { id: string; name: string } => !!x)
    .map((x) => ({ value: x.id, label: x.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** One request by id (the drawer opened from a link: ?open=<id>), or null. */
export async function getDecisionRequest(ctx: TenantContext, id: string): Promise<DecisionRow | null> {
  return withTenant(ctx, async (tx) => {
    const r = await tx.decisionRequest.findUnique({ where: { id }, select: REQUEST_SELECT });
    if (!r) return null;
    return toRow(r, await rolesOf(tx, [r.raisedById]));
  });
}

/** The sidebar count: decisions waiting on the Group. */
export async function countWaitingDecisions(ctx: TenantContext): Promise<number> {
  return withTenant(ctx, (tx) => tx.decisionRequest.count({ where: { status: { in: WAITING_STATUSES } } }));
}

export interface WaitingSummary {
  total: number;
  /** The first few, soonest due first. */
  top: { id: string; title: string; projectId: string | null; projectName: string | null; raisedBy: string; dueDate: string | null }[];
  /** Per project: the soonest-due waiting decision ("Go to the decision"). */
  byProject: Record<string, string>;
  /** Every waiting decision's due date (ISO), so the page counts overdue in the tenant's zone. */
  dueDates: string[];
}

/** The Executive home's read (inside its own RLS transaction): waiting decisions. */
export async function waitingDecisionsSummary(tx: Tx, limit = 3): Promise<WaitingSummary> {
  const rows = await tx.decisionRequest.findMany({
    where: { status: { in: WAITING_STATUSES } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, title: true, projectId: true, project: { select: { name: true } }, raisedById: true, raisedBy: { select: { name: true } }, dueDate: true },
  });
  const roles = await rolesOf(tx, rows.slice(0, limit).map((r) => r.raisedById));
  const byProject: Record<string, string> = {};
  for (const r of rows) if (r.projectId && !byProject[r.projectId]) byProject[r.projectId] = r.id;
  return {
    total: rows.length,
    top: rows.slice(0, limit).map((r) => ({
      id: r.id,
      title: r.title,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      raisedBy: raisedByLine({ name: r.raisedBy.name, roles: roles.get(r.raisedById) ?? [] }),
      dueDate: r.dueDate?.toISOString() ?? null,
    })),
    byProject,
    dueDates: rows.flatMap((r) => (r.dueDate ? [r.dueDate.toISOString()] : [])),
  };
}

/** The GLC action form's owner list: active people in the tenant. */
export async function glcOwnerOptions(ctx: TenantContext): Promise<{ value: string; label: string }[]> {
  return withTenant(ctx, async (tx) => {
    const users = await tx.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    return users.map((u) => ({ value: u.id, label: u.name }));
  });
}
