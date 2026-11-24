import { purgeDecidedAccessRequests } from "@/server/access-requests";
import { getAccessRequestRetentionDays } from "@/server/platform-settings";
import type { SystemJobDefinition } from "@/server/jobs/types";

/**
 * UX fidelity D-F3b — nightly: delete approved and declined access requests decided more than
 * N days ago (N = the Super Admin's setting, default 30). Waiting requests are never deleted.
 * Records the count only, never names or emails.
 */
export const accessRequestRetention: SystemJobDefinition = {
  name: "access-request-retention",
  system: true,
  async run() {
    const days = await getAccessRequestRetentionDays();
    const deleted = await purgeDecidedAccessRequests(days);
    return { days, deleted };
  },
};
