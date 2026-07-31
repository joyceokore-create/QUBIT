// M7-A cycle detection (docs/16 §12). A dependency graph that loops is a set of tasks none
// of which can ever start, so cycles are refused at WRITE time — this is the pure walk that
// decides. Kept out of the DB so the graph cases are exhaustive and fast.
import { describe, expect, it } from "vitest";
import { wouldCycle, type DependencyEdge } from "@/server/dependencies";

const edge = (taskId: string, dependsOnTaskId: string): DependencyEdge => ({ taskId, dependsOnTaskId });

describe("wouldCycle", () => {
  it("refuses a task waiting on itself", () => {
    expect(wouldCycle([], "a", "a")).toBe(true);
  });

  it("allows an edge into an empty graph", () => {
    expect(wouldCycle([], "a", "b")).toBe(false);
  });

  it("catches the direct loop: b already waits on a, so a cannot wait on b", () => {
    expect(wouldCycle([edge("b", "a")], "a", "b")).toBe(true);
  });

  it("catches a transitive loop through a chain", () => {
    // c → b → a already; adding a → c would close the ring.
    const edges = [edge("c", "b"), edge("b", "a")];
    expect(wouldCycle(edges, "a", "c")).toBe(true);
  });

  it("catches a long chain", () => {
    const edges = ["b", "c", "d", "e", "f"].map((t, i) => edge(t, ["a", "b", "c", "d", "e"][i]));
    expect(wouldCycle(edges, "a", "f")).toBe(true);
  });

  it("allows a diamond — shared dependencies are not cycles", () => {
    // b and c both wait on d; a waiting on both is fine.
    const edges = [edge("b", "d"), edge("c", "d"), edge("a", "b")];
    expect(wouldCycle(edges, "a", "c")).toBe(false);
  });

  it("allows a second edge onto a task already depended upon", () => {
    expect(wouldCycle([edge("a", "b")], "c", "b")).toBe(false);
  });

  it("terminates on a graph that already contains a cycle", () => {
    // Defensive: bad data must not hang the walk. The `seen` set is what guarantees this.
    const edges = [edge("a", "b"), edge("b", "a")];
    expect(wouldCycle(edges, "c", "a")).toBe(false);
    expect(wouldCycle(edges, "b", "a")).toBe(true);
  });

  it("ignores branches that lead nowhere near the new edge", () => {
    const edges = [edge("x", "y"), edge("y", "z"), edge("m", "n")];
    expect(wouldCycle(edges, "a", "x")).toBe(false);
  });
});
