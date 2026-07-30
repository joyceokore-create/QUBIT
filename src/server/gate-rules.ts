import type { Prisma } from "@prisma/client";

/**
 * Gate checklists (docs/16 §6). Closing a delivery checkpoint is a governance moment,
 * not a checkbox: QUBIT states what the gate requires, checks what it can from live
 * data, and — per §6 — **soft-blocks**. The gate can still be closed, but only with a
 * written reason that is recorded on the row and audited. Hard rules can come later.
 *
 * Rules are keyed off the CHECKPOINT NAME, because checkpoints are per-template data
 * (docs/18 §2): a template nobody has written rules for simply has none, and its gates
 * close freely. A rule is only written once the data behind it exists — an unenforceable
 * rule that always passes is worse than no rule.
 */

/** Requirement coverage the pilot gate demands (docs/16 §6 "≥ threshold"). */
export const COVERAGE_THRESHOLD_PCT = 80;

export interface GateRule {
  key: string;
  /** What the gate asks of the team, in plain language. */
  label: string;
  met: boolean;
  /** Why it isn't met yet — shown next to the requirement. */
  detail: string | null;
}

export interface GateEvaluation {
  checkpointName: string;
  rules: GateRule[];
  unmet: GateRule[];
}

/** Facts every rule reads. Gathered once so a gate check is a single round trip. */
interface GateFacts {
  hasLead: boolean;
  memberCount: number;
  publishedTasks: number;
  milestones: number;
  openCriticalBugs: number;
  approvedBrds: number;
  approvedHandovers: number;
  lessons: number;
  requirements: number;
  coveragePct: number;
}

/**
 * Which rules apply to which gate. Matching is on the lowercased checkpoint name so the
 * two seeded templates (docs/18 §2) and any admin-authored one share the vocabulary.
 */
const RULES: { match: (name: string) => boolean; build: (f: GateFacts) => GateRule[] }[] = [
  {
    // "BRD" / "Business Case" — the gate into planning.
    match: (n) => n.includes("brd") || n.includes("business case"),
    build: (f) => [
      {
        key: "brd-approved",
        label: "An approved BRD or business case in the document register",
        met: f.approvedBrds > 0,
        detail: f.approvedBrds > 0 ? null : "No BRD in the register has been approved yet.",
      },
      {
        key: "team-allocated",
        label: "A project lead and at least one allocated member",
        met: f.hasLead && f.memberCount > 0,
        detail: !f.hasLead ? "No project lead set." : f.memberCount === 0 ? "No members allocated." : null,
      },
    ],
  },
  {
    // "MVP1" / "Solution Build" — the gate into execution.
    match: (n) => n.includes("mvp") || n.includes("solution build"),
    build: (f) => [
      {
        key: "plan-published",
        label: "A published plan — tasks and milestones exist",
        met: f.publishedTasks > 0 && f.milestones > 0,
        detail:
          f.publishedTasks === 0
            ? "No published tasks yet."
            : f.milestones === 0
              ? "No milestones yet."
              : null,
      },
    ],
  },
  {
    // "UAT" / "SIT" / "Testing" / "GTM/Pilot" — the gate into pilot.
    match: (n) => n.includes("uat") || n.includes("sit") || n.includes("testing") || n.includes("pilot"),
    build: (f) => [
      {
        key: "no-critical-bugs",
        label: "No open Critical bugs",
        met: f.openCriticalBugs === 0,
        detail: f.openCriticalBugs === 0 ? null : `${f.openCriticalBugs} Critical bug(s) still open.`,
      },
      // M8-C requirement coverage (docs/16 §6). A project that captured NO requirements
      // has nothing to cover, so the rule passes — the gate asks about coverage, not
      // about whether the team uses requirements at all.
      {
        key: "requirement-coverage",
        label: `Requirement coverage at or above ${COVERAGE_THRESHOLD_PCT}%`,
        met: f.requirements === 0 || f.coveragePct >= COVERAGE_THRESHOLD_PCT,
        detail:
          f.requirements === 0 || f.coveragePct >= COVERAGE_THRESHOLD_PCT
            ? null
            : `${f.coveragePct}% of ${f.requirements} requirements have a covering task.`,
      },
    ],
  },
  {
    // "Go-Live" / "Rollout" — the gate into closure.
    match: (n) => n.includes("go-live") || n.includes("go live") || n.includes("rollout") || n.includes("closure"),
    build: (f) => [
      {
        key: "lessons-captured",
        label: "Lessons learned captured",
        met: f.lessons > 0,
        detail: f.lessons > 0 ? null : "No lessons recorded for this project yet.",
      },
      {
        key: "handover-approved",
        label: "An approved handover document",
        met: f.approvedHandovers > 0,
        detail: f.approvedHandovers > 0 ? null : "No handover document has been approved yet.",
      },
    ],
  },
];

async function gatherFacts(tx: Prisma.TransactionClient, projectId: string): Promise<GateFacts> {
  const [project, memberCount, publishedTasks, milestones, openCriticalBugs, documents, lessons, requirements] = await Promise.all([
    tx.project.findUnique({ where: { id: projectId }, select: { leadUserId: true } }),
    tx.projectMember.count({ where: { projectId } }),
    tx.projectTask.count({ where: { projectId, approvalStatus: { not: "Draft" } } }),
    tx.projectMilestone.count({ where: { projectId } }),
    tx.projectTask.count({
      where: { projectId, type: "Bug", severity: "Critical", status: { not: "Completed" }, approvalStatus: { not: "Draft" } },
    }),
    // M8-B: "approved" now means the review workflow said so (docs/16 §6), and the
    // register has real Handover/Signoff types instead of a title convention.
    tx.projectDocument.findMany({ where: { projectId, status: "Approved" }, select: { kind: true, title: true } }),
    tx.lessonLearned.count({ where: { projectId } }),
    // M8-C traceability: a requirement is covered by at least one PUBLISHED task.
    tx.requirement.findMany({
      where: { projectId, status: "Accepted" },
      select: { taskLinks: { select: { task: { select: { approvalStatus: true } } } } },
    }),
  ]);
  const coveredReqs = requirements.filter((r) => r.taskLinks.some((l) => l.task.approvalStatus !== "Draft")).length;
  const approvedTitles = documents.map((d) => `${d.kind} ${d.title}`.toLowerCase());
  return {
    hasLead: !!project?.leadUserId,
    memberCount,
    publishedTasks,
    milestones,
    openCriticalBugs,
    approvedBrds: documents.filter((d) => d.kind === "BRD").length,
    // Since M8-B the register has a real Handover kind; the title fallback stays for
    // documents filed before those types existed.
    approvedHandovers: documents.filter((d) => d.kind === "Handover").length + approvedTitles.filter((t) => t.includes("handover")).length,
    lessons,
    requirements: requirements.length,
    coveragePct: requirements.length ? Math.round((coveredReqs / requirements.length) * 100) : 0,
  };
}

/** Evaluate the gate for one checkpoint. Empty rules = nothing to check, gate is open. */
export async function evaluateGate(
  tx: Prisma.TransactionClient,
  projectId: string,
  checkpointName: string,
): Promise<GateEvaluation> {
  const name = checkpointName.toLowerCase();
  const matched = RULES.filter((r) => r.match(name));
  if (!matched.length) return { checkpointName, rules: [], unmet: [] };

  const facts = await gatherFacts(tx, projectId);
  const rules = matched.flatMap((r) => r.build(facts));
  return { checkpointName, rules, unmet: rules.filter((r) => !r.met) };
}
