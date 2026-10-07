// Milestone D — the print templates are pure functions of their read model. Three things
// matter enough to pin: user text is escaped, nothing in a document can reach the network
// (the renderer aborts every request, but a template must never try), and the inlined logo
// stays in step with the asset file.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QUBIT_LOGO_SVG } from "@/server/pdf/brand";
import { dimensionCards, pickDecision, pickTemplate, pickTopRisk, type DigestReportData, type ProjectReportData } from "@/server/pdf/report-data";
import { renderDigest, renderProjectReport } from "@/server/pdf/templates";

const now = new Date("2026-10-09T10:00:00Z");

function project(over: Partial<ProjectReportData> = {}): ProjectReportData {
  return {
    tenantName: "Demo Org B",
    brandColor: "#1B7A3E",
    template: "build",
    week: { isoWeek: "2026-W41", number: "41", range: "5–9 Oct", isCurrent: true, generatedAt: now },
    project: { id: "p1", code: "ATLAS", name: "Atlas <migration>", summary: "Objective & scope", pmName: "PM One", sponsor: null, portfolioName: "Alpha", programmeName: null, pipelineStage: "Approved", dueDate: null },
    checkIn: { status: "Confirmed", confirmedByName: "PM One", confirmedAt: now, narrative: "Line with <b>markup</b>", lines: ["3 tasks completed this week"], buildRag: "Amber", marketRag: null, overallRag: "Amber", overrideReason: null },
    dims: [
      { key: "Schedule", rag: "G", line: "No overdue work." },
      { key: "Delivery", rag: "A", line: "2 of 6 gates done" },
      { key: "Risk", rag: "N", line: "No open risks or blockers." },
    ],
    gates: [
      { name: "BRD", state: "Done", label: "Done", note: null },
      { name: "Build", state: "Blocked", label: "Blocked", note: "Waiting on vendor" },
      { name: "UAT", state: "NotStarted", label: "Not started", note: null },
    ],
    gatesDone: 1,
    doneThisWeek: ["T-1 · Ship the thing"],
    nextSteps: [{ title: "Sign off BRD", owner: "BA", due: new Date("2026-10-15T00:00:00Z") }],
    decision: null,
    topRisk: null,
    risksAndIssues: [],
    boardCounts: { done: 1, inProgress: 2, blocked: 1, overdue: 0 },
    markets: [],
    marketKpis: { tracks: 0, checkedIn: 0, onTrack: 0, gatesDone: 0, gatesTotal: 0 },
    ...over,
  };
}

// xmlns on the inline SVG is a namespace name, not a fetch — anything that would load is a src/href/@import/url().
const NETWORK = /<script|\ssrc=|\shref=|@import|url\(/i;

describe("project one-pagers", () => {
  it("escapes user text, inlines the logo and never references the network", () => {
    const { html, spec, filenameStem } = renderProjectReport(project());
    expect(html).toContain("Atlas &lt;migration&gt;");
    expect(html).toContain("Line with &lt;b&gt;markup&lt;/b&gt;");
    expect(html).not.toContain("<b>markup</b>");
    expect(html).toContain('<svg id="Layer_1"');
    expect(html).toContain("#1B7A3E"); // the tenant's brand rule, not a hardcoded red
    expect(html).not.toMatch(NETWORK);
    expect(html.match(/<section class="page">/g)).toHaveLength(1);
    expect(spec).toEqual({ landscape: true });
    expect(filenameStem).toBe("qubit-atlas-2026-W41-build");
  });

  it("renders one gate column per checkpoint and the blocker reason as the note", () => {
    const { html } = renderProjectReport(project());
    expect(html).toContain("grid-template-columns:repeat(3,1fr)");
    expect(html).toContain("2 · BLOCKED");
    expect(html).toContain("Waiting on vendor");
  });

  it("says so when nothing waits on a decision and there is no risk", () => {
    const { html } = renderProjectReport(project());
    expect(html).toContain("Nothing is waiting on a decision.");
    expect(html).toContain("No open risks.");
  });

  it("footer names the signer for a confirmed week and the live-data caveat for a past one", () => {
    const past = renderProjectReport(project({ week: { isoWeek: "2026-W40", number: "40", range: "28 Sep–2 Oct", isCurrent: false, generatedAt: now } }));
    expect(past.html).toContain("RAG confirmed by PM One on 9 Oct");
    expect(past.html).toContain("Gates, board and register as of 9 Oct");
    const current = renderProjectReport(project({ checkIn: { ...project().checkIn, status: "Draft", confirmedByName: null, confirmedAt: null } }));
    expect(current.html).toContain("RAG computed");
    expect(current.html).not.toContain("as of 9 Oct");
  });

  it("the dual page carries both tiles and the market table; the market page its KPIs", () => {
    const markets = [{ code: "KE", name: "Kenya", flag: "🇰🇪", status: "OnTrack", progress: 60, rag: "Green" as const, checkedIn: false, narrative: null }];
    const dual = renderProjectReport(project({ template: "dual", markets, checkIn: { ...project().checkIn, marketRag: "Green" }, marketKpis: { tracks: 1, checkedIn: 0, onTrack: 1, gatesDone: 0, gatesTotal: 0 } }));
    expect(dual.html).toContain("Build + In market");
    expect(dual.html).toContain("no check-in · track status");
    expect(dual.filenameStem).toBe("qubit-atlas-2026-W41-dual");
    const market = renderProjectReport(project({ template: "market", markets, marketKpis: { tracks: 1, checkedIn: 0, onTrack: 1, gatesDone: 0, gatesTotal: 0 } }));
    expect(market.html).toContain("Market rollout");
    expect(market.html).toContain("Checked in this week");
  });
});

describe("portfolio digest", () => {
  const digest = (status: DigestReportData["status"]): DigestReportData => ({
    tenantName: "Demo Org B",
    brandColor: "#1B7A3E",
    week: { isoWeek: "2026-W41", number: "41", range: "5–9 Oct", isCurrent: true, generatedAt: now },
    status,
    narrative: status === "Approved" ? "Nine of thirteen <green>" : null,
    approvedByName: status === "Approved" ? "Head One" : null,
    approvedAt: status === "Approved" ? now : null,
    total: 2,
    counts: { green: 1, amber: 0, red: 1, computed: 1 },
    groups: [
      {
        portfolioName: "Alpha",
        rows: [
          { projectId: "p1", code: "A1", name: "Alpha One", pmName: "PM", portfolioName: "Alpha", rag: "Green", checkIn: "Confirmed", submittedToHead: true, narrative: "All good", stage: "Approved", marketSummary: "In market: 1 of 2 on track" },
          { projectId: "p2", code: "A2", name: "Alpha Two", pmName: null, portfolioName: "Alpha", rag: "Red", checkIn: "None", submittedToHead: false, narrative: null, stage: "Exploring", marketSummary: null },
        ],
      },
    ],
  });

  it("flows with Chromium's footer, groups by portfolio and marks computed rows", () => {
    const { html, spec, filenameStem } = renderDigest(digest("Approved"));
    expect(html).toContain("Prepared by Head One, Demo Org B");
    expect(html).toContain("Nine of thirteen &lt;green&gt;");
    expect(html).toContain('text-transform:uppercase;color:#6b6b6b;border-top:1px solid #e9e9e9">Alpha</td>');
    expect(html).toContain("In market: 1 of 2 on track");
    expect(html).toContain("computed");
    expect(html).toContain("Not yet sent — computed status shown.");
    expect(html).not.toMatch(NETWORK);
    expect(spec.footerTemplate).toContain("Internal and confidential");
    expect(spec.footerTemplate).toContain("RAG approved by the Head on 9 Oct");
    expect(spec.margin?.bottom).toBe("0.7in");
    expect(filenameStem).toBe("qubit-rollup-2026-W41");
  });

  it("watermarks a draft", () => {
    const { html, spec, filenameStem } = renderDigest(digest("Draft"));
    expect(html).toContain("Draft — not yet approved by the Head");
    expect(spec.footerTemplate).toContain("not yet approved");
    expect(filenameStem).toBe("qubit-rollup-2026-W41-draft");
  });
});

describe("read-model rules", () => {
  it("picks the template from the project's tracks", () => {
    expect(pickTemplate({ markets: 0, gates: 6, tasks: 10 })).toBe("build");
    expect(pickTemplate({ markets: 3, gates: 0, tasks: 0 })).toBe("market");
    expect(pickTemplate({ markets: 3, gates: 6, tasks: 0 })).toBe("dual");
  });

  it("needs-a-decision = oldest open blocker that is Critical or past the Head threshold", () => {
    const d = (ago: number, severity: string, status = "Open") => ({ severity, status, dateRaised: new Date(now.getTime() - ago * 86_400_000) });
    expect(pickDecision([d(2, "Low")], now)).toBeNull();
    expect(pickDecision([d(2, "Critical")], now)?.ageDays).toBe(2);
    expect(pickDecision([d(9, "Medium"), d(12, "Low"), d(20, "Low", "Resolved")], now)?.ageDays).toBe(12);
  });

  it("top risk = highest probability × impact among live risks", () => {
    const r = (p: number, i: number, status = "Open") => ({ probability: p, impact: i, status });
    expect(pickTopRisk([r(2, 2), r(4, 4, "Closed"), r(3, 3)])).toEqual(r(3, 3));
    expect(pickTopRisk([])).toBeNull();
  });

  it("dimension cards read the same signals the cockpit derives", () => {
    const cards = dimensionCards({
      status: "OnTrack",
      dueDate: null,
      now,
      overdueTasks: 2,
      slippedMilestones: 0,
      nextMilestone: null,
      gates: [{ name: "A", state: "Blocked", label: "Blocked", note: null }],
      openBlockers: 1,
      openRisks: 0,
      redRisks: 0,
      topRisk: null,
    });
    expect(cards.map((c) => c.key)).toEqual(["Schedule", "Delivery", "Risk"]);
    expect(cards[0]!.line).toBe("2 tasks overdue");
    expect(cards[1]).toMatchObject({ rag: "R", line: "1 gate blocked · 0 of 1 done" });
    expect(cards[2]).toMatchObject({ rag: "A", line: "1 open blocker" });
  });
});

describe("logo constant", () => {
  it("mirrors src/assets/qubit_main_logo.svg with the XML prolog stripped", () => {
    const file = readFileSync("src/assets/qubit_main_logo.svg", "utf8")
      .replace(/^<\?xml[^>]*\?>\s*/, "")
      .replace(/\n\s*/g, "")
      .trim();
    expect(QUBIT_LOGO_SVG).toBe(file);
  });
});
