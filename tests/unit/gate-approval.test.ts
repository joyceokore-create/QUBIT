// WS1 (UX fidelity Tier 4) — gate sign-off, the pure rules: which gates need a sign-off,
// who approves which gates, four-eyes, the exception and reason rules, and the cascade that
// stops at a sign-off gate. Also the upload plan (status-report delivery) and the Brief lines.
import { describe, expect, it } from "vitest";
import {
  approvalChip,
  approverRolesFor,
  approverScope,
  canApproveGate,
  cascadePlan,
  checkDecision,
  exceptionAllowed,
  parseApproval,
  requiresSignOff,
  type DecisionFacts,
} from "@/lib/gate-approval";
import { resolveDelivery, type DeliveryCatalog } from "@/lib/status-report-delivery";
import { gateItems, buildBrief } from "@/lib/daily-brief";

describe("which gates need a sign-off", () => {
  it("defaults to Go-Live, SIT exit and UAT exit by name", () => {
    for (const name of ["Go-Live", "Go live", "go-live readiness", "SIT", "UAT", "SIT exit", "UAT Exit", "UAT exit (Kenya)"]) expect(requiresSignOff({ name }), name).toBe(true);
    for (const name of ["BRD", "Prototype", "MVP1", "SIT entry", "UAT entry", "Testing", "Rollout", "GTM/Pilot", "Business Case"]) expect(requiresSignOff({ name }), name).toBe(false);
  });
  it("lets the checkpoint's own flag win either way", () => {
    expect(requiresSignOff({ name: "BRD", requiresApproval: true })).toBe(true);
    expect(requiresSignOff({ name: "Go-Live", requiresApproval: false })).toBe(false);
    expect(requiresSignOff({ name: "Go-Live", requiresApproval: null })).toBe(true);
  });
});

describe("who approves", () => {
  it("Head and Super Admin any gate, Head of QA testing gates only, Executives and PMs never", () => {
    expect(approverScope(["HeadOfProjects"])).toBe("all");
    expect(approverScope(["PlatformSuperAdmin"])).toBe("all");
    expect(approverScope(["HeadOfQA"])).toBe("testing");
    expect(approverScope(["Executive"])).toBe("none");
    expect(approverScope(["ProjectManager"])).toBe("none");
    expect(approverScope(["Member"])).toBe("none");
    expect(approverScope(["HeadOfQA", "HeadOfProjects"])).toBe("all"); // widest wins
    expect(canApproveGate(["HeadOfQA"], true)).toBe(true);
    expect(canApproveGate(["HeadOfQA"], false)).toBe(false);
    expect(canApproveGate(["Executive"], true)).toBe(false);
    expect(canApproveGate(["HeadOfProjects"], false)).toBe(true);
  });
  it("notifies Heads for any gate, and Head of QA too for a testing gate", () => {
    expect(approverRolesFor(false)).toEqual(["HeadOfProjects"]);
    expect(approverRolesFor(true)).toEqual(["HeadOfProjects", "HeadOfQA"]);
  });
});

describe("the decision rule", () => {
  const head = { userId: "u_head", roles: ["HeadOfProjects"] };
  const hqa = { userId: "u_hqa", roles: ["HeadOfQA"] };
  const facts = (o: Partial<DecisionFacts> = {}): DecisionFacts => ({ approval: "submitted", submittedById: "u_pm", testing: false, unmet: 0, criticalOpen: 0, ...o });

  it("approves a clean submitted gate", () => {
    expect(checkDecision("approve", facts(), head, null)).toBeNull();
    expect(checkDecision("approve", facts({ testing: true }), hqa, undefined)).toBeNull();
  });
  it("refuses a gate that is not waiting", () => {
    for (const a of ["none", "approved", "returned", "approved_with_exception"] as const) expect(checkDecision("approve", facts({ approval: a }), head, null)?.code).toBe("NOT_SUBMITTED");
  });
  it("enforces approver scope", () => {
    expect(checkDecision("approve", facts(), hqa, null)?.code).toBe("NOT_APPROVER");
    expect(checkDecision("return", facts(), { userId: "u_ex", roles: ["Executive"] }, "Not yet please")?.code).toBe("NOT_APPROVER");
  });
  it("four-eyes: nobody decides a gate they submitted", () => {
    expect(checkDecision("approve", facts({ submittedById: "u_head" }), head, null)?.code).toBe("FOUR_EYES");
    expect(checkDecision("return", facts({ submittedById: "u_head" }), head, "Some reason")?.code).toBe("FOUR_EYES");
  });
  it("return needs a reason", () => {
    expect(checkDecision("return", facts(), head, "  no ")?.code).toBe("NOTE_REQUIRED");
    expect(checkDecision("return", facts(), head, "Rollback plan missing")).toBeNull();
  });
  it("an unmet checklist needs an exception with a reason; a met one allows no exception", () => {
    expect(checkDecision("approve", facts({ unmet: 1 }), head, null)?.code).toBe("NEEDS_EXCEPTION");
    expect(checkDecision("approve_exception", facts({ unmet: 1 }), head, null)?.code).toBe("NOTE_REQUIRED");
    expect(checkDecision("approve_exception", facts({ unmet: 1 }), head, "Client signed off by email")).toBeNull();
    expect(checkDecision("approve_exception", facts(), head, "Why not")?.code).toBe("NO_EXCEPTION");
  });
  it("open critical issues count for testing gates only", () => {
    expect(exceptionAllowed({ unmet: 0, criticalOpen: 2, testing: true })).toBe(true);
    expect(exceptionAllowed({ unmet: 0, criticalOpen: 2, testing: false })).toBe(false);
    expect(checkDecision("approve", facts({ testing: true, criticalOpen: 2 }), hqa, null)?.code).toBe("NEEDS_EXCEPTION");
    expect(checkDecision("approve_exception", facts({ testing: true, criticalOpen: 2 }), hqa, "Known issue, fix in hypercare")).toBeNull();
    expect(checkDecision("approve", facts({ criticalOpen: 2 }), head, null)).toBeNull();
  });
});

describe("the cascade stops at a sign-off gate", () => {
  const rows = (states: string[], signOff: boolean[], approval: string[] = []) =>
    states.map((state, i) => ({ checkpointId: `g${i}`, orderIndex: i, state, signOff: signOff[i] ?? false, approval: approval[i] ?? "none" }));
  //            BRD           Proto         MVP1          SIT (sign-off)  UAT (sign-off) Go-Live (sign-off)
  const so = [false, false, false, true, true, true];

  it("closes open earlier gates when none is a sign-off gate", () => {
    expect(cascadePlan(rows(["NotStarted", "InProgress", "Done"], [false, false, false]), "g2")).toEqual({ close: ["g1", "g0"], submit: null });
  });
  it("submits the first open sign-off gate behind and stops there", () => {
    const r = rows(["NotStarted", "NotStarted", "InProgress", "InProgress", "NotStarted", "NotStarted"], so);
    // Hypothetical gate 6 done (after Go-Live): Go-Live is submitted, nothing before it closes.
    expect(cascadePlan([...r, { checkpointId: "g6", orderIndex: 6, state: "Done", signOff: false, approval: "none" }], "g6")).toEqual({ close: [], submit: "g5" });
    // UAT approved → SIT (open, sign-off) is submitted; BRD..MVP1 stay.
    expect(cascadePlan(r, "g4")).toEqual({ close: [], submit: "g3" });
    // SIT approved → MVP1, Proto, BRD close.
    expect(cascadePlan(r, "g3")).toEqual({ close: ["g2", "g1", "g0"], submit: null });
  });
  it("leaves Done and Blocked gates alone and doesn't resubmit a gate already waiting", () => {
    const r = rows(["NotStarted", "Blocked", "Done", "InProgress", "Done", "NotStarted"], so, ["none", "none", "none", "submitted"]);
    expect(cascadePlan(r, "g4")).toEqual({ close: [], submit: null });
    const done = rows(["NotStarted", "Blocked", "InProgress", "Done", "NotStarted", "NotStarted"], so);
    expect(cascadePlan(done, "g4")).toEqual({ close: ["g2", "g0"], submit: null });
  });
});

describe("labels", () => {
  it("parses unknown values as none and words chips in sentence case", () => {
    expect(parseApproval("bogus")).toBe("none");
    expect(parseApproval(null)).toBe("none");
    expect(approvalChip("submitted")).toEqual({ tone: "info", label: "Submitted" });
    expect(approvalChip("submitted", 0)).toEqual({ tone: "info", label: "New" });
    expect(approvalChip("submitted", 2)).toEqual({ tone: "warn", label: "Waiting" });
    expect(approvalChip("submitted", 4)).toEqual({ tone: "bad", label: "Overdue" });
    expect(approvalChip("returned").label).toBe("Returned");
    expect(approvalChip("approved_with_exception").label).toBe("Approved with exception");
  });
});

describe("status-report upload plan (WS1)", () => {
  const catalog: DeliveryCatalog = {
    projectId: "p1",
    code: "P1",
    name: "Project p1",
    moduleLabel: "Modules",
    templateName: "Product build",
    markets: [],
    modules: [],
    gates: [
      { checkpointId: "brd", name: "BRD", orderIndex: 0, signOff: false },
      { checkpointId: "mvp", name: "MVP1", orderIndex: 1, signOff: false },
      { checkpointId: "sit", name: "SIT", orderIndex: 2, signOff: true },
      { checkpointId: "uat", name: "UAT", orderIndex: 3, signOff: true },
      { checkpointId: "live", name: "Go-Live", orderIndex: 4, signOff: true },
    ],
    gateStates: [],
    moduleStates: [],
  };
  const plan = (stage: string, c = catalog) => resolveDelivery({ project: "Project p1", stage, gates: [], cells: [] }, c);
  const pairs = (p: ReturnType<typeof plan>) => p.gates.map((g) => `${g.name}:${g.to}${g.signOff ? ":sign-off" : ""}`);

  it("a stage on a later gate closes earlier gates up to the first sign-off gate, which is submitted", () => {
    // "UAT in progress" — SIT (sign-off) behind it is submitted; BRD and MVP1 stay as they are.
    expect(pairs(plan("UAT in progress"))).toEqual(["SIT:Done:sign-off", "UAT:InProgress"]);
    // "MVP1 in progress" — no sign-off gate behind: BRD closes as before.
    expect(pairs(plan("MVP1 in progress"))).toEqual(["BRD:Done", "MVP1:InProgress"]);
  });
  it("a sign-off gate the report calls done is submitted and cascades nothing", () => {
    expect(pairs(plan("Production (build complete)"))).toEqual(["Go-Live:Done:sign-off"]);
  });
  it("a gate already waiting for sign-off is not proposed again", () => {
    const waiting = { ...catalog, gateStates: [{ orgUnitId: null, checkpointId: "sit", state: "InProgress" as const, approval: "submitted" }] };
    expect(pairs(plan("UAT in progress", waiting))).toEqual(["UAT:InProgress"]);
  });
});

describe("Brief lines (WS1)", () => {
  const now = new Date("2026-11-12T09:00:00Z");
  const base = { role: "HeadOfProjects" as const, viewerId: "u", now, timeZone: "UTC", projects: [] };
  it("tells an approver how many gates wait on them", () => {
    const items = gateItems({ ...base, extras: { gatesWaiting: { count: 2, oldestAt: new Date("2026-11-09T09:00:00Z"), names: ["Project a · Go-Live", "Project b · UAT"] } } });
    expect(items).toEqual([
      expect.objectContaining({ group: "wait", emphasis: "2 gates are waiting on your sign-off.", detail: "Project a · Go-Live and Project b · UAT. The oldest has waited 3 days.", action: { label: "Review Gates", href: "/approvals?tab=gates" } }),
    ]);
    expect(gateItems({ ...base, extras: { gatesWaiting: { count: 0, oldestAt: null, names: [] } } })).toEqual([]);
  });
  it("tells the PM a gate was returned, with the reason", () => {
    const brief = buildBrief({ ...base, role: "ProjectManager", extras: { gatesReturned: [{ statusId: "s1", projectId: "p1", projectName: "Project p1", gateName: "UAT", note: "Rollback plan missing." }] } });
    expect(brief.items[0]).toMatchObject({ group: "now", emphasis: "UAT on Project p1 was returned: Rollback plan missing.", action: { label: "Open Gate", href: "/projects/p1?tab=Delivery" } });
  });
});
