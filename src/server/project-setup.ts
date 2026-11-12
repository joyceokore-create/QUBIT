import "server-only";
import { flagEnabled } from "@/lib/flags";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";

/**
 * Per-project setup — the five things a PM does once so the week can run itself: the
 * delivery gates worked (a template is attached to every project by the wizard, so the
 * signal is the first gate state the PM records), a document, a team (a lead counts — the
 * PM is on the team), YouTrack (only while the feature is on) and this week's status
 * update. Counts only; the workspace's "Set up {code}" card reads it.
 */

export interface ProjectSetup {
  gates: boolean;
  documents: boolean;
  team: boolean;
  /** null = YouTrack mirroring is off for this deployment (the row is omitted). */
  youtrack: boolean | null;
  thisWeek: boolean;
  done: number;
  total: number;
}

export async function getProjectSetup(ctx: TenantContext, projectId: string, now = new Date()): Promise<ProjectSetup> {
  const isoWeek = isoWeekId(now);
  const ytOn = flagEnabled("youtrack");
  const [project, gateStates, documents, team, youtrack, checkIn] = await withTenant(ctx, (tx) =>
    Promise.all([
      tx.project.findUnique({ where: { id: projectId }, select: { checkpointTemplateId: true, leadUserId: true, orgStatuses: { where: { retiredAt: null, leadUserId: { not: null } }, select: { id: true }, take: 1 } } }),
      tx.checkpointStatus.count({ where: { projectId, orgUnitId: null, moduleId: null } }),
      tx.projectDocument.count({ where: { projectId } }),
      tx.projectMember.count({ where: { projectId } }),
      ytOn ? tx.projectIntegration.findFirst({ where: { projectId, provider: "youtrack", connected: true }, select: { id: true } }) : Promise.resolve(null),
      tx.checkIn.findFirst({ where: { projectId, isoWeek, status: "Confirmed" }, select: { submittedToHeadAt: true } }),
    ]),
  );
  const items = {
    gates: Boolean(project?.checkpointTemplateId) && gateStates > 0,
    documents: documents > 0,
    team: team > 0 || Boolean(project?.leadUserId) || (project?.orgStatuses.length ?? 0) > 0,
    youtrack: ytOn ? Boolean(youtrack) : null,
    thisWeek: Boolean(checkIn?.submittedToHeadAt),
  };
  const counted = [items.gates, items.documents, items.team, ...(ytOn ? [items.youtrack as boolean] : []), items.thisWeek];
  return { ...items, done: counted.filter(Boolean).length, total: counted.length };
}
