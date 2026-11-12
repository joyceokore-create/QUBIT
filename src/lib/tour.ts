/**
 * First-week walkthrough — the pure step machine (client-safe, unit-tested). Two tracks:
 *
 * - **Set up** — hands-on, one project at a time: gates, documents, team, YouTrack, this
 *   week's update. Each step frames the real control, leaves the page fully usable, and
 *   turns into a Continue once the real thing has happened (or can be skipped). Steps a
 *   project has already done are skipped, so progress is simply the project's data.
 * - **App walkthrough** — look-here: the work queue, Mine on Projects, a workspace, the
 *   board, Reports › This week.
 *
 * The welcome takeover offers both; each track's last card hands over to the other (or
 * to the next project still to set up). State lives in localStorage while a walk is in
 * progress; finishing or exiting stamps the server flag so it is never auto-offered again.
 */

export type TourEvent = "template-attached" | "document-added" | "member-added" | "youtrack-connected" | "update-sent";

export type TourTrack = "setup" | "app";

export type TourStepId =
  | "welcome"
  | "gates"
  | "documents"
  | "team"
  | "youtrack"
  | "update"
  | "setup-done"
  | "queue"
  | "projects"
  | "workspace"
  | "board"
  | "reports"
  | "app-done";

export interface TourStep {
  id: TourStepId;
  track: TourTrack | null;
  /** One word for the progress dots on the card. */
  short: string;
  /** Route to be on; `{id}` = the walked project, `{reports}` / `{dashboard}` = role query. Null = stay. */
  href: string | null;
  /** CSS selector of the control to frame; null = a centred card. */
  target: string | null;
  title: string;
  line: string;
  /** Label of the primary button when no event is awaited. */
  action: string;
  /** The real action this step waits for — the card shows "Skip this step" meanwhile. */
  waitFor?: TourEvent;
  /** Hands-on steps: the card's title once the event has fired. */
  doneTitle?: string;
  /** Shown while waiting, naming the thing to do. */
  waitingLabel?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    track: null,
    short: "Welcome",
    href: null,
    target: null,
    title: "Your week in QUBIT",
    line: "Set each project up once, keep the board honest, and send Friday's update from one place.",
    action: "Show me around",
  },
  // ── Set up ───────────────────────────────────────────────────────────────────
  {
    id: "gates",
    track: "setup",
    short: "Gates",
    href: "/projects/{id}?tab=Delivery",
    target: '[data-tour="gate-template"]',
    title: "Attach the delivery gates",
    line: "Pick the checkpoint template that fits this project, then record where each gate stands. Progress is derived from the gates and the board — never typed in.",
    action: "Continue",
    waitFor: "template-attached",
    doneTitle: "Gates attached",
    waitingLabel: "Choose a template in the picker framed above — the page is yours, take your time.",
  },
  {
    id: "documents",
    track: "setup",
    short: "Docs",
    href: "/projects/{id}?tab=Documents",
    target: '[data-tour="add-document"]',
    title: "Add the BRD",
    line: "Documents live with the project. Add the BRD (or draft one with Q) and Q can read requirements out of it.",
    action: "Continue",
    waitFor: "document-added",
    doneTitle: "Document added",
    waitingLabel: "Click Add document (framed above) and add one — the page is yours, take your time.",
  },
  {
    id: "team",
    track: "setup",
    short: "Team",
    href: "/projects/{id}?tab=Team",
    target: '[data-tour="add-member"]',
    title: "Your team",
    line: "Add the people on this project. The first project manager added becomes its lead.",
    action: "Continue",
    waitFor: "member-added",
    doneTitle: "Team member added",
    waitingLabel: "Click Add member (framed above) and add someone — the page is yours, take your time.",
  },
  {
    id: "youtrack",
    track: "setup",
    short: "YouTrack",
    href: "/projects/{id}?tab=Team",
    target: '[data-tour="youtrack"]',
    title: "Connect YouTrack",
    line: "Tasks mirror onto the Board and the weekly update drafts itself from them. Instance URL, project key and a read-only token.",
    action: "Continue",
    waitFor: "youtrack-connected",
    doneTitle: "YouTrack connected",
    waitingLabel: "Click Connect on the YouTrack card framed above — or skip if this project isn't on YouTrack yet.",
  },
  {
    id: "update",
    track: "setup",
    short: "Update",
    href: "/projects/{id}?tab=This%20week",
    target: '[data-tour="status-update"]',
    title: "Send this week's update",
    line: "One line for leadership, one RAG, Confirm & send — it lands in the Head's roll-up in one step. The bullets are drafted from the board for you.",
    action: "Continue",
    waitFor: "update-sent",
    doneTitle: "Update sent",
    waitingLabel: "Write your line in the card framed above and Confirm & send — or skip until Friday.",
  },
  {
    id: "setup-done",
    track: "setup",
    short: "Done",
    href: null,
    target: null,
    title: "That's this project",
    line: "Whatever you skipped stays on the project's This week tab as a checklist, so nothing is lost.",
    action: "Done",
  },
  // ── App walkthrough ──────────────────────────────────────────────────────────
  {
    id: "queue",
    track: "app",
    short: "Queue",
    href: "/dashboard{dashboard}",
    target: "#pm-queue",
    title: "Your work queue",
    line: "Everything that needs you, across the projects you run — set-up left to do, this week's update, overdue milestones, RAG disputes. Start the day here.",
    action: "Next",
  },
  {
    id: "projects",
    track: "app",
    short: "Projects",
    href: "/projects",
    target: '[data-tour="mine"]',
    title: "These are yours",
    line: "Mine filters to the projects you run. Open any of them to reach its workspace — we'll take the first.",
    action: "Open my first project",
  },
  {
    id: "workspace",
    track: "app",
    short: "Workspace",
    href: "/projects/{id}?tab=This%20week",
    target: '[data-tour="status-update"]',
    title: "Every Friday, from here",
    line: "One line for leadership, one RAG, Confirm & send — it lands in the Head's roll-up in one step. The tabs above hold delivery gates, the board, documents, the register and the team.",
    action: "Next",
  },
  {
    id: "board",
    track: "app",
    short: "Board",
    href: "/projects/{id}?tab=Board",
    target: '[data-tour="board"]',
    title: "The board is the truth",
    line: "Tasks mirror from YouTrack; blockers, progress and RAG are derived from them. Nudge the owner of anything blocked from here.",
    action: "Next",
  },
  {
    id: "reports",
    track: "app",
    short: "Reports",
    href: "/reports{reports}",
    target: '[data-tour="pm-week"]',
    title: "All your projects, one queue",
    line: "Reports › This week lists every project you run. Send each line here, or upload your status report and send them all at once.",
    action: "Finish",
  },
  {
    id: "app-done",
    track: "app",
    short: "Done",
    href: null,
    target: null,
    title: "You're set",
    line: "The workspace's This week card and Reports › This week are the two places the week happens. Replay either walk any time from your menu.",
    action: "Done",
  },
];

export interface TourState {
  active: boolean;
  track: TourTrack | null;
  step: TourStepId;
  projectId: string | null;
  /** "" for a PM; "?as=pm" for a Head / admin, whose own /reports is the inbox. */
  reportsQuery: string;
  /** "" for a PM; "?level=pm" for a Head / admin, whose own dashboard is another cockpit. */
  dashboardQuery: string;
  /** Set-up steps this project has already done — skipped, so progress is the data. */
  completed: TourStepId[];
  /** The hands-on step's event has fired: the page stays theirs; the card offers Continue. */
  done?: boolean;
}

export type TourAction =
  | { type: "start"; projectId: string | null; reportsQuery?: string; dashboardQuery?: string }
  | { type: "choose"; track: TourTrack; projectId: string | null; completed?: TourStepId[] }
  | { type: "next" }
  | { type: "back" }
  | { type: "skip" }
  | { type: "event"; event: TourEvent }
  | { type: "resume"; state: TourState }
  | { type: "exit" };

const TRACKS: Record<TourTrack, TourStepId[]> = {
  setup: ["gates", "documents", "team", "youtrack", "update", "setup-done"],
  app: ["queue", "projects", "workspace", "board", "reports", "app-done"],
};
/** App steps that need a project to walk. */
const NEEDS_PROJECT: TourStepId[] = ["workspace", "board"];

export const stepById = (id: TourStepId): TourStep => TOUR_STEPS.find((s) => s.id === id)!;
export const trackSteps = (track: TourTrack): TourStep[] => TRACKS[track].map(stepById);
/** Position within the track, counting only the steps this walk will show. */
export function stepProgress(state: TourState): { n: number; total: number; shown: TourStepId[] } {
  if (!state.track) return { n: 0, total: 0, shown: [] };
  const shown = TRACKS[state.track].filter((id) => id !== "setup-done" && id !== "app-done" && !skipped(id, state.projectId, state.completed));
  return { n: shown.indexOf(state.step) + 1, total: shown.length, shown };
}

function skipped(id: TourStepId, projectId: string | null, completed: TourStepId[]): boolean {
  return completed.includes(id) || (!projectId && NEEDS_PROJECT.includes(id));
}

export function nextStepId(state: TourState): TourStepId {
  if (!state.track) return state.step;
  const order = TRACKS[state.track];
  let i = order.indexOf(state.step) + 1;
  while (i < order.length - 1 && skipped(order[i]!, state.projectId, state.completed)) i++;
  return order[Math.min(i, order.length - 1)]!;
}

export function prevStepId(state: TourState): TourStepId {
  if (!state.track) return state.step;
  const order = TRACKS[state.track];
  let i = order.indexOf(state.step) - 1;
  while (i > 0 && skipped(order[i]!, state.projectId, state.completed)) i--;
  return order[Math.max(i, 0)]!;
}

function firstStep(track: TourTrack, projectId: string | null, completed: TourStepId[]): TourStepId {
  const order = TRACKS[track];
  let i = 0;
  while (i < order.length - 1 && skipped(order[i]!, projectId, completed)) i++;
  return order[i]!;
}

export function stepHref(step: TourStep, state: Pick<TourState, "projectId" | "reportsQuery" | "dashboardQuery">): string | null {
  if (!step.href) return null;
  return step.href.replace("{id}", state.projectId ?? "").replace("{reports}", state.reportsQuery).replace("{dashboard}", state.dashboardQuery);
}

export const INITIAL_TOUR: TourState = { active: false, track: null, step: "welcome", projectId: null, reportsQuery: "", dashboardQuery: "", completed: [] };

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case "start":
      return { ...INITIAL_TOUR, active: true, projectId: action.projectId, reportsQuery: action.reportsQuery ?? "", dashboardQuery: action.dashboardQuery ?? "" };
    case "choose": {
      const completed = action.completed ?? [];
      return { ...state, active: true, track: action.track, projectId: action.projectId, completed, step: firstStep(action.track, action.projectId, completed), done: false };
    }
    case "next":
    case "skip":
      if (!state.active) return state;
      if (state.step === "setup-done" || state.step === "app-done") return { ...state, active: false };
      if (!state.track) return state;
      return { ...state, step: nextStepId(state), done: false };
    case "back":
      if (!state.active || !state.track) return state;
      if (state.step === TRACKS[state.track][0] || state.step === firstStep(state.track, state.projectId, state.completed)) return { ...state, track: null, step: "welcome", done: false };
      return { ...state, step: prevStepId(state), done: false };
    case "event": {
      // The real thing happened. The step does not jump: they keep the page for as long as
      // they like and the card turns into a Continue.
      if (!state.active) return state;
      const current = stepById(state.step);
      return current.waitFor === action.event && !state.done ? { ...state, done: true } : state;
    }
    case "resume":
      return action.state.active && TOUR_STEPS.some((s) => s.id === action.state.step) ? action.state : state;
    case "exit":
      return { ...state, active: false };
  }
}

/** Route (path + query, no hash) the step wants, for matching against the current URL. */
export function stepRoute(step: TourStep, state: Pick<TourState, "projectId" | "reportsQuery" | "dashboardQuery">): { pathname: string; search: string } | null {
  const href = stepHref(step, state);
  if (!href) return null;
  const [path, query = ""] = href.split("?");
  return { pathname: path!, search: query ? `?${query}` : "" };
}
