"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { WeekMeter } from "@/components/reports/week-meter";
import { LocalTime } from "@/components/reports/local-time";
import { CARD_GLASS as CARD, CARD_BG, FOCUS, ragFill, ragToken } from "@/lib/surface";
import type { Rag } from "@/server/health";

/**
 * Milestone B — the Head of PMs' inbox: every active project's update for the week,
 * grouped by portfolio. A hollow dot is a project that hasn't sent (its computed RAG is
 * shown); Nudge chases its PMs — once per week, the nudger's dedupe makes sure of that.
 */

export interface InboxRowJson {
  projectId: string;
  code: string;
  name: string;
  pmName: string | null;
  received: boolean;
  rag: Rag;
  line: string | null;
  sentAt: string | null;
  nudgeable: boolean;
}
export interface InboxGroupJson {
  portfolioName: string;
  in: number;
  total: number;
  rows: InboxRowJson[];
}

type NudgeState = "idle" | "sending" | "nudged" | "already" | "in" | { error: string };

const BTN = `inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--input)] bg-background px-3 py-1.5 text-[12.5px] font-semibold text-[var(--qink)] transition-colors hover:text-brand disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;

function stateFrom(d: { created?: number; skipped?: number; targeted?: number } | undefined): NudgeState {
  if (!d) return { error: "Could not nudge." };
  if ((d.targeted ?? 0) === 0) return "in";
  if ((d.created ?? 0) > 0) return "nudged";
  return "already";
}

export function HeadInbox({
  isCurrent,
  canNudge,
  header,
  groups,
}: {
  isoWeek: string;
  isCurrent: boolean;
  canNudge: boolean;
  header: { in: number; total: number; outstanding: number };
  groups: InboxGroupJson[];
}) {
  const [rowState, setRowState] = useState<Record<string, NudgeState>>({});
  const [all, setAll] = useState<"idle" | "busy" | { created: number } | { error: string }>("idle");

  const nudgeAll = async () => {
    setAll("busy");
    const res = await fetch("/api/reports/nudge-unsent", { method: "POST" });
    const d = await res.json().catch(() => null);
    if (!res.ok) return setAll({ error: d?.error?.message ?? "Could not nudge." });
    setAll({ created: d?.data?.created ?? 0 });
    const next: Record<string, NudgeState> = {};
    for (const g of groups) for (const r of g.rows) if (!r.received) next[r.projectId] = (d?.data?.created ?? 0) > 0 ? "nudged" : "already";
    setRowState((p) => ({ ...p, ...next }));
  };

  const nudgeOne = async (projectId: string) => {
    setRowState((p) => ({ ...p, [projectId]: "sending" }));
    const res = await fetch(`/api/projects/${projectId}/checkin/nudge`, { method: "POST" });
    const d = await res.json().catch(() => null);
    setRowState((p) => ({ ...p, [projectId]: res.ok ? stateFrom(d?.data) : { error: d?.error?.message ?? "Could not nudge." } }));
  };

  return (
    <section className={`${CARD} min-w-0 flex-[999_1_520px] overflow-hidden`} style={CARD_BG} aria-labelledby="head-inbox">
      <h2 id="head-inbox" className="sr-only">
        Updates received
      </h2>
      <WeekMeter done={header.in} total={header.total} label={`${header.in} of ${header.total} updates in`} sub={`${header.outstanding} outstanding`} ariaLabel="Updates received this week">
        {isCurrent && canNudge && header.outstanding > 0 && (
          all === "idle" || all === "busy" ? (
            <button type="button" onClick={() => void nudgeAll()} disabled={all === "busy"} className={BTN}>
              <Bell className="size-3.5" aria-hidden /> {all === "busy" ? "Nudging…" : `Nudge all ${header.outstanding}`}
            </button>
          ) : "created" in all ? (
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--ok)]">
              <Check className="size-3.5" aria-hidden /> {all.created > 0 ? `Nudged ${all.created}` : "Already nudged this week"}
            </span>
          ) : (
            <span role="alert" className="text-[12px] text-[var(--bad)]">
              {all.error}
            </span>
          )
        )}
      </WeekMeter>

      {groups.length === 0 ? (
        <p className="p-[14px_18px] text-[12.5px] text-[var(--ink5)]">No active projects this week.</p>
      ) : (
        groups.map((g) => (
          <section key={g.portfolioName} aria-labelledby={`inbox-${g.portfolioName}`}>
            <h3 id={`inbox-${g.portfolioName}`} className="flex items-center gap-2.5 border-b border-[var(--hair2)] bg-[var(--card2)] px-[18px] py-2">
              <span className="text-[12px] font-bold text-[var(--qink)]">{g.portfolioName}</span>
              <span className="text-[12px] text-[var(--ink4)]">
                {g.in} of {g.total} in
              </span>
            </h3>
            {g.rows.map((r) => {
              const st = rowState[r.projectId] ?? "idle";
              return (
                <div
                  key={r.projectId}
                  className="grid grid-cols-[9px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-[var(--hair2)] px-[18px] py-2.5 last:border-0 sm:grid-cols-[9px_minmax(120px,200px)_minmax(140px,1fr)_auto]"
                >
                  <span
                    className="size-[9px] rounded-full"
                    style={r.received ? ragFill(r.rag) : { background: "transparent", border: `1px solid var(${ragToken(r.rag)})` }}
                    role="img"
                    aria-label={r.received ? `Status ${r.rag}` : `Not yet sent — computed ${r.rag}`}
                  />
                  <div className="min-w-0">
                    <Link href={`/projects/${r.projectId}?tab=This%20week`} className={`block truncate rounded-[4px] text-[13px] font-semibold text-[var(--qink)] transition-colors hover:text-brand ${FOCUS}`}>
                      {r.name}
                    </Link>
                    <div className="text-[11.5px] text-[var(--ink4)]">
                      {r.code} · {r.pmName ?? "No PM"}
                    </div>
                  </div>
                  <div className="col-span-full pl-[21px] sm:col-span-1 sm:pl-0">
                    {r.received && r.line ? (
                      <p className="line-clamp-2 text-[12.5px] leading-[1.45] text-[var(--ink2)]">{r.line}</p>
                    ) : (
                      <p className="text-[12.5px] italic text-[var(--ink5)]">{isCurrent ? `Not yet sent — computed ${r.rag} shown` : "Not sent"}</p>
                    )}
                  </div>
                  <div className="col-start-3 row-start-1 justify-self-end sm:col-start-4">
                    {r.received && r.sentAt ? (
                      <span className="whitespace-nowrap text-[11.5px] text-[var(--ink4)]">
                        <LocalTime iso={r.sentAt} format="weekday-time" />
                      </span>
                    ) : !isCurrent || !canNudge ? (
                      <span className="text-[11.5px] text-[var(--ink5)]">—</span>
                    ) : st === "nudged" || st === "already" || st === "in" ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11.5px] font-semibold text-[var(--ok)]" title={st === "nudged" ? "Nudged · again next week" : undefined}>
                        <Check className="size-3" aria-hidden /> {st === "nudged" ? "Nudged" : st === "already" ? "Already nudged" : "Already in"}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void nudgeOne(r.projectId)}
                          disabled={st === "sending" || !r.nudgeable}
                          aria-disabled={!r.nudgeable}
                          title={!r.nudgeable ? "No PM to nudge" : undefined}
                          className={`${BTN} px-2.5 py-1 text-[12px]`}
                        >
                          {st === "sending" ? "Sending…" : "Nudge"}
                        </button>
                        {typeof st === "object" && <span className="text-[10.5px] text-[var(--bad)]">{st.error}</span>}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ))
      )}
    </section>
  );
}
