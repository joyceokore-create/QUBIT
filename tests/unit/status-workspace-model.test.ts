// The weekly update card's risk and issue lines from a status report: which lines are
// offered, and that the PM's picks count as a change and travel with the card's save.
import { describe, expect, it } from "vitest";
import { applyRowFor, baseCard, diffCard, raidLines, type WorkspaceProject } from "@/components/reports/status-workspace-model";

const project = {
  catalog: { projectId: "00000000-0000-4000-8000-000000000001", name: "Raid", gates: [], gateStates: [], modules: [], moduleStates: [], markets: [] },
  product: { narrative: "", ragOverride: null, computedRag: "Green", statusNote: "", alreadySent: false },
  markets: [],
} as unknown as WorkspaceProject;

describe("raidLines", () => {
  it("offers the risk, issue and blocker sections' lines once each, never next steps", () => {
    const lines = raidLines({
      sources: [
        { title: "Risks & issues", lines: ["Pilot date at risk", "  Pilot   date at risk ", "ok", "Owner [name] to confirm"] },
        { title: "Blockers", lines: ["Vendor contract unsigned"] },
        { title: "Next steps", lines: ["Start UAT on Monday"] },
      ],
    });
    expect(lines).toEqual(["Pilot date at risk", "Vendor contract unsigned"]);
  });
});

describe("a card's risk and blocker picks", () => {
  it("count as a change and go out with the save", () => {
    const base = baseCard(project);
    const card = { ...base, sources: [{ title: "Risks", lines: ["Pilot date at risk"] }], raid: { "Pilot date at risk": "risk" as const } };
    const d = diffCard(project, card, base);
    expect(d.count).toBe(1);
    expect(applyRowFor(project, card, d).raid).toEqual([{ kind: "risk", text: "Pilot date at risk" }]);
    expect("raid" in applyRowFor(project, base, diffCard(project, base, base))).toBe(false);
  });
});
