import Link from "next/link";
import { ExecTopCard } from "@/components/reports/exec-top-card";
import { StatusGrid } from "@/components/reports/status-grid";
import { CARD_GLASS as CARD, CARD_BG, FOCUS } from "@/lib/surface";
import type { ExecWeekView, WeekMeta } from "@/server/reports-week";

// Milestone B — the executive's week: the signed line, status by project over eight
// weeks, the week's spread in three tiles with one sentence of reading, and the
// blockers that are waiting on a decision.

const TILE: Record<"green" | "amber" | "red", { bg: string; fg: string; label: string }> = {
  green: { bg: "var(--okbg)", fg: "var(--ok)", label: "Green" },
  amber: { bg: "var(--warnbg)", fg: "var(--warn)", label: "Amber" },
  red: { bg: "var(--badbg)", fg: "var(--bad)", label: "Red" },
};

export function ExecWeek({ data, week, subscribed, emailEnabled }: { data: ExecWeekView; week: WeekMeta; subscribed: boolean; emailEnabled: boolean }) {
  const computed = data.grid.reduce((n, g) => n + g.ragCounts.computed, 0);
  return (
    <div className="flex flex-col gap-5">
      <ExecTopCard
        isoWeek={week.isoWeek}
        approved={
          data.approved
            ? { narrative: data.approved.narrative, approvedByName: data.approved.approvedByName, approvedAt: data.approved.approvedAt?.toISOString() ?? null }
            : null
        }
        inCount={{ in: data.tiles.total - computed, total: data.tiles.total }}
        subscribed={subscribed}
        emailEnabled={emailEnabled}
      />
      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[999_1_520px]">
          <StatusGrid weeks={data.weeks} groups={data.grid} hrefFor={(id) => `/projects/${id}?tab=This%20week`} />
        </div>
        <aside className="flex flex-[1_1_300px] flex-col gap-4">
          <section className={`${CARD} p-[14px_16px]`} style={CARD_BG} aria-labelledby="exec-tiles">
            <h2 id="exec-tiles" className="mb-3 text-[13.5px] font-semibold text-[var(--qink)]">
              This week across {data.tiles.total} {data.tiles.total === 1 ? "project" : "projects"}
            </h2>
            <ul className="grid grid-cols-3 gap-2 text-center">
              {(["green", "amber", "red"] as const).map((k) => (
                <li key={k} className="rounded-[10px] px-1.5 py-3" style={{ background: TILE[k].bg }}>
                  <span className="block text-[26px] font-bold leading-none tabular-nums" style={{ color: TILE[k].fg }}>
                    {data.tiles[k]}
                  </span>
                  <span className="mt-1 block text-[11.5px] font-semibold text-[var(--ink3)]">{TILE[k].label}</span>
                </li>
              ))}
            </ul>
            {data.delta && <p className="mt-3 text-[12.5px] text-[var(--ink3)]">{data.delta}</p>}
          </section>
          <section className={`${CARD} p-[14px_16px]`} style={CARD_BG} aria-labelledby="exec-decisions">
            <h2 id="exec-decisions" className="mb-2 text-[13.5px] font-semibold text-[var(--qink)]">
              Blockers needing a decision
            </h2>
            {data.decisions.length === 0 ? (
              <p className="text-[12.5px] text-[var(--ink5)]">Nothing is waiting on a decision this week.</p>
            ) : (
              <ul className="flex flex-col">
                {data.decisions.map((d) => (
                  <li key={d.id}>
                    <Link href={`/projects/${d.projectId}?tab=Register`} className={`block rounded-[4px] border-t border-[var(--hair2)] py-2 ${FOCUS}`}>
                      <p className="text-[13px] text-[var(--qink)]">{d.description}</p>
                      <p className="mt-0.5 text-[11.5px] text-[var(--ink4)]">
                        {d.projectName} · <b style={d.escalated ? { color: "var(--bad)" } : undefined}>{d.ageDays} days</b>
                        {d.severity === "Critical" && " · Critical"}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
