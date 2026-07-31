// Board lenses (Phase 6.2, docs/15; visibility rules reworked in M7-D — DM1.43,
// superseding the "never a wall" half of DM1.3/DM1.20). Pure, client-safe helpers.
// ONE ProjectTask table, saved views over it; a lens is a filter, never a separate data
// source, so the boards can't drift apart.
import type { ProjectRoleCategory } from "@/lib/roles";

export type BoardLens = "all" | "dev" | "qa" | "impl";

export const LENS_LABELS: Record<BoardLens, string> = {
  all: "All work",
  dev: "Dev board",
  qa: "QA board",
  impl: "Implementor board",
};

/**
 * DM1.43: which lenses a viewer may use at all. PMs get every lens — they run the whole
 * project. A discipline member gets exactly THEIR lane; they cannot switch. Stakeholders
 * (Sponsor, Business Owner, Product Owner, BA) get the whole read-only picture — they are
 * the people who need to see everything and can act on none of it, so a discipline lane
 * would be the wrong shape for them.
 */
export function availableLenses(category: ProjectRoleCategory): BoardLens[] {
  switch (category) {
    case "PM":
      return ["all", "dev", "qa", "impl"];
    case "Dev":
      return ["dev"];
    case "QA":
      return ["qa"];
    case "Implementor":
      return ["impl"];
    default:
      return ["all"]; // Stakeholder — read-only whole picture
  }
}

/** The lens a viewer lands on: the first (only, for disciplines) lens they may use. */
export function defaultLens(category: ProjectRoleCategory): BoardLens {
  return category === "PM" ? "all" : availableLenses(category)[0];
}

export interface LensTask {
  type: string;
  status: string;
  assigneeId: string | null;
  /** Project-role category of the assignee (null = unassigned or not a project member). */
  assigneeCategory?: ProjectRoleCategory | null;
}

/**
 * DM1.43: the lane a task belongs to is decided by WHO it is assigned to — the assignee's
 * project-role category — because that is the one signal that survives YouTrack mirroring
 * (a mirrored issue has no phase/ownerRole, but its assignee does have a project role).
 * "A task assigned to Trevor (a dev) lands on the Dev board."
 *
 * Fallback for work with no categorised assignee (unassigned, or assigned to someone who
 * is not onboarded onto the project): the old type heuristics, so nothing vanishes —
 * unassigned bugs go to QA (triage), everything else to Dev. Work assigned to a PM or a
 * stakeholder lives on the "all" lane only: PMs see it, disciplines don't need to.
 */
export function laneFor(t: LensTask): BoardLens {
  switch (t.assigneeCategory) {
    case "Dev":
      return "dev";
    case "QA":
      return "qa";
    case "Implementor":
      return "impl";
    case "PM":
    case "Stakeholder":
      return "all";
    default:
      // No categorised assignee — fall back to what the task IS.
      return t.type === "Bug" ? "qa" : "dev";
  }
}

/** Lens filter: "all" sees everything; a discipline lens sees its lane. */
export function lensFilter(lens: BoardLens, t: LensTask): boolean {
  return lens === "all" || laneFor(t) === lens;
}

/**
 * Server-side visibility (DM1.43): may this viewer see this task at all? A task assigned
 * to you is ALWAYS visible, whatever lane it would otherwise fall in — nobody may be
 * blind to their own work. Otherwise the task's lane must be one the viewer may open.
 */
export function taskVisibleTo(category: ProjectRoleCategory, viewerId: string, t: LensTask): boolean {
  if (t.assigneeId === viewerId) return true;
  const lenses = availableLenses(category);
  if (lenses.includes("all")) return true;
  return lenses.includes(laneFor(t));
}

/** Unassigned bugs — pinned as the Triage group on the QA lens. */
export function isTriageBug(t: LensTask): boolean {
  return t.type === "Bug" && t.assigneeId == null && t.status !== "Completed";
}

/** Whole business days (Mon–Fri) strictly between two instants. */
export function businessDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let days = 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

export const AGING_BUSINESS_DAYS = 5;

/** True when an in-flight card has sat untouched > 5 business days — the honesty tint. */
export function isAging(lastActivityAt: Date | string, status: string, now: Date): boolean {
  if (status !== "InProgress" && status !== "InReview") return false;
  return businessDaysBetween(new Date(lastActivityAt), now) > AGING_BUSINESS_DAYS;
}

export const WIP_LIMIT = 3;

/** Soft WIP check: people with more than `limit` open In-progress cards (never a hard block). */
export function wipOverloads(
  tasks: { status: string; approvalStatus: string; assigneeId: string | null; assigneeName: string | null }[],
  limit: number = WIP_LIMIT,
): { name: string; count: number }[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const t of tasks) {
    if (t.status !== "InProgress" || t.approvalStatus === "Draft" || !t.assigneeId) continue;
    const entry = counts.get(t.assigneeId) ?? { name: t.assigneeName ?? "Unassigned", count: 0 };
    entry.count++;
    counts.set(t.assigneeId, entry);
  }
  return [...counts.values()].filter((e) => e.count > limit);
}
