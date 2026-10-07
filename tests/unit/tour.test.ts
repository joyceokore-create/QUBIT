// The walkthrough's two tracks as a pure machine: the welcome chooses a track; the set-up
// track skips what the project already has and only ticks a hands-on step on ITS event
// (then waits for Continue); the app track skips the workspace steps without a project;
// each track's last card ends the walk.
import { describe, expect, it } from "vitest";
import { INITIAL_TOUR, stepById, stepHref, stepProgress, stepRoute, TOUR_STEPS, tourReducer, trackSteps, type TourState } from "@/lib/tour";

const run = (actions: Parameters<typeof tourReducer>[1][], from: TourState = INITIAL_TOUR) => actions.reduce(tourReducer, from);
const started = run([{ type: "start", projectId: "p1", reportsQuery: "?as=pm", dashboardQuery: "?level=pm" }]);

describe("tour steps", () => {
  it("every step is reachable from exactly one track or the welcome, with a route token that resolves", () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...trackSteps("setup"), ...trackSteps("app")].map((s) => s.id).concat("welcome").sort()).toEqual([...ids].sort());
    const state = { projectId: "p1", reportsQuery: "?as=pm", dashboardQuery: "?level=pm" };
    expect(stepHref(stepById("gates"), state)).toBe("/projects/p1?tab=Delivery");
    expect(stepHref(stepById("update"), state)).toBe("/projects/p1?tab=This%20week");
    expect(stepHref(stepById("reports"), state)).toBe("/reports?as=pm");
    expect(stepHref(stepById("queue"), state)).toBe("/dashboard?level=pm");
    expect(stepHref(stepById("queue"), { ...state, dashboardQuery: "" })).toBe("/dashboard");
    expect(stepRoute(stepById("update"), state)).toEqual({ pathname: "/projects/p1", search: "?tab=This%20week" });
    expect(stepHref(stepById("welcome"), state)).toBeNull();
  });

  it("the welcome chooses a track; set-up skips what the project already has", () => {
    expect(started).toMatchObject({ active: true, track: null, step: "welcome", projectId: "p1" });
    const setup = tourReducer(started, { type: "choose", track: "setup", projectId: "p1", completed: ["gates", "youtrack"] });
    expect(setup).toMatchObject({ track: "setup", step: "documents", completed: ["gates", "youtrack"] });
    expect(stepProgress(setup)).toMatchObject({ n: 1, total: 3, shown: ["documents", "team", "update"] });
    const team = tourReducer(setup, { type: "skip" });
    expect(team.step).toBe("team");
    expect(tourReducer(team, { type: "next" }).step).toBe("update"); // youtrack skipped
    expect(tourReducer(tourReducer(team, { type: "next" }), { type: "next" }).step).toBe("setup-done");
    // Back from the first shown step returns to the welcome.
    expect(tourReducer(setup, { type: "back" })).toMatchObject({ track: null, step: "welcome" });
    expect(tourReducer(team, { type: "back" }).step).toBe("documents");
  });

  it("a hands-on step ticks on its own event only, then waits for Continue", () => {
    const atGates = tourReducer(started, { type: "choose", track: "setup", projectId: "p1" });
    expect(atGates.step).toBe("gates");
    expect(tourReducer(atGates, { type: "event", event: "document-added" })).toMatchObject({ step: "gates", done: false });
    const satisfied = tourReducer(atGates, { type: "event", event: "template-attached" });
    expect(satisfied).toMatchObject({ step: "gates", done: true });
    expect(tourReducer(satisfied, { type: "next" })).toMatchObject({ step: "documents", done: false });
    expect(tourReducer(atGates, { type: "skip" }).step).toBe("documents");
  });

  it("the app walk skips the workspace steps without a project and ends on its done card", () => {
    const app = tourReducer(started, { type: "choose", track: "app", projectId: null });
    expect(app.step).toBe("queue");
    const s = run([{ type: "next" }, { type: "next" }], app);
    expect(s.step).toBe("reports");
    expect(stepProgress(app).shown).toEqual(["queue", "projects", "reports"]);
    const withProject = tourReducer(started, { type: "choose", track: "app", projectId: "p1" });
    expect(stepProgress(withProject).shown).toEqual(["queue", "projects", "workspace", "board", "reports"]);
    const done = run([{ type: "next" }, { type: "next" }, { type: "next" }], app);
    expect(done.step).toBe("app-done");
    expect(tourReducer(done, { type: "next" }).active).toBe(false);
  });

  it("exit ends it from anywhere; resume restores a saved walk; start restarts", () => {
    const mid = run([{ type: "choose", track: "setup", projectId: "p1" }, { type: "next" }], started);
    expect(tourReducer(mid, { type: "exit" }).active).toBe(false);
    expect(tourReducer(INITIAL_TOUR, { type: "resume", state: mid })).toEqual(mid);
    expect(tourReducer(INITIAL_TOUR, { type: "resume", state: { ...mid, step: "nope" as TourState["step"] } })).toEqual(INITIAL_TOUR);
    expect(tourReducer(mid, { type: "start", projectId: "p9" })).toMatchObject({ active: true, track: null, step: "welcome", projectId: "p9", completed: [] });
    expect(tourReducer(INITIAL_TOUR, { type: "next" })).toEqual(INITIAL_TOUR);
  });
});
