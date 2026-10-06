import Link from "next/link";
import { CARD_GLASS as CARD, CARD_BG, FOCUS, ragFill } from "@/lib/surface";
import type { GridGroup } from "@/server/reports-week";

// Milestone B — "Status by project · last 8 weeks": one row per project, eight 22×18
// cells (hollow when that week had no check-in), grouped by portfolio with the chosen
// week's spread. Shared by the executive view and the PM's History tab.

const RAGS = ["Green", "Amber", "Red"] as const;

export function StatusGrid({
  weeks,
  groups,
  hrefFor,
  title = "Status by project · last 8 weeks",
  emptyCopy = "No status updates recorded in these weeks.",
}: {
  weeks: string[];
  groups: GridGroup[];
  hrefFor: (projectId: string) => string;
  title?: string;
  emptyCopy?: string;
}) {
  const last = weeks.length - 1;
  return (
    <section className={`${CARD} overflow-hidden`} style={CARD_BG} aria-labelledby="status-grid">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--hair2)] p-[14px_18px]">
        <h2 id="status-grid" className="text-[15px] font-semibold text-[var(--qink)]">
          {title}
        </h2>
        <ul className="ml-auto flex gap-3 text-[12px] text-[var(--ink3)]">
          {RAGS.map((r) => (
            <li key={r} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={ragFill(r)} aria-hidden />
              {r}
            </li>
          ))}
        </ul>
      </div>
      {groups.length === 0 ? (
        <p className="p-[14px_18px] text-[12.5px] text-[var(--ink3)]">{emptyCopy}</p>
      ) : (
        <div className="overflow-x-auto [scrollbar-width:thin]">
          <div className="min-w-[520px]">
            <div className="grid grid-cols-[minmax(160px,1fr)_auto] items-center gap-x-4 px-[18px] py-1.5 text-[11px] text-[var(--ink4)]">
              <span />
              <ol className="grid grid-cols-[repeat(8,22px)] gap-[3px] text-center" aria-hidden>
                {weeks.map((w, i) => (
                  <li key={w} className={i === last ? "font-bold text-[var(--qink)]" : ""}>
                    {w.split("-W")[1]}
                  </li>
                ))}
              </ol>
            </div>
            {groups.map((g) => {
              const n = g.ragCounts.green + g.ragCounts.amber + g.ragCounts.red || 1;
              return (
                <div key={g.portfolioName}>
                  <h3 className="flex flex-wrap items-center gap-3 border-y border-[var(--hair2)] bg-[var(--card2)] px-[18px] py-1.5">
                    <span className="text-[12px] font-bold text-[var(--qink)]">{g.portfolioName}</span>
                    <span
                      className="flex h-1.5 w-[120px] overflow-hidden rounded-full bg-[var(--wash2)]"
                      role="img"
                      aria-label={`${g.ragCounts.green} green, ${g.ragCounts.amber} amber, ${g.ragCounts.red} red`}
                    >
                      <span style={{ width: `${(g.ragCounts.green / n) * 100}%`, ...ragFill("Green") }} />
                      <span style={{ width: `${(g.ragCounts.amber / n) * 100}%`, ...ragFill("Amber") }} />
                      <span style={{ width: `${(g.ragCounts.red / n) * 100}%`, ...ragFill("Red") }} />
                    </span>
                    <span className="text-[11.5px] text-[var(--ink4)]">
                      {g.ragCounts.green} green · {g.ragCounts.amber} amber · {g.ragCounts.red} red
                    </span>
                  </h3>
                  {g.rows.map((r) => (
                    <Link
                      key={r.projectId}
                      href={hrefFor(r.projectId)}
                      className={`grid grid-cols-[minmax(160px,1fr)_auto] items-center gap-x-4 border-b border-[var(--hair2)] px-[18px] py-[7px] transition-colors hover:bg-[var(--card2)] ${FOCUS}`}
                    >
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="flex-none whitespace-nowrap text-[13px] font-medium text-[var(--qink)]">{r.name}</span>
                        {r.line && <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink5)]">{r.line}</span>}
                      </span>
                      <ol className="grid grid-cols-[repeat(8,22px)] gap-[3px]" aria-label={`${r.name}: last eight weeks`}>
                        {r.cells.map((c, i) => {
                          const wn = c.isoWeek.split("-W")[1];
                          return (
                            <li
                              key={c.isoWeek}
                              className="h-[18px] w-[22px] rounded-[4px]"
                              style={c.rag ? { ...ragFill(c.rag), opacity: i === last ? 1 : 0.75 } : { border: "1px solid var(--input)" }}
                              title={c.rag ? `W${wn} ${c.rag}` : `W${wn} · no check-in`}
                              aria-label={`W${wn}: ${c.rag ?? "no check-in"}`}
                            />
                          );
                        })}
                      </ol>
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
