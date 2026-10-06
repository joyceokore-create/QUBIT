import Link from "next/link";
import { ExportButton } from "@/components/export-button";
import { CARD_GLASS as CARD, CARD_BG, FOCUS, ragChipStyle } from "@/lib/surface";
import type { RollupArchiveRow } from "@/server/portfolio-reports";

// Milestone B — the archive: approved weeks (and the Head's standing Draft), the shared
// weekly snapshots, and the CSV exports — everything the old Roll-ups tab carried.

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function RecentRollups({ rows, isoWeek, hrefForWeek, archiveHref }: { rows: RollupArchiveRow[]; isoWeek: string; hrefForWeek: (w: string) => string; archiveHref: string }) {
  const recent = rows.filter((r) => r.isoWeek !== isoWeek).slice(0, 3);
  return (
    <section className={`${CARD} p-[14px_16px]`} style={CARD_BG} aria-labelledby="recent-rollups">
      <h2 id="recent-rollups" className="mb-2 text-[13.5px] font-semibold text-[var(--qink)]">
        Recent roll-ups
      </h2>
      {recent.length === 0 ? (
        <p className="text-[12.5px] text-[var(--ink5)]">No roll-ups yet.</p>
      ) : (
        <ol className="flex flex-col">
          {recent.map((r) => (
            <li key={r.isoWeek} className="flex items-center gap-2.5 border-t border-[var(--hair2)] py-[7px] text-[12.5px]">
              <Link href={hrefForWeek(r.isoWeek)} className={`w-[34px] flex-none rounded-[4px] font-mono text-[10.5px] font-semibold text-[var(--ink4)] hover:text-brand ${FOCUS}`}>
                W{r.isoWeek.split("-W")[1]}
              </Link>
              <span className="min-w-0 flex-1 truncate text-[var(--ink2)]">{r.narrative ?? <span className="text-[var(--ink5)]">no narrative</span>}</span>
              <a href={`/api/rollup/export?week=${r.isoWeek}`} download className={`rounded-[4px] text-[12px] text-[var(--ink3)] hover:text-brand ${FOCUS}`}>
                CSV
              </a>
            </li>
          ))}
        </ol>
      )}
      <Link href={archiveHref} className={`mt-2 inline-block rounded-[4px] text-[12px] font-semibold text-[var(--ink3)] hover:text-brand ${FOCUS}`}>
        All roll-ups →
      </Link>
    </section>
  );
}

export function RollupArchive({
  rows,
  shares,
  showExports,
  isHead,
  hrefForWeek,
}: {
  rows: RollupArchiveRow[];
  shares: { token: string; title: string; createdAt: Date }[];
  showExports: boolean;
  isHead: boolean;
  hrefForWeek: (w: string) => string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <section className={`${CARD} overflow-hidden`} style={CARD_BG} aria-labelledby="archive">
        <h2 id="archive" className="border-b border-[var(--hair2)] p-[12px_16px] text-[13.5px] font-semibold text-[var(--qink)]">
          Past roll-ups
        </h2>
        {rows.length === 0 ? (
          <p className="p-[12px_16px] text-[12px] text-[var(--ink5)]">
            {isHead ? "No approved roll-ups yet — approve this week's on This week." : "No approved roll-ups yet."}
          </p>
        ) : (
          rows.map((r) => (
            <div key={r.isoWeek} className="flex flex-wrap items-center gap-2.5 border-b border-[var(--hair2)] p-[10px_16px] last:border-0">
              <Link href={hrefForWeek(r.isoWeek)} className={`w-[64px] flex-none rounded-[4px] font-mono text-[10.5px] font-semibold text-[var(--ink4)] hover:text-brand ${FOCUS}`}>
                {r.isoWeek.replace("-W", " W")}
              </Link>
              <span className="flex-none rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={ragChipStyle(r.status === "Approved" ? "Green" : "Amber")}>
                {r.status}
              </span>
              <span className="flex-none font-mono text-[10px] tabular-nums text-[var(--ink4)]">{r.projects} projects</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink2)]">{r.narrative ?? <span className="text-[var(--ink5)]">no narrative yet</span>}</span>
              {r.approvedByName && (
                <span className="flex-none text-[10.5px] text-[var(--ink4)]">
                  signed {r.approvedByName}
                  {r.approvedAt && ` · ${fmt(r.approvedAt)}`}
                </span>
              )}
              <a href={`/api/rollup/export?week=${r.isoWeek}`} download className={`flex-none rounded-[7px] border border-[var(--input)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] ${FOCUS}`}>
                CSV
              </a>
            </div>
          ))
        )}
      </section>

      {shares.length > 0 && (
        <section className={`${CARD} overflow-hidden`} style={CARD_BG} aria-labelledby="snapshots">
          <h2 id="snapshots" className="border-b border-[var(--hair2)] p-[12px_16px] text-[13.5px] font-semibold text-[var(--qink)]">
            Weekly reports <span className="ml-2 text-[11.5px] font-normal text-[var(--ink4)]">shared snapshots</span>
          </h2>
          {shares.map((s) => (
            <div key={s.token} className="flex flex-wrap items-baseline gap-2.5 border-b border-[var(--hair2)] p-[10px_16px] last:border-0">
              <Link href={`/reports/s/${s.token}`} className={`min-w-0 flex-1 truncate rounded-[4px] text-[12px] font-semibold text-[var(--ink2)] hover:text-[var(--qink)] hover:underline ${FOCUS}`}>
                {s.title}
              </Link>
              <span className="flex-none font-mono text-[10px] text-[var(--ink4)]">{fmt(s.createdAt)}</span>
            </div>
          ))}
        </section>
      )}

      {showExports && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-semibold text-[var(--ink4)]">Exports</span>
          <ExportButton href="/api/export?kind=projects" label="Projects CSV" />
          <ExportButton href="/api/export?kind=risks" label="Risks CSV" />
          <ExportButton href="/api/export?kind=allocations" label="Allocations CSV" />
        </div>
      )}
    </div>
  );
}
