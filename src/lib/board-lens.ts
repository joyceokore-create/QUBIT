// Board lenses (Phase 6.2, docs/15) — pure, client-safe helpers. ONE ProjectTask table,
// three saved views over it; a lens is a filter, never a separate data source, so the
// boards can't drift apart.
import type { ProjectRoleCategory } from "@/lib/roles";

export type BoardLens = "all" | "dev" | "qa";

export const LENS_LABELS: Record<BoardLens, string> = {
  all: "All work",
  dev: "Dev board",
  qa: "QA board",
};

/** The lens a viewer lands on, by their project-role category. Everyone can switch. */
export function defaultLens(category: ProjectRoleCategory): BoardLens {
  if (category === "Dev") return "dev";
  if (category === "QA") return "qa";
  return "all"; // PM and Stakeholder see everything by default
}

export interface LensTask {
  type: string;
  status: string;
  assigneeId: string | null;
}

/**
 * Dev lens: build work (everything non-Bug) plus bugs somebody is already assigned to fix.
 * QA lens: work awaiting verification (InReview/InQA) plus ALL bugs (triage included).
 */
export function lensFilter(lens: BoardLens, t: LensTask): boolean {
  switch (lens) {
    case "dev":
      return t.type !== "Bug" || t.assigneeId != null;
    case "qa":
      return t.status === "InReview" || t.status === "InQA" || t.type === "Bug";
    default:
      return true;
  }
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
