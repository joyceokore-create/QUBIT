// M-P3c (docs/34 §1) — the roll-up CSV export, pure so the quoting is unit-testable.
// CSV is what ships NOW; server-rendered PDF stays deferred with M9-B and every surface
// says so rather than faking a button.
import type { RollupRow } from "@/server/portfolio-reports";

function esc(v: string | null | undefined): string {
  const s = v ?? "";
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rollupCsv(isoWeek: string, rows: RollupRow[]): string {
  const header = "week,code,project,pm,rag,check_in,sent_to_head,narrative";
  const lines = rows.map((r) =>
    [
      isoWeek,
      esc(r.code),
      esc(r.name),
      esc(r.pmName),
      r.rag,
      r.checkIn,
      r.submittedToHead ? "yes" : "no",
      esc(r.narrative),
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}
