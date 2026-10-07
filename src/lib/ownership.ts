/**
 * docs/38 — who RUNS a project. One rule, used by every "my projects" surface (cockpit,
 * Reports queue, nudges, the status-report upload, the walkthrough, write access):
 *   the project's lead, OR a "Project Manager" member, OR — when the project's pmScope is
 *   "instance" — the lead of one of its live instances.
 * Pure Prisma fragments so the server modules cannot drift from each other.
 */
import type { Prisma } from "@prisma/client";

/** `where` fragment: projects `userId` runs. */
export function runsProjectWhere(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { leadUserId: userId },
      { members: { some: { userId, role: "Project Manager" } } },
      { pmScope: "instance", orgStatuses: { some: { leadUserId: userId, retiredAt: null } } },
    ],
  };
}

/** `select` fragment to compute `pmIdsOf` from a project row. */
export const PM_SELECT = {
  leadUserId: true,
  pmScope: true,
  members: { where: { role: "Project Manager" }, select: { userId: true } },
  orgStatuses: { where: { retiredAt: null, leadUserId: { not: null } }, select: { leadUserId: true } },
} satisfies Prisma.ProjectSelect;

/** Everyone who runs the project, de-duplicated, lead first. */
export function pmIdsOf(p: { leadUserId: string | null; pmScope: string; members: { userId: string }[]; orgStatuses: { leadUserId: string | null }[] }): string[] {
  const ids = [p.leadUserId, ...p.members.map((m) => m.userId), ...(p.pmScope === "instance" ? p.orgStatuses.map((o) => o.leadUserId) : [])];
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}
