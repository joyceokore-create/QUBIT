"use client";

import { useCallback, useState } from "react";
import type { CheckInJson } from "@/components/panels/project-panel-json";

/**
 * Milestone A — this week's check-in for the workspace. Seeded from the page's
 * server-computed copy (ProjectPanelJson.checkin), so the header chips and the status
 * card never fetch on mount; `reload()` re-reads after a mutation elsewhere, and the
 * card's own actions set the response straight in via `setCi`.
 */
export function useCheckIn(projectId: string, initial: CheckInJson | null) {
  const [ci, setCi] = useState<CheckInJson | null>(initial);
  const reload = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/checkin`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (d?.data) setCi(d.data as CheckInJson);
  }, [projectId]);
  return { ci, setCi, reload };
}
