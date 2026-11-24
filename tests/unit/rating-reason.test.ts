// UX fidelity — the Weekly Update card asks the PM for their own reason when they choose a
// rating that differs from QUBIT's; a rating that came from the uploaded file keeps the file
// as its reason.
import { describe, expect, it } from "vitest";
import { needsRatingReason, ratingReasonMissing, type Card, type WorkspaceProject } from "@/components/reports/status-workspace-model";

const p = { product: { computedRag: "Amber" } } as unknown as WorkspaceProject;
const card = (over: Partial<Card>): Card => ({ rag: "Amber", ratingReason: "", fromFile: {}, ...over }) as unknown as Card;

describe("rating reason", () => {
  it("is not needed when the rating matches QUBIT's", () => {
    expect(needsRatingReason(p, card({}))).toBe(false);
  });
  it("is needed for a rating the PM chose, and must be at least 5 characters", () => {
    expect(ratingReasonMissing(p, card({ rag: "Green" }))).toBe(true);
    expect(ratingReasonMissing(p, card({ rag: "Green", ratingReason: "ok" }))).toBe(true);
    expect(ratingReasonMissing(p, card({ rag: "Green", ratingReason: "Vendor confirmed Monday" }))).toBe(false);
  });
  it("is not needed when the rating came from the uploaded file", () => {
    expect(needsRatingReason(p, card({ rag: "Green", fromFile: { rag: "line 3" } }))).toBe(false);
  });
});
