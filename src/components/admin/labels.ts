import type { UserGroup } from "@/lib/personas";

/**
 * Display labels for dashboard groups (docs/17 §1). Presentation only — these never affect
 * permissions. Single source of truth so the invite dialog, the edit-groups dialog and any
 * future admin surface can't drift apart.
 */
export const GROUP_LABELS: Record<UserGroup, string> = {
  executive: "Executive",
  pm: "PM",
  developer: "Developer",
  qa: "QA",
  implementor: "Implementor",
};
