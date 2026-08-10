"use client";

import { useState } from "react";
import Link from "next/link";
import { CARD, ragChipStyle, ragFill } from "@/lib/surface";

/**
 * M-D2 — the per-project check-in queue, moved off the dashboard and grouped into
 * portfolio tabs. The dashboard now shows only the shape of the week (how many in, how
 * many outstanding) and links here; this is where the Head actually works through them.
 */

export interface QueueRow {
  projectId: string;
  code: string;
  name: string;
  portfolioName: string;
  pmName: string | null;
  latest: { isoWeek: string; status: "Confirmed" | "Draft"; rag: string; sentToHead: boolean } | null;
}

const ALL = "All";

export function CheckinQueue({ rows, isHead }: { rows: QueueRow[]; isHead: boolean }) {
  const portfolios = [...new Set(rows.map((r) => r.portfolioName))].sort();
  const [tab, setTab] = useState<string>(ALL);
  const [outstandingOnly, setOutstandingOnly] = useState(false);

  const outstanding = (r: QueueRow) => r.latest?.status !== "Confirmed";
  const visible = rows
    .filter((r) => tab === ALL || r.portfolioName === tab)
    .filter((r) => !outstandingOnly || outstanding(r));

  const countFor = (name: string) => {
    const set = name === ALL ? rows : rows.filter((r) => r.portfolioName === name);
    return { total: set.length, out: set.filter(outstanding).length };
  };

  return (
    <>
      <p className="text-[12.5px] text-[var(--ink3)]">
        {isHead
          ? "Every active project's latest check-in, grouped by portfolio. Confirming and sending happens in each project's workspace Reports tab."
          : "Your projects' latest check-ins. Confirm and send from each workspace's Reports tab."}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {[ALL, ...portfolios].map((name) => {
          const c = countFor(name);
          const on = tab === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setTab(name)}
              aria-current={on ? "true" : undefined}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
                on ? "bg-[var(--brand)] text-[var(--onbrand)]" : "border border-[var(--w07)] text-[var(--ink3)] hover:text-[var(--qink)]"
              }`}
            >
              {name}
              <span className={`font-mono text-[9.5px] tabular-nums ${on ? "opacity-80" : "text-[var(--ink4)]"}`}>
                {c.out > 0 ? `${c.out}/${c.total}` : c.total}
              </span>
            </button>
          );
        })}
        <label className="ml-auto flex items-center gap-1.5 text-[11.5px] text-[var(--ink3)]">
          <input
            type="checkbox"
            checked={outstandingOnly}
            onChange={(e) => setOutstandingOnly(e.target.checked)}
            className="size-3.5 accent-[var(--brand)]"
          />
          Outstanding only
        </label>
      </div>

      <div className={CARD} style={{ background: "var(--cardbg)" }}>
        {visible.length === 0 ? (
          <p className="p-[12px_16px] text-[12px] text-[var(--ink5)]">
            {outstandingOnly ? "Nothing outstanding here — every check-in is in." : "No projects in this portfolio yet."}
          </p>
        ) : (
          visible.map((r) => (
            <div
              key={r.projectId}
              className="flex flex-wrap items-center gap-2.5 border-b border-[var(--hair2)] p-[10px_16px] last:border-0"
            >
              {r.latest ? (
                <span className="size-2 flex-none rounded-full" style={ragFill(r.latest.rag)} />
              ) : (
                <span className="size-2 flex-none rounded-full border border-[var(--w10)]" />
              )}
              <span className="w-[92px] flex-none font-mono text-[10px] uppercase text-[var(--ink4)]">{r.code}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--qink)]">{r.name}</span>
              {isHead && <span className="flex-none text-[11px] text-[var(--ink4)]">{r.pmName ?? "no PM"}</span>}
              {r.latest ? (
                <>
                  <span className="flex-none font-mono text-[10px] text-[var(--ink4)]">{r.latest.isoWeek.replace("-W", " W")}</span>
                  <span
                    className="flex-none rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px]"
                    style={
                      r.latest.status === "Confirmed"
                        ? { color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 10%, transparent)" }
                        : { color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 10%, transparent)" }
                    }
                  >
                    {r.latest.status}
                  </span>
                  {r.latest.sentToHead && (
                    <span className="flex-none rounded-full px-2 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px]" style={ragChipStyle("Green")}>
                      sent to Head
                    </span>
                  )}
                </>
              ) : (
                <span className="flex-none font-mono text-[9px] uppercase text-[var(--ink5)]">no check-in yet</span>
              )}
              <Link
                href={`/projects/${r.projectId}?tab=Reports`}
                className="flex-none rounded-[7px] border border-[var(--w07)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)]"
              >
                Open →
              </Link>
            </div>
          ))
        )}
      </div>
    </>
  );
}
