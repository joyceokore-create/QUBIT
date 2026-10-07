// First-week walkthrough — the step machine. What matters: the order; a hands-on step moves
// only on ITS event (or an explicit skip); without a project the workspace steps are
// skipped both ways; hrefs carry the walked project; exit is always available.
import { describe, expect, it } from "vitest";
import { INITIAL_TOUR, nextStepId, prevStepId, stepById, stepHref, stepRoute, TOUR_STEPS, tourReducer, type TourState } from "@/lib/tour";

const run = (actions: Parameters<typeof tourReducer>[1][], from: TourState = INITIAL_TOUR) => actions.reduce(tourReducer, from);

describe("tour steps", () => {
  it("walk the three places in order, six steps between welcome and done", () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(["welcome", "projects", "gates", "documents", "team", "thisweek", "reports", "done"]);
    expect(TOUR_STEPS.filter((s) => s.place === "workspace").every((s) => s.href?.includes("{id}"))).toBe(true);
    expect(stepHref(stepById("thisweek"), "p1")).toBe("/projects/p1?tab=This%20week");
    expect(stepRoute(stepById("gates"), "p1")).toEqual({ pathname: "/projects/p1", search: "?tab=Delivery" });
    expect(stepRoute(stepById("welcome"), "p1")).toBeNull();
    expect(stepHref(stepById("reports"), "p1")).toBe("/reports");
    expect(stepHref(stepById("reports"), "p1", "?as=pm")).toBe("/reports?as=pm");
  });

  it("hands-on steps advance on their own event only, or on skip", () => {
    const atGates = run([{ type: "start", projectId: "p1" }, { type: "next" }, { type: "next" }]);
    expect(atGates.step).toBe("gates");
    expect(tourReducer(atGates, { type: "next" }).step).toBe("documents"); // Next is still allowed by the machine; the card hides it while waiting
    expect(tourReducer(atGates, { type: "event", event: "document-added" }).step).toBe("gates");
    expect(tourReducer(atGates, { type: "event", event: "template-attached" }).step).toBe("documents");
    expect(tourReducer(atGates, { type: "skip" }).step).toBe("documents");
    expect(tourReducer(atGates, { type: "back" }).step).toBe("projects");
  });

  it("without a project the workspace steps are skipped in both directions", () => {
    expect(nextStepId("projects", null)).toBe("reports");
    expect(prevStepId("reports", null)).toBe("projects");
    expect(nextStepId("projects", "p1")).toBe("gates");
    const s = run([{ type: "start", projectId: null }, { type: "next" }, { type: "next" }]);
    expect(s.step).toBe("reports");
  });

  it("done → next ends the walk; exit ends it from anywhere; start restarts", () => {
    const done = run([{ type: "start", projectId: null }, { type: "next" }, { type: "next" }, { type: "next" }]);
    expect(done.step).toBe("done");
    expect(tourReducer(done, { type: "next" }).active).toBe(false);
    expect(tourReducer(run([{ type: "start", projectId: "p1" }, { type: "next" }]), { type: "exit" }).active).toBe(false);
    expect(tourReducer(done, { type: "start", projectId: "p9", reportsQuery: "?as=pm" })).toEqual({ active: true, step: "welcome", projectId: "p9", reportsQuery: "?as=pm" });
    expect(tourReducer(INITIAL_TOUR, { type: "next" })).toEqual(INITIAL_TOUR);
  });
});
