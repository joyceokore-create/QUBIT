import { z } from "zod";
import { isTestingCheckpoint } from "@/lib/testing-gates";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { approverRolesFor, canApproveGate, cascadePlan, parseApproval, requiresSignOff, type GateApproval } from "@/lib/gate-approval";
import { PM_SELECT, pmIdsOf } from "@/lib/ownership";
import { emitDomainEvent, type NotifyEntry } from "@/server/events";
import { evaluateGate, type GateRule } from "@/server/gate-rules";

/**
 * Delivery checkpoints (docs/18 §2). The gates a project marches through are DATA — a
 * tenant-scoped template holds an ordered list, the project picks one, and state is
 * tracked per unit of tracking: the project itself (orgUnitId null, the pipeline lens)
 * or a project × market track (rollout lens, M-D-B).
 *
 * The point of all this: **% complete is DERIVED from checkpoint state and never typed**
 * (§2). The slide's hand-maintained percentages become computed and therefore current.
 */

// The states and the derived-% rule are pure and client-safe; they live in src/lib so the
// cockpit's client components can share them (UX1). Re-exported for existing callers.
import { CHECKPOINT_STATES, derivedProgress, type CheckpointState } from "@/lib/checkpoint-progress";
export { CHECKPOINT_STATES, derivedProgress, type CheckpointState } from "@/lib/checkpoint-progress";

export interface CheckpointRow {
  checkpointId: string;
  name: string;
  orderIndex: number;
  state: CheckpointState;
  blockerId: string | null;
  blockerReason: string | null;
  /** What this gate asks for, and whether it is satisfied (docs/16 §6). */
  gate: GateRule[];
  /** Set when the gate was closed with its checklist unmet — visible forever. */
  overrideReason: string | null;
  /** UX9 (D10): a testing gate (SIT/UAT) — the only kind Head of QA may set. */
  testing: boolean;
  /** Provenance when a status-report upload moved it: the file, when, by whom. */
  source: { label: string; at: Date; byName: string | null } | null;
  /** WS1 — the status row's id (null until the gate is first written on this track). */
  statusId: string | null;
  /** WS1 — closing this gate needs a sign-off (Go-Live, SIT exit, UAT exit by default). */
  signOff: boolean;
  /** WS1 — sign-off state, separate from `state`. */
  approval: GateApproval;
  /** WS1 — who asked for sign-off and who decided, when; ISO strings (JSON-safe). */
  submitted: { byId: string | null; byName: string | null; at: string | null } | null;
  decided: { byName: string | null; at: string | null; note: string | null } | null;
}

/** Who moved a state and from what — a machine path's stamp (the upload's file name). */
export interface StateOrigin {
  source: string;
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
/** docs/38 — which gate track: the product's own (both null), one instance's
 * (orgUnitId), or one module's own gates (moduleId; with orgUnitId = that module in that
 * instance). */
export interface GateScope {
  orgUnitId?: string | null;
  moduleId?: string | null;
  /** Joyce (2026-10-07): at "All" a change applies to the product AND every live market
   * (the same track everywhere); with a market selected, to that market only. */
  allMarkets?: boolean;
}
const scopeWhere = (scope?: GateScope) => ({ orgUnitId: scope?.orgUnitId ?? null, moduleId: scope?.moduleId ?? null });
const scopeKey = (projectId: string, checkpointId: string, scope?: GateScope) =>
  `${projectId}:${checkpointId}${scope?.orgUnitId ? `:${scope.orgUnitId}` : ""}${scope?.moduleId ? `:m:${scope.moduleId}` : ""}`;

/** docs/38 — the template a scope follows: the instance's / module's own when set, else
 * the project's (one track for all markets). */
async function templateFor(tx: Prisma.TransactionClient, projectId: string, scope?: GateScope) {
  const select = { id: true, name: true, checkpoints: { select: { id: true, name: true, orderIndex: true, testing: true, requiresApproval: true }, orderBy: { orderIndex: "asc" as const } } };
  if (scope?.moduleId) {
    const mod = await tx.projectModule.findFirst({ where: { id: scope.moduleId, projectId }, select: { checkpointTemplate: { select } } });
    if (mod?.checkpointTemplate) return mod.checkpointTemplate;
  }
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { checkpointTemplate: { select } } });
  return project?.checkpointTemplate ?? null;
}

export async function getProjectCheckpoints(
  ctx: TenantContext,
  projectId: string,
  scope?: GateScope,
): Promise<ProjectCheckpoints> {
  return withTenant(ctx, async (tx) => {
    const template = await templateFor(tx, projectId, scope);
    const project = template ? { checkpointTemplateId: template.id, checkpointTemplate: template } : null;
    if (!project?.checkpointTemplateId || !project.checkpointTemplate) {
      return { templateId: null, templateName: null, rows: [], progress: 0 };
    }
    const statuses = await tx.checkpointStatus.findMany({
      where: { projectId, ...scopeWhere(scope) },
      select: {
        id: true, checkpointId: true, state: true, blockerId: true, overrideReason: true,
        source: true, sourceAt: true, sourceById: true,
        approval: true, submittedById: true, submittedAt: true, decidedById: true, decidedAt: true, decisionNote: true,
        blocker: { select: { description: true } },
      },
    });
    const byCheckpoint = new Map(statuses.map((s) => [s.checkpointId, s]));
    const sourceIds = [...new Set(statuses.flatMap((s) => [s.sourceById, s.submittedById, s.decidedById]).filter((x): x is string => Boolean(x)))];
    const names = new Map(sourceIds.length ? (await tx.user.findMany({ where: { id: { in: sourceIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]) : []);

    // Gate checklists are evaluated for every checkpoint so the UI can show what a gate
    // will ask for BEFORE somebody tries to close it (docs/16 §6).
    const gates = await Promise.all(
      project.checkpointTemplate.checkpoints.map((c) => evaluateGate(tx, projectId, c.name)),
    );

    const rows: CheckpointRow[] = project.checkpointTemplate.checkpoints.map((c, i) => {
      const s = byCheckpoint.get(c.id);
      return {
        checkpointId: c.id,
        testing: isTestingCheckpoint(c),
        name: c.name,
        orderIndex: c.orderIndex,
        state: ((s?.state ?? "NotStarted") as CheckpointState),
        blockerId: s?.blockerId ?? null,
        blockerReason: s?.blocker?.description ?? null,
        gate: gates[i].rules,
        overrideReason: s?.overrideReason ?? null,
        source: s?.source && s.sourceAt ? { label: s.source, at: s.sourceAt, byName: s.sourceById ? (names.get(s.sourceById) ?? null) : null } : null,
        statusId: s?.id ?? null,
        signOff: requiresSignOff(c),
        approval: parseApproval(s?.approval),
        submitted: s?.submittedAt ? { byId: s.submittedById, byName: s.submittedById ? (names.get(s.submittedById) ?? null) : null, at: s.submittedAt.toISOString() } : null,
        decided: s?.decidedAt ? { byName: s.decidedById ? (names.get(s.decidedById) ?? null) : null, at: s.decidedAt.toISOString(), note: s.decisionNote } : null,
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
      where: { projectId: { in: projectIds }, orgUnitId: null, moduleId: null },
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
    where: { projectId: { in: projects.map((p) => p.id) }, orgUnitId: null, moduleId: null },
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
  code: "NOT_FOUND" | "BLOCKER_REQUIRED" | "TEMPLATE_MISMATCH" | "GATE_UNMET";
  /** Populated for GATE_UNMET so the UI can list what the gate is still waiting on. */
  unmet?: GateRule[];
  constructor(message: string, code: CheckpointError["code"], unmet?: GateRule[]) {
    super(message);
    this.code = code;
    this.unmet = unmet;
  }
}

/** UX9 (D10): is this checkpoint a testing gate (flag, else its name)? Null when not found. */
export async function checkpointIsTesting(ctx: TenantContext, checkpointId: string): Promise<boolean | null> {
  const c = await withTenant(ctx, (tx) => tx.checkpoint.findUnique({ where: { id: checkpointId }, select: { name: true, testing: true } }));
  return c ? isTestingCheckpoint(c) : null;
}

export const SetCheckpointStateInput = z.object({
  checkpointId: z.string().min(1),
  state: z.enum(CHECKPOINT_STATES),
  /** Required when moving to Blocked — same flag pattern as tasks (§2). */
  blockerId: z.string().uuid().nullable().optional(),
  /** docs/16 §6 — closing a gate whose checklist is unmet needs a written reason. */
  overrideReason: z.string().trim().min(5, "Say why the gate is being closed early.").max(300).optional(),
  /** Joyce (2026-10-12): a later gate Done closes the earlier ones still open. Run here, on
   * the server, so it stops at a sign-off gate (WS1) the same way for every caller. */
  cascade: z.boolean().optional(),
});
export type SetCheckpointStateInputT = z.infer<typeof SetCheckpointStateInput>;

type Tx = Prisma.TransactionClient;
type TemplateCheckpoint = { id: string; name: string; orderIndex: number; testing: boolean | null; requiresApproval: boolean | null };
type BeforeRow = { id: string; state: string; approval: string; submittedById: string | null } | null;
const BEFORE_SELECT = { id: true, state: true, approval: true, submittedById: true } as const;

const unitAfter = (unitScope: GateScope) => ({
  ...(unitScope.orgUnitId ? { orgUnitId: unitScope.orgUnitId } : {}),
  ...(unitScope.moduleId ? { moduleId: unitScope.moduleId } : {}),
});

/** One gate's state written on one track (update or create), audited, with its domain event.
 * The single write path for a state change — hand edits, uploads, the cascade and approvals. */
async function writeStateTx(
  tx: Tx,
  ctx: TenantContext,
  w: {
    projectId: string;
    checkpoint: { id: string; name: string };
    unitScope: GateScope;
    before: BeforeRow;
    state: CheckpointState;
    blockerId?: string | null;
    override?: { reason: string; byId: string; at: Date } | null;
    origin?: StateOrigin;
    /** WS1 — sign-off columns written in the same update (approval / reset). */
    approval?: Prisma.CheckpointStatusUncheckedUpdateInput;
    /** Audit hint: the gate this one was closed behind ("before UAT"). */
    cascadeFrom?: string;
  },
): Promise<string> {
  const { projectId, checkpoint, unitScope, before, state, override, origin } = w;
  const data = {
    state,
    blockerId: state === "Blocked" ? (w.blockerId ?? null) : null,
    overrideReason: override?.reason ?? null,
    overriddenById: override?.byId ?? null,
    overriddenAt: override?.at ?? null,
    source: origin?.source.slice(0, 160) ?? null,
    sourceAt: origin ? new Date() : null,
    sourceById: origin ? ctx.userId : null,
    ...(w.approval ?? {}),
  };
  const id = before
    ? (await tx.checkpointStatus.update({ where: { id: before.id }, data, select: { id: true } })).id
    : (await tx.checkpointStatus.create({ data: { tenantId: ctx.tenantId, projectId, checkpointId: checkpoint.id, ...scopeWhere(unitScope), ...(data as Omit<Prisma.CheckpointStatusUncheckedCreateInput, "tenantId" | "projectId" | "checkpointId">) }, select: { id: true } })).id;
  if (before?.state === state) return id;

  const key = scopeKey(projectId, checkpoint.id, unitScope);
  await audit(tx, ctx, {
    action: "update",
    entityType: "checkpoint_status",
    entityId: key,
    before: { state: before?.state ?? "NotStarted" },
    after: {
      state,
      checkpoint: checkpoint.name,
      ...unitAfter(unitScope),
      ...(override ? { gateOverridden: true, overrideReason: override.reason } : {}),
      ...(origin ? { source: origin.source } : {}),
      ...(w.cascadeFrom ? { cascadeFrom: w.cascadeFrom } : {}),
    },
  });
  // The exec delta feed narrates gate movement like any other tracked change.
  await emitDomainEvent(tx, ctx, {
    type: "checkpoint.state_changed",
    entityType: "checkpoint_status",
    entityId: key,
    payload: {
      projectId,
      orgUnitId: unitScope.orgUnitId ?? null,
      moduleId: unitScope.moduleId ?? null,
      checkpoint: checkpoint.name,
      from: before?.state ?? "NotStarted",
      to: state,
      gateOverridden: !!override,
    },
  });
  return id;
}

/** WS1 — the project's code/name and the people who run it (notification recipients). */
async function projectForNotify(tx: Tx, projectId: string) {
  const p = await tx.project.findUnique({ where: { id: projectId }, select: { code: true, name: true, ...PM_SELECT } });
  return p ? { code: p.code, name: p.name, pmIds: pmIdsOf(p) } : null;
}

async function unitLabel(tx: Tx, unitScope: GateScope): Promise<string | null> {
  if (!unitScope.orgUnitId) return null;
  const u = await tx.orgUnit.findUnique({ where: { id: unitScope.orgUnitId }, select: { name: true } });
  return u?.name ?? null;
}

/**
 * WS1 — ask for sign-off on one gate, on one track: approval = submitted, `state` untouched.
 * Used by the PM's "Submit for Sign-Off", by a sign-off gate set Done by a non-approver, by a
 * status-report upload (with its provenance stamp) and by the cascade. Audited as
 * `gate.submit`; the approvers for the gate's kind are notified (once per call: `notify`).
 */
export async function submitGateTx(
  tx: Tx,
  ctx: TenantContext,
  s: { projectId: string; checkpoint: TemplateCheckpoint; unitScope: GateScope; before: BeforeRow; origin?: StateOrigin; via?: "hand" | "upload" | "cascade"; notify?: boolean },
): Promise<string> {
  const now = new Date();
  const data = {
    approval: "submitted",
    submittedById: ctx.userId,
    submittedAt: now,
    decidedById: null,
    decidedAt: null,
    decisionNote: null,
    ...(s.origin ? { source: s.origin.source.slice(0, 160), sourceAt: now, sourceById: ctx.userId } : {}),
  };
  const id = s.before
    ? (await tx.checkpointStatus.update({ where: { id: s.before.id }, data, select: { id: true } })).id
    : (await tx.checkpointStatus.create({ data: { tenantId: ctx.tenantId, projectId: s.projectId, checkpointId: s.checkpoint.id, ...scopeWhere(s.unitScope), ...data }, select: { id: true } })).id;
  const key = scopeKey(s.projectId, s.checkpoint.id, s.unitScope);
  const testing = isTestingCheckpoint(s.checkpoint);
  await audit(tx, ctx, {
    action: "gate.submit",
    entityType: "checkpoint_status",
    entityId: key,
    before: { approval: s.before?.approval ?? "none", state: s.before?.state ?? "NotStarted" },
    after: { approval: "submitted", statusId: id, checkpoint: s.checkpoint.name, testing, via: s.via ?? "hand", ...unitAfter(s.unitScope), ...(s.origin ? { source: s.origin.source } : {}) },
  });
  let notify: NotifyEntry[] = [];
  if (s.notify !== false) {
    const [project, approvers, market] = await Promise.all([
      projectForNotify(tx, s.projectId),
      tx.roleAssignment.findMany({ where: { role: { in: approverRolesFor(testing) } }, select: { userId: true } }),
      unitLabel(tx, s.unitScope),
    ]);
    const what = `${project?.name ?? "A project"} · ${s.checkpoint.name}${market ? ` (${market})` : ""}`;
    notify = [...new Set(approvers.map((a) => a.userId))]
      .filter((u) => u !== ctx.userId)
      .map((userId) => ({ userId, kind: "gate.submitted", message: `${what} is waiting for your sign-off.`, link: "/approvals?tab=gates" }));
  }
  await emitDomainEvent(tx, ctx, {
    type: "gate.submitted",
    entityType: "checkpoint_status",
    entityId: key,
    payload: { projectId: s.projectId, statusId: id, checkpoint: s.checkpoint.name, testing, orgUnitId: s.unitScope.orgUnitId ?? null, via: s.via ?? "hand" },
    notify,
  });
  return id;
}

/** WS1 — tell the PM(s) and the submitter about a decision (approved / returned). */
export async function notifyDecisionTx(
  tx: Tx,
  ctx: TenantContext,
  d: { projectId: string; checkpointName: string; unitScope: GateScope; statusId: string; submittedById: string | null; kind: "approved" | "approved_with_exception" | "returned"; note: string | null; implicit?: boolean },
): Promise<void> {
  const [project, market] = await Promise.all([projectForNotify(tx, d.projectId), unitLabel(tx, d.unitScope)]);
  const what = `${d.checkpointName}${market ? ` (${market})` : ""} on ${project?.name ?? "your project"}`;
  const message =
    d.kind === "returned" ? `${what} was returned: ${d.note ?? ""}`.trim() : d.kind === "approved_with_exception" ? `${what} was signed off with an exception.` : `${what} was signed off.`;
  const to = [...new Set([...(project?.pmIds ?? []), ...(d.submittedById ? [d.submittedById] : [])])].filter((u) => u !== ctx.userId);
  await emitDomainEvent(tx, ctx, {
    type: d.kind === "returned" ? "gate.returned" : "gate.approved",
    entityType: "checkpoint_status",
    entityId: d.statusId,
    payload: { projectId: d.projectId, statusId: d.statusId, checkpoint: d.checkpointName, outcome: d.kind, orgUnitId: d.unitScope.orgUnitId ?? null, ...(d.implicit ? { implicit: true } : {}) },
    notify: to.map((userId) => ({ userId, kind: d.kind === "returned" ? "gate.returned" : "gate.approved", message: message.slice(0, 280), link: `/projects/${d.projectId}?tab=Delivery` })),
  });
}

/**
 * The cascade on one track (Joyce, 2026-10-12), server-side since WS1: after `checkpointId`
 * closed, the earlier gates still open close too — except a gate whose checklist refuses
 * (it stays for the PM to decide, as before) — and an open sign-off gate in the way is
 * submitted, not closed, and the cascade stops there.
 */
export async function cascadeTx(tx: Tx, ctx: TenantContext, projectId: string, checkpoints: TemplateCheckpoint[], checkpointId: string, unitScope: GateScope): Promise<void> {
  const rows = await tx.checkpointStatus.findMany({ where: { projectId, ...scopeWhere(unitScope) }, select: { ...BEFORE_SELECT, checkpointId: true } });
  const byId = new Map(rows.map((r) => [r.checkpointId, r]));
  const me = checkpoints.find((c) => c.id === checkpointId);
  const plan = cascadePlan(
    checkpoints.map((c) => ({ checkpointId: c.id, orderIndex: c.orderIndex, state: byId.get(c.id)?.state ?? "NotStarted", signOff: requiresSignOff(c), approval: byId.get(c.id)?.approval })),
    checkpointId,
  );
  for (const id of plan.close) {
    const c = checkpoints.find((x) => x.id === id)!;
    if ((await evaluateGate(tx, projectId, c.name)).unmet.length > 0) continue;
    await writeStateTx(tx, ctx, { projectId, checkpoint: c, unitScope, before: byId.get(id) ?? null, state: "Done", cascadeFrom: me?.name });
  }
  if (plan.submit) {
    const c = checkpoints.find((x) => x.id === plan.submit)!;
    await submitGateTx(tx, ctx, { projectId, checkpoint: c, unitScope, before: byId.get(c.id) ?? null, via: "cascade" });
  }
}

/** Set one checkpoint's state on the project's own track. Caller holds the governance
 * gate (canWriteProject OR project:stage) — enforced at the route, never here.
 *
 * WS1 — Done on a SIGN-OFF gate (Go-Live, SIT exit, UAT exit by default) does not close it:
 *  - set by hand by an approver for that gate (Head / Super Admin any; Head of QA testing) it
 *    closes as an implicit, audited approval (`gate.approve`, implicit) — unless they
 *    submitted it themselves (four-eyes), when it stays waiting;
 *  - otherwise (the PM, a status-report upload, anyone else) it is SUBMITTED for sign-off and
 *    `state` is left as it was. A gate already Done or already waiting is left alone.
 * Moving a signed-off gate away from Done clears its sign-off. */
export async function setCheckpointState(
  ctx: TenantContext,
  projectId: string,
  input: SetCheckpointStateInputT,
  scope?: GateScope,
  /** Set by machine paths (the status-report upload); a hand change clears the stamp. */
  origin?: StateOrigin,
): Promise<ProjectCheckpoints> {
  await withTenant(ctx, async (tx) => {
    if (scope?.orgUnitId) {
      const track = await tx.projectOrgStatus.findFirst({ where: { projectId, orgUnitId: scope.orgUnitId }, select: { id: true } });
      if (!track) throw new CheckpointError("That instance is not on this project.", "NOT_FOUND");
    }
    if (scope?.moduleId) {
      const mod = await tx.projectModule.findFirst({ where: { id: scope.moduleId, projectId }, select: { id: true, kind: true, ownGates: true, name: true } });
      if (!mod) throw new CheckpointError("That instance or module is not on this project.", "NOT_FOUND");
      if (mod.kind === "module" && !mod.ownGates) throw new CheckpointError(`${mod.name} is tracked by state per market — switch on "own gates" for it first.`, "TEMPLATE_MISMATCH");
    }
    const [template, checkpoint] = await Promise.all([
      templateFor(tx, projectId, scope),
      tx.checkpoint.findUnique({ where: { id: input.checkpointId }, select: { id: true, name: true, templateId: true, orderIndex: true, testing: true, requiresApproval: true } }),
    ]);
    if (!template || !checkpoint) throw new CheckpointError("Checkpoint not found.", "NOT_FOUND");
    if (template.id !== checkpoint.templateId) {
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

    // The markets this change lands on: the selected one, or — at "All" — the product's
    // own row plus every live market, so one dropdown moves the same gate everywhere.
    const units: GateScope[] = (
      scope?.allMarkets && !scope.orgUnitId
        ? [null, ...(await tx.projectOrgStatus.findMany({ where: { projectId, retiredAt: null }, select: { orgUnitId: true } })).map((m) => m.orgUnitId)]
        : [scope?.orgUnitId ?? null]
    ).map((unit) => ({ orgUnitId: unit, moduleId: scope?.moduleId ?? null }));
    const befores: BeforeRow[] = await Promise.all(
      units.map((u) => tx.checkpointStatus.findFirst({ where: { projectId, checkpointId: input.checkpointId, ...scopeWhere(u) }, select: BEFORE_SELECT })),
    );

    // WS1 — what Done means on each track for a sign-off gate.
    const signOff = requiresSignOff(checkpoint);
    const testing = isTestingCheckpoint(checkpoint);
    const approverByHand = !origin && canApproveGate(ctx.roles, testing);
    type Mode = "write" | "approve" | "submit" | "skip";
    const modes: Mode[] = befores.map((b) => {
      if (input.state !== "Done" || !signOff) return "write";
      if (b?.state === "Done") return "skip";
      if (approverByHand && !(b?.approval === "submitted" && b.submittedById === ctx.userId)) return "approve";
      return b?.approval === "submitted" ? "skip" : "submit";
    });

    // docs/16 §6 — the gate checklist. Closing a gate whose requirements are unmet is
    // allowed (soft-block), but only with a written reason, and the override is stamped
    // on the row so it stays visible long after the moment. A submission closes nothing,
    // so it is not asked: the approver weighs the checklist (approve with exception).
    let override: { reason: string; byId: string; at: Date } | null = null;
    if (input.state === "Done" && modes.some((m) => m === "write" || m === "approve")) {
      const gate = await evaluateGate(tx, projectId, checkpoint.name);
      if (gate.unmet.length > 0) {
        if (!input.overrideReason) {
          throw new CheckpointError(
            `${checkpoint.name} still needs: ${gate.unmet.map((r) => r.label).join("; ")}.`,
            "GATE_UNMET",
            gate.unmet,
          );
        }
        override = { reason: input.overrideReason, byId: ctx.userId, at: new Date() };
      }
    }

    let notified = false;
    for (let i = 0; i < units.length; i++) {
      const unitScope = units[i]!;
      const before = befores[i]!;
      const mode = modes[i]!;
      if (mode === "skip") continue;
      if (mode === "submit") {
        // One notification per action, not one per market.
        await submitGateTx(tx, ctx, { projectId, checkpoint, unitScope, before, origin, via: origin ? "upload" : "hand", notify: !notified });
        notified = true;
        continue;
      }
      const leavingSignedOff = before?.state === "Done" && input.state !== "Done" && (before.approval === "approved" || before.approval === "approved_with_exception");
      const now = new Date();
      const approval: Prisma.CheckpointStatusUncheckedUpdateInput | undefined =
        mode === "approve"
          ? { approval: override ? "approved_with_exception" : "approved", decidedById: ctx.userId, decidedAt: now, decisionNote: override?.reason ?? null }
          : leavingSignedOff
            ? { approval: "none", submittedById: null, submittedAt: null, decidedById: null, decidedAt: null, decisionNote: null }
            : undefined;
      const id = await writeStateTx(tx, ctx, { projectId, checkpoint, unitScope, before, state: input.state, blockerId: input.blockerId, override, origin, approval });
      if (mode === "approve") {
        await audit(tx, ctx, {
          action: override ? "gate.approve_exception" : "gate.approve",
          entityType: "checkpoint_status",
          entityId: scopeKey(projectId, checkpoint.id, unitScope),
          before: { approval: before?.approval ?? "none", state: before?.state ?? "NotStarted" },
          after: { approval: override ? "approved_with_exception" : "approved", state: "Done", statusId: id, checkpoint: checkpoint.name, implicit: true, ...unitAfter(unitScope), ...(override ? { decisionNote: override.reason } : {}) },
        });
        if (!notified) {
          await notifyDecisionTx(tx, ctx, { projectId, checkpointName: checkpoint.name, unitScope, statusId: id, submittedById: before?.submittedById ?? null, kind: override ? "approved_with_exception" : "approved", note: override?.reason ?? null, implicit: true });
          notified = true;
        }
      } else if (leavingSignedOff) {
        await audit(tx, ctx, {
          action: "update",
          entityType: "checkpoint_status",
          entityId: scopeKey(projectId, checkpoint.id, unitScope),
          before: { approval: before.approval },
          after: { approval: "none", reason: "reopened", checkpoint: checkpoint.name, ...unitAfter(unitScope) },
        });
      }
      if (input.cascade && input.state === "Done") await cascadeTx(tx, ctx, projectId, template.checkpoints, checkpoint.id, unitScope);
    }
  });
  return getProjectCheckpoints(ctx, projectId, scope);
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
    // docs/38 — retired templates leave the picker; projects already on one keep it.
    const rows = await tx.checkpointTemplate.findMany({
      where: { retiredAt: null },
      select: { id: true, name: true, _count: { select: { checkpoints: true } } },
      orderBy: { name: "asc" },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, checkpointCount: r._count.checkpoints }));
  });
}
