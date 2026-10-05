import { weekWindow } from "@/lib/iso-week";
import { RAG_TOKEN } from "@/lib/surface";
import type { MyWeekRow } from "@/server/my-week";

// The week cockpit (docs/38) — the shape of the PM's reporting week in one glance,
// BEFORE they work the queue: how far the ritual has got (a segmented meter — the
// filled part is done, the track remainder is what's left), and the RAG spread across
// the projects they're answering for. Pure render, no client JS.

/** Workflow states of the weekly act, in the order the meter fills them. These are
 * deliberately NOT RAG colours for the pending state: RAG is a separate, labelled
 * group on the right, so the two vocabularies never collide. */
const STATES = [
  { key: "reported", label: "Reported", tok: "--ok" },
  { key: "confirmed", label: "Confirmed, not sent", tok: "--qinfo" },
] as const;

function stageOf(r: MyWeekRow): "reported" | "confirmed" | "pending" {
  if (r.confirmed && r.sentToHead) return "reported";
  if (r.confirmed) return "confirmed";
  return "pending";
}

/** "6–10 Oct" or "29 Sep – 3 Oct" — the working week the report speaks about. */
function weekRange(now: Date): string {
  const { start } = weekWindow(now);
  const fri = new Date(start.getTime() + 4 * 86_400_000);
  const day = (d: Date) => d.getUTCDate();
  const mon = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return mon(start) === mon(fri) ? `${day(start)}–${day(fri)} ${mon(fri)}` : `${day(start)} ${mon(start)} – ${day(fri)} ${mon(fri)}`;
}

export function WeekCockpit({ isoWeek, scope, rows }: { isoWeek: string; scope: "owned" | "oversight"; rows: MyWeekRow[] }) {
  const total = rows.length;
  const counts = { reported: 0, confirmed: 0, pending: 0 };
  const rag: Record<string, number> = { Green: 0, Amber: 0, Red: 0 };
  for (const r of rows) {
    counts[stageOf(r)] += 1;
    if (r.effectiveRag in rag) rag[r.effectiveRag] += 1;
  }
  const weekNo = isoWeek.split("-W")[1] ?? isoWeek;
  const range = weekRange(new Date());
  const scopeLabel = scope === "owned" ? "Your projects" : "Across the estate";

  return (
    <header className="flex flex-col gap-4 [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <h1 className="font-heading text-[26px] rv:text-heading-lg font-bold tracking-[-.7px] text-[var(--qink)]">My week</h1>
          <p className="mt-1 text-[13px] rv:text-body-sm text-[var(--ink3)]">
            {total === 0 ? (
              <>Nothing to report this week.</>
            ) : counts.pending > 0 ? (
              <>
                <b className="font-semibold text-[var(--qink)]">
                  {counts.pending} to report
                </b>
                {" · "}
                {counts.reported} of {total} reported
              </>
            ) : counts.confirmed > 0 ? (
              <>
                <b className="font-semibold text-[var(--qink)]">
                  {counts.confirmed} confirmed, waiting to send
                </b>
                {" · "}
                {counts.reported} of {total} reported
              </>
            ) : (
              <>
                <b className="font-semibold text-[var(--ok)]">All {total} reported</b> — the Head has this week.
              </>
            )}
          </p>
        </div>
        <p className="flex items-baseline gap-2 text-[12px] text-[var(--ink3)]">
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[1.4px] text-[var(--ink4)]">Week {weekNo}</span>
          <span className="tabular-nums">{range}</span>
          <span className="text-[var(--ink5)]">·</span>
          <span>{scopeLabel}</span>
        </p>
      </div>

      {total > 0 && (
        <div className="flex flex-col gap-2.5">
          {/* Ritual meter: filled = done, remainder of the track = still to report. */}
          <div
            role="progressbar"
            aria-label="Weekly reporting progress"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={counts.reported}
            aria-valuetext={`${counts.reported} of ${total} reported, ${counts.confirmed} confirmed but not sent, ${counts.pending} still to report`}
            className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--wash2)]"
          >
            {STATES.map((s) => {
              const n = counts[s.key];
              if (!n) return null;
              return (
                <span
                  key={s.key}
                  className="h-full first:rounded-l-full transition-[width] duration-500 ease-out"
                  style={{ width: `${(n / total) * 100}%`, background: `var(${s.tok})` }}
                />
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[var(--ink3)]">
              {STATES.map((s) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: `var(${s.tok})` }} aria-hidden />
                  <b className="font-semibold tabular-nums text-[var(--qink)]">{counts[s.key]}</b> {s.label}
                </li>
              ))}
              <li className="flex items-center gap-1.5">
                <span className="size-2 rounded-full border border-[var(--ink5)]" aria-hidden />
                <b className="font-semibold tabular-nums text-[var(--qink)]">{counts.pending}</b> To report
              </li>
            </ul>

            {/* RAG tally — labelled chips, never bare dots, so it can't be read as the meter. */}
            <ul className="ml-auto flex items-center gap-1.5" aria-label="Status across these projects">
              {(["Green", "Amber", "Red"] as const).map((g) => {
                const n = rag[g];
                if (!n) return null;
                const tok = RAG_TOKEN[g];
                return (
                  <li
                    key={g}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[.6px]"
                    style={{ color: `var(${tok})`, background: `color-mix(in oklab, var(${tok}) 10%, transparent)` }}
                  >
                    <span className="tabular-nums text-[11.5px]">{n}</span> {g}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </header>
  );
}
