// The project workspace's wire shape (server page -> client workspace). DM1.73: moved
// out of project-panel-content.tsx when that dead panel (never rendered since the
// workspace replaced the sheet panel) was deleted.

import type { CheckInView } from "@/server/checkins";

/** The current week's check-in as it crosses the server → client boundary (dates as ISO
 * strings, like every other field on this shape) plus whether the viewer may act on it. */
export type CheckInJson = Omit<CheckInView, "overrideExpiresAt" | "confirmedAt" | "submittedToHeadAt"> & {
  overrideExpiresAt: string | null;
  confirmedAt: string | null;
  submittedToHeadAt: string | null;
  canConfirm: boolean;
};

export interface ProjectPanelJson {
  /** M-P2c — dependency-picker candidates (id/code/name of active projects, capped at 300). */
  allProjects?: { id: string; code: string; name: string }[];
  /** M-P2b — the Delivery tab's market strip (project × subsidiary tracks). Milestone A:
   *  carries this week's RAG by the rollout cell rule (marketRagsForProject). */
  marketTracks?: { orgUnitId: string; code: string; flag: string | null; progress: number; status: string; rag: "Green" | "Amber" | "Red" }[];
  /** Milestone A — this week's check-in, computed once on the server so the header's
   *  Build / In-market chips render with the page and the status card seeds from it. */
  checkin?: CheckInJson;
  /** Milestone A — open blockers + risks + issues, for the Register tab badge. */
  registerOpenCount?: number;
  /** First-week walkthrough — the per-project setup signals behind "Set up {code}". */
  setup?: { gates: boolean; documents: boolean; team: boolean; youtrack: boolean | null; thisWeek: boolean; done: number; total: number };
  /** M-P4a — the idea(s) this project came from: accepted into it, or folded in. */
  ideaProvenance?: { id: string; title: string; kind: "accepted" | "merged"; submittedByName: string | null }[];
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: string;
  priority: string;
  pipelineStage: string;
  statusNote: string | null;
  /** docs/18 §7 — may edit stage/priority/status note/portfolio (PM/lead, heads, execs). */
  canGovern?: boolean;
  portfolioId: string | null;
  /** Portfolio choices for the governance editor's move control (docs/18 §0.5). */
  portfolios?: { id: string; name: string }[];
  status: string;
  dueDate: string | null;
  budget: string | null;
  team: string | null;
  client: string | null;
  objective: string | null;
  mission: string | null;
  businessOwner: string | null;
  startDate: string | null;
  portfolioName: string | null;
  programmeName: string | null;
  avgProgress: number;
  canEdit: boolean; // project settings / team — lead, PM, heads, SuperAdmin
  canContribute: boolean; // tasks + blockers — any project member (per Joyce)
  viewerCategory?: "PM" | "Dev" | "QA" | "Implementor" | "Stakeholder"; // default board lens (6.2)
  isMember: boolean; // the viewer leads or is allocated to this project
  subsidiaries: {
    orgUnitId: string;
    code: string;
    name: string;
    flag: string | null;
    progress: number;
    status: string;
  }[];
}
