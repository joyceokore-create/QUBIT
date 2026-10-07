/**
 * First-week walkthrough — the pure step machine (client-safe, unit-tested). The tour is a
 * spotlight walk across three places — Projects, one real workspace, Reports — where each
 * hands-on step ticks itself when the real thing happens (a template attached, a document
 * added, a member assigned) and can always be skipped. State lives in localStorage while
 * the walk is in progress; finishing or exiting stamps the server flag.
 */

export type TourEvent = "template-attached" | "document-added" | "member-added" | "youtrack-connected" | "update-sent";

export type TourStepId = "welcome" | "projects" | "gates" | "documents" | "team" | "thisweek" | "reports" | "done";

export interface TourStep {
  id: TourStepId;
  /** Which of the three places this step belongs to (the route strip). */
  place: "projects" | "workspace" | "reports" | null;
  /** Route to be on; `{id}` is the walked project. Null = stay where you are. */
  href: string | null;
  /** CSS selector of the control to frame; null = a centred card. */
  target: string | null;
  title: string;
  line: string;
  /** Label of the primary button when no event is awaited. */
  action: string;
  /** The real action this step waits for — the card shows "Skip this step" meanwhile. */
  waitFor?: TourEvent;
  /** Shown while waiting, naming the thing to do. */
  waitingLabel?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    place: null,
    href: null,
    target: null,
    title: "Your week in QUBIT",
    line: "Set each project up once, keep the board honest, and send Friday's update from one place. Six short steps on your own projects.",
    action: "Show me",
  },
  {
    id: "projects",
    place: "projects",
    href: "/projects",
    target: '[data-tour="mine"]',
    title: "These are yours",
    line: "Mine filters to the projects you run. Open any of them to reach its workspace — we'll take the first.",
    action: "Open my first project",
  },
  {
    id: "gates",
    place: "workspace",
    href: "/projects/{id}?tab=Delivery",
    target: '[data-tour="gate-template"]',
    title: "Attach the delivery gates",
    line: "Pick the checkpoint template that fits this project. Progress is then derived from the gates and the board — never typed in.",
    action: "Next",
    waitFor: "template-attached",
    waitingLabel: "Choose a template to continue",
  },
  {
    id: "documents",
    place: "workspace",
    href: "/projects/{id}?tab=Documents",
    target: '[data-tour="add-document"]',
    title: "Add the BRD",
    line: "Documents live with the project. Add the BRD (or draft one with Q) and Q can read requirements out of it.",
    action: "Next",
    waitFor: "document-added",
    waitingLabel: "Add a document to continue",
  },
  {
    id: "team",
    place: "workspace",
    href: "/projects/{id}?tab=Team",
    target: '[data-tour="add-member"]',
    title: "Your team — and YouTrack",
    line: "Add the people on this project. Below, connect YouTrack: tasks mirror onto the Board and the weekly update drafts itself from them.",
    action: "Next",
    waitFor: "member-added",
    waitingLabel: "Add a member to continue",
  },
  {
    id: "thisweek",
    place: "workspace",
    href: "/projects/{id}?tab=This%20week",
    target: "#status-update",
    title: "Every Friday, from here",
    line: "One line for leadership, one RAG, Confirm & send — it lands in the Head's roll-up in one step. The bullets are drafted from the board for you.",
    action: "Next",
  },
  {
    id: "reports",
    place: "reports",
    href: "/reports",
    target: '[data-tour="pm-week-actions"]',
    title: "All your projects, one queue",
    line: "Reports › This week lists every project you run. Send each line here, or upload your status report and send them all at once.",
    action: "Finish",
  },
  {
    id: "done",
    place: null,
    href: null,
    target: null,
    title: "You're set",
    line: "The workspace's This week card and Reports › This week are the two places the week happens. Replay this walk any time from your menu.",
    action: "Done",
  },
];

export interface TourState {
  active: boolean;
  step: TourStepId;
  projectId: string | null;
}

export type TourAction =
  | { type: "start"; projectId: string | null }
  | { type: "next" }
  | { type: "back" }
  | { type: "skip" }
  | { type: "event"; event: TourEvent }
  | { type: "exit" };

const ORDER = TOUR_STEPS.map((s) => s.id);
const WORKSPACE: TourStepId[] = ["gates", "documents", "team", "thisweek"];

export const stepIndex = (id: TourStepId) => ORDER.indexOf(id);
export const stepById = (id: TourStepId): TourStep => TOUR_STEPS[stepIndex(id)]!;

/** The next step in order, skipping the workspace steps when there is no project to walk. */
export function nextStepId(from: TourStepId, projectId: string | null): TourStepId {
  let i = stepIndex(from) + 1;
  while (i < ORDER.length && !projectId && WORKSPACE.includes(ORDER[i]!)) i++;
  return ORDER[Math.min(i, ORDER.length - 1)]!;
}

export function prevStepId(from: TourStepId, projectId: string | null): TourStepId {
  let i = stepIndex(from) - 1;
  while (i > 0 && !projectId && WORKSPACE.includes(ORDER[i]!)) i--;
  return ORDER[Math.max(i, 0)]!;
}

export function stepHref(step: TourStep, projectId: string | null): string | null {
  if (!step.href) return null;
  return step.href.replace("{id}", projectId ?? "");
}

export const INITIAL_TOUR: TourState = { active: false, step: "welcome", projectId: null };

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case "start":
      return { active: true, step: "welcome", projectId: action.projectId };
    case "next":
    case "skip":
      if (!state.active) return state;
      if (state.step === "done") return { ...state, active: false };
      return { ...state, step: nextStepId(state.step, state.projectId) };
    case "back":
      if (!state.active || state.step === "welcome") return state;
      return { ...state, step: prevStepId(state.step, state.projectId) };
    case "event": {
      if (!state.active) return state;
      const current = stepById(state.step);
      return current.waitFor === action.event ? { ...state, step: nextStepId(state.step, state.projectId) } : state;
    }
    case "exit":
      return { ...state, active: false };
  }
}

/** Route (path + query, no hash) the step wants, for matching against the current URL. */
export function stepRoute(step: TourStep, projectId: string | null): { pathname: string; search: string } | null {
  const href = stepHref(step, projectId);
  if (!href) return null;
  const [path, query = ""] = href.split("?");
  return { pathname: path!, search: query ? `?${query}` : "" };
}
