import { withTenant } from "@/lib/tenant";
import { flagEnabled } from "@/lib/flags";
import { SOURCE_SYSTEM, syncProject } from "@/server/connectors/youtrack-sync";
import type { NetworkJobDefinition } from "@/server/jobs/types";

/**
 * Polls every YouTrack-connected project on its own schedule (BRD FR-INT-05 —
 * "polls on a configurable schedule and creates/updates linked tasks").
 *
 * `ownsTransaction: true`: this job talks to a third party, so the dispatcher must not hold
 * a Postgres transaction open across the round trip. It opens its own short transactions
 * through syncProject.
 *
 * One project's failure never stops the others — a wrong token on one project must not
 * stall the whole tenant's sync. Each failure is recorded per project and on the
 * integration row itself, where the config panel shows it.
 */
export const youtrackSync: NetworkJobDefinition = {
  name: "youtrack-sync",
  ownsTransaction: true,
  async run(ctx) {
    if (!flagEnabled("youtrack")) return { skipped: true, reason: "FEATURE_YOUTRACK is off" };

    const now = Date.now();
    // Due = never synced, or older than the project's own interval. Read here rather than
    // inside syncProject so the schedule is one decision in one place.
    const due = await withTenant(ctx, async (tx) => {
      const rows = await tx.projectIntegration.findMany({
        where: { provider: SOURCE_SYSTEM, connected: true, secret: { not: null }, resource: { not: null } },
        select: { projectId: true, lastSyncAt: true, syncIntervalMinutes: true },
        orderBy: { projectId: "asc" },
      });
      return rows
        .filter((r) => !r.lastSyncAt || now - r.lastSyncAt.getTime() >= r.syncIntervalMinutes * 60_000)
        .map((r) => r.projectId);
    });
    if (!due.length) return { projects: 0, reason: "none due" };

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const failures: Record<string, string> = {};
    for (const projectId of due) {
      try {
        const r = await syncProject(ctx, projectId);
        created += r.created;
        updated += r.updated;
        unchanged += r.unchanged;
      } catch (e) {
        failures[projectId] = e instanceof Error ? e.message : String(e);
      }
    }
    return {
      projects: due.length,
      created,
      updated,
      unchanged,
      ...(Object.keys(failures).length ? { failures } : {}),
    };
  },
};
