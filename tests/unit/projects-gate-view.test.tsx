// UX8 — Projects › Gate view renders words (not colour alone) for every gate cell, the
// furthest-behind market tag, and an empty state that says why.
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ProjectsGateView } from "@/app/(app)/projects/projects-gate-view";
import type { GateViewRow } from "@/lib/project-gate-view";

let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/projects",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/components/panels/panel-context", () => ({ usePanel: () => ({ openProject: vi.fn() }) }));

const rows: GateViewRow[] = [
  {
    id: "p1",
    code: "RBS-01",
    name: "Project One",
    priority: "High",
    pm: "user_001",
    health: "Amber",
    track: {
      gates: { brd: "done", proto: "block", mvp1: "none", sit: "none", uat: "none", golive: "none" },
      stage: "Prototype",
      pct: 17,
      projectPct: 40,
      market: { code: "KE", name: "Market KE" },
      marketCount: 3,
    },
  },
  {
    id: "p2",
    code: "RBS-02",
    name: "Project Two",
    priority: "Low",
    pm: null,
    health: "None",
    track: { gates: null, stage: "Bank Integration", pct: 50, projectPct: 50, market: null, marketCount: 0 },
  },
];

describe("ProjectsGateView", () => {
  it("names every gate state and tags the furthest-behind market", () => {
    search = "view=gates";
    render(<ProjectsGateView rows={rows} canCreate={false} />);
    const one = screen.getByText("Project One").closest("tr")!;
    expect(within(one).getByText("Done")).toBeInTheDocument();
    expect(within(one).getByText("Blocked")).toBeInTheDocument();
    expect(within(one).getAllByText("Not started")).toHaveLength(4);
    const tag = within(one).getByRole("link", { name: /KE.*furthest behind of 3 markets/ });
    expect(tag).toHaveAttribute("href", "/projects/p1?tab=Delivery");

    const two = screen.getByText("Project Two").closest("tr")!;
    expect(within(two).getAllByText("Not on this template")).toHaveLength(6);
    expect(within(two).getByText("Bank Integration")).toBeInTheDocument();
    expect(within(two).getByText("No report")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–2 of 2")).toBeInTheDocument();
  });

  it("says when filters hide every row", () => {
    search = "view=gates&stage=UAT";
    render(<ProjectsGateView rows={rows} canCreate={false} />);
    expect(screen.getByText("No projects match these filters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });
});
