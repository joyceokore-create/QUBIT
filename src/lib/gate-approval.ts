import { reasonMessage } from "@/lib/reason-schema";
import { gateKeyOf } from "@/lib/cockpit-gates";

/**
 * WS1 (UX fidelity Tier 4) — gate sign-off, the pure part. Client-safe. Spec:
 * mwashukes-desk/plans/ws1-ws2-proposals.md § WS1, every default taken:
 *  - sign-off gates: Go-Live, SIT exit, UAT exit (a checkpoint's own `requiresApproval` flag
 *    wins when an admin has set it; NULL = the name decides);
 *  - approvers: Head of Projects and Super Admin (any gate), Head of QA (testing gates only),
 *    Executives never (D10);
 *  - four-eyes: nobody approves a gate they submitted;
 *  - approve with exception only when there is something to except (the checklist is unmet,
 *    or — for a testing gate — critical issues are open), and always with a reason;
 *  - the cascade (a later gate Done closes the earlier ones) stops at a sign-off gate, which
 *    is submitted instead of closed.
 */

export const GATE_APPROVALS = ["none", "submitted", "approved", "approved_with_exception", "returned"] as const;
export type GateApproval = (typeof GATE_APPROVALS)[number];

/** Sentence-case status chip words (D-F2b: chips are sentence case). */
export const GATE_APPROVAL_LABEL: Record<GateApproval, string> = {
  none: "Not submitted",
  submitted: "Submitted",
  approved: "Approved",
  approved_with_exception: "Approved with exception",
  returned: "Returned",
};

export function parseApproval(raw: string | null | undefined): GateApproval {
  return (GATE_APPROVALS as readonly string[]).includes(raw ?? "") ? (raw as GateApproval) : "none";
}

/** Reasons (return, exception) — the same bounds the routes validate with Zod. */
export const DECISION_NOTE_MIN = 5;
export const DECISION_NOTE_MAX = 500;

const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Does closing this gate need a sign-off? The checkpoint's own flag wins (true or false);
 * while it is unset the name decides: Go-Live, and the EXIT of SIT and UAT. A template gate
 * named just "SIT" / "UAT" (the "Product build" template) is the stage — done means exited —
 * so it is a sign-off gate; "SIT entry" / "UAT entry" are not.
 */
export function requiresSignOff(c: { name: string; requiresApproval?: boolean | null }): boolean {
  if (c.requiresApproval === true || c.requiresApproval === false) return c.requiresApproval;
  const key = gateKeyOf(c.name);
  if (key === "golive" || key === "sit" || key === "uat") return true;
  const n = ` ${fold(c.name)} `;
  if (/ go ?live /.test(n)) return true;
  const testingStage = / (sit|uat) /.test(n);
  return testingStage && / exit /.test(n);
}

/** Which gates a person may sign off. A person with several roles gets the widest scope. */
export type ApproverScope = "all" | "testing" | "none";
export function approverScope(roles: readonly string[]): ApproverScope {
  if (roles.includes("PlatformSuperAdmin") || roles.includes("HeadOfProjects")) return "all";
  if (roles.includes("HeadOfQA")) return "testing";
  return "none"; // Executives, PMs, members: never (D10)
}
export function canApproveGate(roles: readonly string[], testing: boolean): boolean {
  const s = approverScope(roles);
  return s === "all" || (s === "testing" && testing);
}

/** The role names notified when a gate of this kind is submitted (Super Admin is an
 * approver of last resort and is not paged for every gate). */
export function approverRolesFor(testing: boolean): string[] {
  return testing ? ["HeadOfProjects", "HeadOfQA"] : ["HeadOfProjects"];
}

/** Facts a decision is checked against. */
export interface DecisionFacts {
  approval: GateApproval;
  submittedById: string | null;
  testing: boolean;
  /** Unmet checklist items (evaluateGate). */
  unmet: number;
  /** Open critical issues — counted for testing gates only. */
  criticalOpen: number;
}

export type DecisionKind = "approve" | "approve_exception" | "return";

export type DecisionError =
  | { code: "NOT_SUBMITTED"; message: string }
  | { code: "NOT_APPROVER"; message: string }
  | { code: "FOUR_EYES"; message: string }
  | { code: "NEEDS_EXCEPTION"; message: string }
  | { code: "NO_EXCEPTION"; message: string }
  | { code: "NOTE_REQUIRED"; message: string };

/** Is there something an approval would have to except? */
export function exceptionAllowed(f: Pick<DecisionFacts, "unmet" | "criticalOpen" | "testing">): boolean {
  return f.unmet > 0 || (f.testing && f.criticalOpen > 0);
}

/** The engine's decision rule, pure: null = allowed. */
export function checkDecision(
  kind: DecisionKind,
  f: DecisionFacts,
  actor: { userId: string; roles: readonly string[] },
  note: string | null | undefined,
): DecisionError | null {
  if (f.approval !== "submitted") return { code: "NOT_SUBMITTED", message: "This gate is not waiting for sign-off." };
  if (!canApproveGate(actor.roles, f.testing)) {
    return {
      code: "NOT_APPROVER",
      message: approverScope(actor.roles) === "testing" ? "Head of QA signs off testing gates only." : "Only a Head (or Head of QA, for testing gates) signs off gates.",
    };
  }
  if (f.submittedById && f.submittedById === actor.userId) return { code: "FOUR_EYES", message: "You submitted this gate, so someone else signs it off." };
  const hasNote = (note ?? "").trim().length >= DECISION_NOTE_MIN;
  if (kind === "return") return hasNote ? null : { code: "NOTE_REQUIRED", message: reasonMessage(DECISION_NOTE_MIN) };
  const except = exceptionAllowed(f);
  if (kind === "approve" && except) {
    return { code: "NEEDS_EXCEPTION", message: f.testing && f.criticalOpen > 0 ? "Critical issues are open — sign off with exception and say why." : "The checklist is not met — approve with exception and say why." };
  }
  if (kind === "approve_exception") {
    if (!except) return { code: "NO_EXCEPTION", message: "Nothing to except: the checklist is met." };
    if (!hasNote) return { code: "NOTE_REQUIRED", message: reasonMessage(DECISION_NOTE_MIN) };
  }
  return null;
}

/**
 * The cascade, pure: after `checkpointId` is set Done on a track, which earlier gates close
 * and which sign-off gate is submitted. Walks back from the gate: Done and Blocked gates are
 * left alone; an open sign-off gate is submitted (unless it is already waiting) and the
 * cascade stops there; any other open gate closes.
 */
export function cascadePlan(
  rows: { checkpointId: string; orderIndex: number; state: string; signOff: boolean; approval?: string }[],
  checkpointId: string,
): { close: string[]; submit: string | null } {
  const me = rows.find((r) => r.checkpointId === checkpointId);
  if (!me) return { close: [], submit: null };
  const earlier = rows.filter((r) => r.orderIndex < me.orderIndex).sort((a, b) => b.orderIndex - a.orderIndex);
  const close: string[] = [];
  for (const r of earlier) {
    if (r.state === "Done" || r.state === "Blocked") continue;
    if (r.signOff) return { close, submit: r.approval === "submitted" ? null : r.checkpointId };
    close.push(r.checkpointId);
  }
  return { close, submit: null };
}

/** The row's chip: tone + sentence-case word, for lists and the gate drawer. */
export function approvalChip(a: GateApproval, waitingDays?: number): { tone: "ok" | "warn" | "bad" | "info" | "muted"; label: string } {
  switch (a) {
    case "submitted":
      // In a queue (with an age): New / Waiting / Overdue, as the design's Approvals rows. On
      // the gate itself (no age): Submitted.
      if (waitingDays === undefined) return { tone: "info", label: "Submitted" };
      return waitingDays >= 3 ? { tone: "bad", label: "Overdue" } : waitingDays === 0 ? { tone: "info", label: "New" } : { tone: "warn", label: "Waiting" };
    case "approved":
      return { tone: "ok", label: "Approved" };
    case "approved_with_exception":
      return { tone: "warn", label: "Approved with exception" };
    case "returned":
      return { tone: "bad", label: "Returned" };
    default:
      return { tone: "muted", label: "Not submitted" };
  }
}

/** One gate in the sign-off workflow, as the Approvals page, the homes and the Brief list it. */
export interface GateQueueItem {
  statusId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  checkpointId: string;
  gateName: string;
  testing: boolean;
  orgUnitId: string | null;
  marketName: string | null;
  moduleName: string | null;
  approval: GateApproval;
  state: "NotStarted" | "InProgress" | "Done" | "Blocked";
  /** ISO timestamps (JSON-safe for client components). */
  submittedAt: string | null;
  submittedById: string | null;
  submittedByName: string | null;
  pmName: string | null;
  /** The upload that submitted it, when a machine path did. */
  source: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionNote: string | null;
  /** May the viewer approve / return it (approver scope + four-eyes)? */
  canDecide: boolean;
}
