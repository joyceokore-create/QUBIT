// Client-safe presentation map for checkpoint states — the ONE copy (DM1.73; it was
// previously duplicated verbatim in checkpoint-matrix.tsx and the market track page).
export const CHECKPOINT_STATE_TOK: Record<string, string> = {
  Done: "--ok",
  InProgress: "--qinfo",
  Blocked: "--bad",
  NotStarted: "--ink4",
};
export const CHECKPOINT_STATE_LABEL: Record<string, string> = {
  Done: "Done",
  InProgress: "In progress",
  Blocked: "Blocked",
  NotStarted: "Not started",
};
