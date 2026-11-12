import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { runsProjectWhere, PM_SELECT, pmIdsOf } from "@/lib/ownership";
import { isTestingCheckpoint } from "@/lib/testing-gates";
import { derivedProgress, type CheckpointState } from "@/lib/checkpoint-progress";
import {
  approverScope,
  canApproveGate,
  checkDecision,
  DECISION_NOTE_MAX,
  DECISION_NOTE_MIN,
  exceptionAllowed,
  parseApproval,
  requiresSignOff,
  type DecisionError,
  type DecisionKind,
  type GateApproval,
  type GateQueueItem,
} from "@/lib/gate-approval";
export type { GateQueueItem } from "@/lib/gate-approval";
import { cascadeTx, notifyDecisionTx, submitGateTx, type GateScope } from "@/server/checkpoints";
import { emitDomainEvent } from "@/server/events";
import { evaluateGate, gatherFacts, type GateRule } from "@/server/gate-rules";
import { openCriticalForProject } from "@/server/quality";

/**
 * WS1 (UX fidelity Tier 4) — the gate sign-off engine. Every default of
 * mwashukes-desk/plans/ws1-ws2-proposals.md § WS1 is taken (see src/lib/gate-approval.ts for
 * the pure rules). This module owns the three transitions a person makes on purpose —
 * submit, approve (with or without exception) and return — and the reads the Approvals page,
 * the Head / Head of QA homes and the Brief list. All of it runs under the caller's tenant
 * RLS context (withTenant); the route decides WHO may submit (canWriteProject), the engine
 * decides who may APPROVE (approver scope + four-eyes), so no route can skip the rule.
 */

export const ApproveInput = z.object({
  /** Approve with exception: allowed only when the checklist is unmet or (testing) critical
   * issues are open, and then the note is required. */
  exception: z.boolean().optional(),
  note: z.string().trim().max(DECISION_NOTE_MAX).optional(),
});
export const ReturnInput = z.object({
  note: z.string().trim().min(DECISION_NOTE_MIN, "Say why it is going back to the PM.").max(DECISION_NOTE_MAX),
});
export const SubmitInput = z.object({}).strict();

export type GateApprovalErrorCode = DecisionError["code"] | "NOT_FOUND" | "NOT_SIGN_OFF" | "ALREADY_DONE" | "ALREADY_SUBMITTED";
export class GateApprovalError extends Error {
  code: GateApprovalErrorCode;
  constructor(message: string, code: GateApprovalErrorCode) {
    super(message);
    this.code = code;
  }
}

type Tx = Prisma.TransactionClient;

const ROW_SELECT = {
  id: true,
  projectId: true,
  checkpointId: true,
  orgUnitId: true,
  moduleId: true,
  state: true,
  approval: true,
  submittedById: true,
  submittedAt: true,
  decidedById: true,
  decidedAt: true,
  decisionNote: true,
  source: true,
  sourceAt: true,
  checkpoint: { select: { id: true, name: true, orderIndex: true, testing: true, requiresApproval: true, templateId: true } },
} satisfies Prisma.CheckpointStatusSelect;

async function loadRow(tx: Tx, projectId: string, statusId: string) {
  const row = await tx.checkpointStatus.findUnique({ where: { id: statusId }, select: ROW_SELECT });
  // RLS already hides another tenant's row; the project check stops a URL mix-up.
  if (!row || row.projectId !== projectId) throw new GateApprovalError("Gate not found.", "NOT_FOUND");
  return row;
}

/** The template a track follows — a module's own when it has one, else the project's. */
async function trackCheckpoints(tx: Tx, projectId: string, moduleId: string | null) {
  const select = { checkpoints: { select: { id: true, name: true, orderIndex: true, testing: true, requiresApproval: true }, orderBy: { orderIndex: "asc" as const } } };
  if (moduleId) {
    const mod = await tx.projectModule.findFirst({ where: { id: moduleId, projectId }, select: { checkpointTemplate: { select } } });
    if (mod?.checkpointTemplate) return mod.checkpointTemplate.checkpoints;
  }
  const p = await tx.project.findUnique({ where: { id: projectId }, select: { checkpointTemplate: { select } } });
  return p?.checkpointTemplate?.checkpoints ?? [];
}

const scopeOf = (row: { orgUnitId: string | null; moduleId: string | null }): GateScope => ({ orgUnitId: row.orgUnitId, moduleId: row.moduleId });
const auditKey = (row: { projectId: string; checkpointId: string; orgUnitId: string | null; moduleId: string | null }) =>
  `${row.projectId}:${row.checkpointId}${row.orgUnitId ? `:${row.orgUnitId}` : ""}${row.moduleId ? `:m:${row.moduleId}` : ""}`;

// ── Submit ─────────────────────────────────────────────────────────────────────

/** The PM asks for sign-off on one gate track. The route has checked canWriteProject. */
export async function submitGate(ctx: TenantContext, projectId: string, statusId: string): Promise<{ statusId: string; approval: GateApproval }> {
  return withTenant(ctx, async (tx) => {
    const row = await loadRow(tx, projectId, statusId);
    if (!requiresSignOff(row.checkpoint)) throw new GateApprovalError(`${row.checkpoint.name} closes without a sign-off — set it to done instead.`, "NOT_SIGN_OFF");
    if (row.state === "Done") throw new GateApprovalError(`${row.checkpoint.name} is already done.`, "ALREADY_DONE");
    if (row.approval === "submitted") throw new GateApprovalError(`${row.checkpoint.name} is already waiting for sign-off.`, "ALREADY_SUBMITTED");
    await submitGateTx(tx, ctx, { projectId, checkpoint: row.checkpoint, unitScope: scopeOf(row), before: row, via: "hand" });
    return { statusId: row.id, approval: "submitted" as const };
  });
}

// ── Approve / return ───────────────────────────────────────────────────────────

async function decisionFacts(tx: Tx, row: Awaited<ReturnType<typeof loadRow>>) {
  const testing = isTestingCheckpoint(row.checkpoint);
  const [gate, critical] = await Promise.all([evaluateGate(tx, row.projectId, row.checkpoint.name), testing ? openCriticalForProject(tx, row.projectId, 1) : Promise.resolve({ total: 0 })]);
  return { testing, unmet: gate.unmet, criticalOpen: critical.total };
}

function assertDecision(kind: DecisionKind, row: Awaited<ReturnType<typeof loadRow>>, f: { testing: boolean; unmet: GateRule[]; criticalOpen: number }, ctx: TenantContext, note: string | null | undefined) {
  const err = checkDecision(kind, { approval: parseApproval(row.approval), submittedById: row.submittedById, testing: f.testing, unmet: f.unmet.length, criticalOpen: f.criticalOpen }, ctx, note);
  if (err) throw new GateApprovalError(err.message, err.code);
}

/**
 * Sign a submitted gate off: state = Done, approval = approved (or approved_with_exception
 * with the reason, which is also stamped as the gate's override so the "closed early" marker
 * reads the same as a hand close), then the cascade runs on the same track. Audited
 * (`gate.approve` / `gate.approve_exception`, before/after); the PM and submitter are told.
 */
export async function approveGate(ctx: TenantContext, projectId: string, statusId: string, raw: z.input<typeof ApproveInput>): Promise<{ statusId: string; approval: GateApproval }> {
  const input = ApproveInput.parse(raw);
  return withTenant(ctx, async (tx) => {
    const row = await loadRow(tx, projectId, statusId);
    const f = await decisionFacts(tx, row);
    const kind: DecisionKind = input.exception ? "approve_exception" : "approve";
    assertDecision(kind, row, f, ctx, input.note);
    const approval: GateApproval = kind === "approve_exception" ? "approved_with_exception" : "approved";
    const note = input.note?.trim() || null;
    const now = new Date();
    await tx.checkpointStatus.update({
      where: { id: row.id },
      data: {
        state: "Done",
        blockerId: null,
        approval,
        decidedById: ctx.userId,
        decidedAt: now,
        decisionNote: note,
        // A hand decision: the gate's upload stamp (if any) gives way, as with any hand change.
        source: null,
        sourceAt: null,
        sourceById: null,
        ...(kind === "approve_exception" ? { overrideReason: note, overriddenById: ctx.userId, overriddenAt: now } : { overrideReason: null, overriddenById: null, overriddenAt: null }),
      },
    });
    await audit(tx, ctx, {
      action: kind === "approve_exception" ? "gate.approve_exception" : "gate.approve",
      entityType: "checkpoint_status",
      entityId: auditKey(row),
      before: { approval: row.approval, state: row.state, submittedById: row.submittedById },
      after: {
        approval,
        state: "Done",
        statusId: row.id,
        checkpoint: row.checkpoint.name,
        testing: f.testing,
        ...(row.orgUnitId ? { orgUnitId: row.orgUnitId } : {}),
        ...(note ? { decisionNote: note } : {}),
        ...(kind === "approve_exception" ? { unmet: f.unmet.map((u) => u.key), criticalOpen: f.criticalOpen } : {}),
      },
    });
    await notifyDecisionTx(tx, ctx, { projectId, checkpointName: row.checkpoint.name, unitScope: scopeOf(row), statusId: row.id, submittedById: row.submittedById, kind: approval, note });
    // The existing cascade, on this track: earlier gates still open close (stopping at another
    // sign-off gate, which is submitted).
    const checkpoints = await trackCheckpoints(tx, projectId, row.moduleId);
    if (row.state !== "Done") {
      // The exec delta feed narrates the gate closing like any other state change.
      await emitDomainEvent(tx, ctx, {
        type: "checkpoint.state_changed",
        entityType: "checkpoint_status",
        entityId: auditKey(row),
        payload: { projectId, orgUnitId: row.orgUnitId, moduleId: row.moduleId, checkpoint: row.checkpoint.name, from: row.state, to: "Done", gateOverridden: kind === "approve_exception" },
      });
    }
    await cascadeTx(tx, ctx, projectId, checkpoints, row.checkpointId, scopeOf(row));
    return { statusId: row.id, approval };
  });
}

/** Send a submitted gate back to the PM with a required reason. `state` is left alone. */
export async function returnGate(ctx: TenantContext, projectId: string, statusId: string, raw: z.input<typeof ReturnInput>): Promise<{ statusId: string; approval: GateApproval }> {
  const input = ReturnInput.parse(raw);
  return withTenant(ctx, async (tx) => {
    const row = await loadRow(tx, projectId, statusId);
    const f = await decisionFacts(tx, row);
    assertDecision("return", row, f, ctx, input.note);
    await tx.checkpointStatus.update({ where: { id: row.id }, data: { approval: "returned", decidedById: ctx.userId, decidedAt: new Date(), decisionNote: input.note } });
    await audit(tx, ctx, {
      action: "gate.return",
      entityType: "checkpoint_status",
      entityId: auditKey(row),
      before: { approval: row.approval, state: row.state, submittedById: row.submittedById },
      after: { approval: "returned", state: row.state, statusId: row.id, checkpoint: row.checkpoint.name, decisionNote: input.note, ...(row.orgUnitId ? { orgUnitId: row.orgUnitId } : {}) },
    });
    await notifyDecisionTx(tx, ctx, { projectId, checkpointName: row.checkpoint.name, unitScope: scopeOf(row), statusId: row.id, submittedById: row.submittedById, kind: "returned", note: input.note });
    return { statusId: row.id, approval: "returned" as const };
  });
}

// ── Reads ──────────────────────────────────────────────────────────────────────


/** Who the queue is for: gates waiting on this approver, or the PM's own (submitted + returned). */
export type GateQueueLens = "approver" | "mine";

/**
 * Gates in the sign-off workflow the viewer should see.
 *  - "approver": submitted gates this person may sign off — any for Head / Super Admin,
 *    testing gates for Head of QA, none for anyone else — minus the ones they submitted
 *    themselves (four-eyes: they could not act on them).
 *  - "mine": submitted and returned gates on projects the viewer runs.
 * Oldest submission first.
 */
export async function listGateQueue(ctx: TenantContext, lens: GateQueueLens): Promise<GateQueueItem[]> {
  const scope = approverScope(ctx.roles);
  if (lens === "approver" && scope === "none") return [];
  return withTenant(ctx, async (tx) => {
    const rows = await tx.checkpointStatus.findMany({
      where:
        lens === "approver"
          ? { approval: "submitted", project: { status: { notIn: ["Completed", "Cancelled"] } } }
          : { approval: { in: ["submitted", "returned"] }, project: { status: { notIn: ["Completed", "Cancelled"] }, ...runsProjectWhere(ctx.userId) } },
      select: {
        ...ROW_SELECT,
        orgUnit: { select: { name: true } },
        module: { select: { name: true } },
        project: { select: { code: true, name: true, ...PM_SELECT } },
      },
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      take: 500,
    });
    const visible = rows.filter((r) => {
      if (lens !== "approver") return true;
      const testing = isTestingCheckpoint(r.checkpoint);
      return canApproveGate(ctx.roles, testing) && r.submittedById !== ctx.userId;
    });
    const userIds = [...new Set(visible.flatMap((r) => [r.submittedById, r.decidedById, pmIdsOf(r.project)[0] ?? null]).filter((x): x is string => Boolean(x)))];
    const names = new Map(userIds.length ? (await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]) : []);
    return visible.map((r): GateQueueItem => {
      const testing = isTestingCheckpoint(r.checkpoint);
      const pmId = pmIdsOf(r.project)[0] ?? null;
      const approval = parseApproval(r.approval);
      return {
        statusId: r.id,
        projectId: r.projectId,
        projectCode: r.project.code,
        projectName: r.project.name,
        checkpointId: r.checkpointId,
        gateName: r.checkpoint.name,
        testing,
        orgUnitId: r.orgUnitId,
        marketName: r.orgUnit?.name ?? null,
        moduleName: r.module?.name ?? null,
        approval,
        state: r.state as CheckpointState,
        submittedAt: r.submittedAt?.toISOString() ?? null,
        submittedById: r.submittedById,
        submittedByName: r.submittedById ? (names.get(r.submittedById) ?? null) : null,
        pmName: pmId ? (names.get(pmId) ?? null) : null,
        source: r.source,
        decidedAt: r.decidedAt?.toISOString() ?? null,
        decidedByName: r.decidedById ? (names.get(r.decidedById) ?? null) : null,
        decisionNote: r.decisionNote,
        canDecide: approval === "submitted" && canApproveGate(ctx.roles, testing) && r.submittedById !== ctx.userId,
      };
    });
  });
}

/** Count for KPIs and the Brief (approver lens). */
export async function countGatesWaiting(ctx: TenantContext): Promise<{ total: number; testing: number; oldestAt: string | null }> {
  const items = await listGateQueue(ctx, "approver");
  return { total: items.length, testing: items.filter((i) => i.testing).length, oldestAt: items[0]?.submittedAt ?? null };
}

export interface GateReview {
  item: GateQueueItem;
  checklist: GateRule[];
  unmet: number;
  /** Testing gates: open critical issues (the Quality home rule), capped list + total. */
  critical: { total: number; items: { id: string; kind: "bug" | "issue"; title: string; owner: string | null; href: string }[] } | null;
  coveragePct: number | null;
  /** Derived % of this track (Done 1, In progress ½). */
  progress: number | null;
  /** The project's reported status this week (Green/Amber/Red), null if not reported. */
  reported: string | null;
  earlierDone: number;
  earlierTotal: number;
  stageIndex: number;
  stageCount: number;
  evidence: { id: string; title: string; kind: string; status: string }[];
  exceptionAllowed: boolean;
  /** Four-eyes: the viewer submitted it (so may not decide it). */
  viewerSubmitted: boolean;
}

/** Everything the review drawer shows for one gate (drawer 13 / 14). Readable by the project's
 * PM (their own submission) and by approvers; `item.canDecide` says who may act. */
export async function getGateReview(ctx: TenantContext, projectId: string, statusId: string): Promise<GateReview> {
  return withTenant(ctx, async (tx) => {
    const r = await tx.checkpointStatus.findUnique({
      where: { id: statusId },
      select: { ...ROW_SELECT, orgUnit: { select: { name: true } }, module: { select: { name: true } }, project: { select: { code: true, name: true, ...PM_SELECT } } },
    });
    if (!r || r.projectId !== projectId) throw new GateApprovalError("Gate not found.", "NOT_FOUND");
    const testing = isTestingCheckpoint(r.checkpoint);
    const pmId = pmIdsOf(r.project)[0] ?? null;
    const [gate, critical, facts, checkpoints, trackRows, docs, checkIn] = await Promise.all([
      evaluateGate(tx, projectId, r.checkpoint.name),
      testing ? openCriticalForProject(tx, projectId, 10) : Promise.resolve(null),
      gatherFacts(tx, projectId),
      trackCheckpoints(tx, projectId, r.moduleId),
      tx.checkpointStatus.findMany({ where: { projectId, orgUnitId: r.orgUnitId, moduleId: r.moduleId }, select: { checkpointId: true, state: true } }),
      tx.projectDocument.findMany({
        where: { projectId, supersededBy: { none: {} } },
        select: { id: true, title: true, kind: true, status: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      tx.checkIn.findFirst({ where: { projectId, status: "Confirmed" }, orderBy: { isoWeek: "desc" }, select: { computedRag: true, ragOverride: true } }),
    ]);
    const userIds = [r.submittedById, r.decidedById, pmId].filter((x): x is string => Boolean(x));
    const names = new Map(userIds.length ? (await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]) : []);
    const stateOf = new Map(trackRows.map((t) => [t.checkpointId, t.state as CheckpointState]));
    const earlier = checkpoints.filter((c) => c.orderIndex < r.checkpoint.orderIndex);
    const approval = parseApproval(r.approval);
    const item: GateQueueItem = {
      statusId: r.id,
      projectId,
      projectCode: r.project.code,
      projectName: r.project.name,
      checkpointId: r.checkpointId,
      gateName: r.checkpoint.name,
      testing,
      orgUnitId: r.orgUnitId,
      marketName: r.orgUnit?.name ?? null,
      moduleName: r.module?.name ?? null,
      approval,
      state: r.state as CheckpointState,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      submittedById: r.submittedById,
      submittedByName: r.submittedById ? (names.get(r.submittedById) ?? null) : null,
      pmName: pmId ? (names.get(pmId) ?? null) : null,
      source: r.source,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      decidedByName: r.decidedById ? (names.get(r.decidedById) ?? null) : null,
      decisionNote: r.decisionNote,
      canDecide: approval === "submitted" && canApproveGate(ctx.roles, testing) && r.submittedById !== ctx.userId,
    };
    const criticalOpen = critical?.total ?? 0;
    return {
      item,
      checklist: gate.rules,
      unmet: gate.unmet.length,
      critical: critical
        ? {
            total: critical.total,
            items: critical.items.map((c) => ({ id: c.id, kind: c.kind, title: c.title, owner: c.owner, href: c.kind === "bug" ? `/projects/${projectId}?tab=Board&task=${c.id}` : `/projects/${projectId}?tab=Register` })),
          }
        : null,
      coveragePct: facts.requirements ? facts.coveragePct : null,
      progress: checkpoints.length ? derivedProgress(checkpoints.map((c) => stateOf.get(c.id) ?? "NotStarted")) : null,
      reported: checkIn ? (checkIn.ragOverride ?? checkIn.computedRag) : null,
      earlierDone: earlier.filter((c) => stateOf.get(c.id) === "Done").length,
      earlierTotal: earlier.length,
      stageIndex: checkpoints.findIndex((c) => c.id === r.checkpointId) + 1,
      stageCount: checkpoints.length,
      evidence: docs,
      exceptionAllowed: exceptionAllowed({ unmet: gate.unmet.length, criticalOpen, testing }),
      viewerSubmitted: r.submittedById === ctx.userId,
    };
  });
}
