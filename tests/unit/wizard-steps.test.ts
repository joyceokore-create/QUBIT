// M-P1b (docs/26 §5) — pure wizard step navigation, incl. conditional skips.
import { describe, expect, it } from "vitest";
import { draftKey, nextStep, prevStep, settleStep, type WizardStep } from "@/lib/wizard";

const STEPS: WizardStep[] = [
  { key: "identity", label: "Identity" },
  { key: "lens", label: "Lens" },
  { key: "markets", label: "Markets" },
  { key: "governance", label: "Governance" },
  { key: "review", label: "Review" },
];
const none = new Set<string>();
const skipMarkets = new Set(["markets"]);

describe("wizard step navigation", () => {
  it("walks forward and back linearly with nothing skipped", () => {
    expect(nextStep(STEPS, 0, none)).toBe(1);
    expect(nextStep(STEPS, 3, none)).toBe(4);
    expect(prevStep(STEPS, 2, none)).toBe(1);
  });

  it("hops over a skipped step in both directions", () => {
    expect(nextStep(STEPS, 1, skipMarkets)).toBe(3); // Lens → Governance
    expect(prevStep(STEPS, 3, skipMarkets)).toBe(1); // Governance → Lens
  });

  it("clamps at the ends", () => {
    expect(nextStep(STEPS, 4, none)).toBe(4);
    expect(prevStep(STEPS, 0, none)).toBe(0);
    // Last step skipped, standing before it: nowhere forward to go.
    expect(nextStep(STEPS, 3, new Set(["review"]))).toBe(3);
  });

  it("settles off a step that becomes skipped underneath the user", () => {
    // User is ON Markets, then flips the lens to Pipeline: settle backwards to Lens.
    expect(settleStep(STEPS, 2, skipMarkets)).toBe(1);
    // A visible current step settles to itself.
    expect(settleStep(STEPS, 2, none)).toBe(2);
    // First step skipped while current: settle forward.
    expect(settleStep(STEPS, 0, new Set(["identity"]))).toBe(1);
  });

  it("draft keys are namespaced per wizard AND per user (shared machines)", () => {
    expect(draftKey("portfolio", "u1")).toBe("qubit.wiz.portfolio.u1");
    expect(draftKey("portfolio", "u1")).not.toBe(draftKey("portfolio", "u2"));
    expect(draftKey("portfolio", "u1")).not.toBe(draftKey("project", "u1"));
  });
});
