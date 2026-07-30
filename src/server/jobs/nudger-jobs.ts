import { applyCandidates, collectCandidates, collectCheckinChase, collectMemberReportChase } from "@/server/nudger";
import type { JobDefinition } from "@/server/jobs/types";

/**
 * Nudger jobs (M3). `nudger` runs weekday mornings over the docs/15 §6.4 matrix;
 * `checkin-chase` runs Monday 10:00 chasing last week's unconfirmed check-ins (§7) AND
 * member weekly reports still unsent (docs/18 §5.1.5) — one Monday sweep, both signals.
 * All are idempotent twice over: the JobRun key dedupes the run, and the Nudge
 * dedupe key (`entityId:signal:isoWeek`) dedupes every ping inside it.
 */

export const nudgerJob: JobDefinition = {
  name: "nudger",
  async run(tx, tenant) {
    const now = new Date();
    const candidates = await collectCandidates(tx, now);
    return applyCandidates(tx, { tenantId: tenant.id, userId: "job:nudger" }, candidates, now);
  },
};

export const checkinChase: JobDefinition = {
  name: "checkin-chase",
  async run(tx, tenant) {
    const now = new Date();
    const candidates = [...(await collectCheckinChase(tx, now)), ...(await collectMemberReportChase(tx, now))];
    return applyCandidates(tx, { tenantId: tenant.id, userId: "job:checkin-chase" }, candidates, now);
  },
};
