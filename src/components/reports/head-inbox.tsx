"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Bell, Upload } from "lucide-react";
import { LocalTime } from "@/components/reports/local-time";
import { CARD, CARD_BG, COMPACT } from "@/lib/surface";
import { Chip } from "@/components/ui/status-pill";
import { Meter } from "@/components/ui/kpi-charts";
import { ListGroup, ListRow } from "@/components/ui/panel";
import type { Rag } from "@/server/health";

/**
 * Milestone B — the Head's inbox: every active project's update for the week,
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


function stateFrom(d: { created?: number; skipped?: number; targeted?: number } | undefined): NudgeState {
  if (!d) return { error: "Could not nudge." };
  if ((d.targeted ?? 0) === 0) return "in";
  if ((d.created ?? 0) > 0) return "nudged";
  return "already";
}

export function HeadInbox({
  isCurrent,
  canNudge,
  canUpload = false,
  header,
  groups,
}: {
  isoWeek: string;
  isCurrent: boolean;
  canNudge: boolean;
  /** Heads run projects too (and may fill any project): the same door as the PM queue. */
  canUpload?: boolean;
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
    <section className={`${CARD} flex min-w-0 flex-[999_1_520px] flex-col gap-3 px-[18px] py-4`} style={CARD_BG} aria-labelledby="head-inbox">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="head-inbox" className="text-[16px] font-bold text-[var(--ds-ink)]">
          Updates Received This Week · {header.in} of {header.total}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {canUpload && isCurrent && (
            <Link href="/reports/update" className={COMPACT} title="Every project on one page, or prefill it from a status report">
              <Upload className="size-3.5" aria-hidden /> Update All My Projects
            </Link>
          )}
          {isCurrent && canNudge && header.outstanding > 0 &&
            (all === "idle" || all === "busy" ? (
              <button type="button" onClick={() => void nudgeAll()} disabled={all === "busy"} className={COMPACT}>
                <Bell className="size-3.5" aria-hidden /> {all === "busy" ? "Nudging…" : `Nudge All ${header.outstanding}`}
              </button>
            ) : "created" in all ? (
              <Chip tone="info">{all.created > 0 ? `Nudged ${all.created}` : "Already nudged this week"}</Chip>
            ) : (
              <span role="alert" className="text-[12px] font-semibold text-[var(--ds-bad-text)]">
                {all.error}
              </span>
            ))}
        </div>
      </div>
      <Meter value={header.in} max={Math.max(header.total, 1)} tone="ok" />

      {groups.length === 0 ? (
        <p className="text-[12.5px] text-[var(--ds-ink3)]">No active projects this week.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {groups.map((g) => (
            <Fragment key={g.portfolioName}>
              <ListGroup>
                {g.portfolioName} · {g.in} of {g.total} in
              </ListGroup>
              {g.rows.map((r) => {
                const st = rowState[r.projectId] ?? "idle";
                const chip = r.received ? <Chip tone="ok">Sent</Chip> : st === "nudged" || st === "already" ? <Chip tone="info">Nudged</Chip> : <Chip>Not sent</Chip>;
                const action =
                  r.received && r.sentAt ? (
                    <Link href={`/projects/${r.projectId}?tab=This%20week`} className={COMPACT}>
                      Open
                    </Link>
                  ) : !isCurrent || !canNudge || st === "nudged" || st === "already" || st === "in" ? (
                    <Link href={`/projects/${r.projectId}?tab=This%20week`} className={COMPACT}>
                      Open
                    </Link>
                  ) : (
                    <button type="button" onClick={() => void nudgeOne(r.projectId)} disabled={st === "sending" || !r.nudgeable} aria-disabled={!r.nudgeable} title={!r.nudgeable ? "No PM to nudge" : undefined} className={COMPACT}>
                      {st === "sending" ? "Sending…" : "Nudge"}
                    </button>
                  );
                return (
                  <ListRow
                    key={r.projectId}
                    title={r.name}
                    sub={r.received && r.line ? r.line : `${r.pmName ?? "No PM"} · ${isCurrent ? `not yet sent, computed ${statusWord(r.rag)} shown` : "not sent"}`}
                    chip={chip}
                    meta={r.received && r.sentAt ? <LocalTime iso={r.sentAt} format="weekday-time" /> : typeof st === "object" ? <span className="text-[var(--ds-bad-text)]">{st.error}</span> : r.pmName ?? ""}
                    action={action}
                  />
                );
              })}
            </Fragment>
          ))}
        </ul>
      )}
    </section>
  );
}

function statusWord(rag: string): string {
  return rag === "Green" ? "on track" : rag === "Amber" ? "at risk" : rag === "Red" ? "off track" : "not rated";
}
