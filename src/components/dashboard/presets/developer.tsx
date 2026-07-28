import Link from "next/link";
import { ArrowRight, CircleCheckBig, Play, ShieldAlert } from "lucide-react";
import type { DevDashboard } from "@/server/dashboard-dev";
import type { MyTaskRow } from "@/server/project-tasks";
import { FirstLoginChecklist } from "@/components/dashboard/presets/first-login-checklist";
import { CARD, Empty, Panel } from "@/components/dashboard/presets/v2-sections";

// Developer preset (docs/17 §4): ONE focus task — a decision made for them — then
// queue buckets, boards, and this week's momentum. Nothing portfolio-level: a developer
// dashboard with an org heatmap is noise.

function taskHref(t: MyTaskRow): string {
  return `/projects/${t.projectId}?tab=Board&task=${t.id}`;
}

function FocusHero({ d }: { d: DevDashboard }) {
  if (!d.focus) {
    return (
      <div className={`${CARD} p-5`} style={{ background: "var(--cardbg)" }}>
        <p className="font-heading text-[17px] font-bold text-[var(--qink)]">Queue clear 🎉</p>
        <p className="mt-1 text-[12.5px] text-[var(--ink3)]">
          Nothing assigned and unblocked right now — check the <Link href="/projects" className="text-[var(--brand)] underline underline-offset-2">boards</Link> or your blocked items below.
        </p>
      </div>
    );
  }
  const t = d.focus;
  return (
    <div className={`${CARD} flex flex-col gap-2.5 p-5`} style={{ background: "var(--cardbg)" }}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[1.4px] text-[var(--brand)]">Work on this now</span>
        <span className="rounded-[5px] bg-[var(--wash2)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[.8px] text-[var(--ink4)]">{d.focusReason}</span>
      </div>
      <p className="font-heading text-[19px] font-bold leading-[1.25] tracking-[-.3px] text-[var(--qink)]">{t.title}</p>
      <p className="font-mono text-[10px] uppercase tracking-[1px] text-[var(--ink4)]">
        {t.projectCode} · {t.projectName} · {t.status}
        {t.dueDate && ` · due ${t.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
      </p>
      <Link
        href={taskHref(t)}
        className="mt-1 flex w-fit items-center gap-2 rounded-[9px] bg-[var(--brand)] px-4 py-2 text-[12.5px] font-bold text-[var(--onbrand)]"
      >
        <Play className="size-3.5" /> Start — open the card
      </Link>
    </div>
  );
}

const BUCKETS: { key: keyof DevDashboard["buckets"]; label: string; tok: string }[] = [
  { key: "overdue", label: "Overdue", tok: "--bad" },
  { key: "dueThisWeek", label: "Due this week", tok: "--warn" },
  { key: "inReview", label: "In review", tok: "--qinfo" },
  { key: "blocked", label: "Blocked", tok: "--bad" },
];

function QueueBuckets({ d }: { d: DevDashboard }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {BUCKETS.map((b) => {
        const rows = d.buckets[b.key];
        return (
          <details key={b.key} className={`${CARD} group`} style={{ background: "var(--cardbg)" }} open={b.key === "overdue" && rows.length > 0}>
            <summary className="flex cursor-pointer list-none items-center gap-2 p-[12px_16px]">
              <span className="font-heading rv:font-data text-[22px] font-bold tabular-nums" style={{ color: rows.length ? `var(${b.tok})` : "var(--ink4)" }}>
                {rows.length}
              </span>
              <span className="font-mono text-[9px] font-medium uppercase tracking-[1.2px] text-[var(--ink4)]">{b.label}</span>
              <ArrowRight className="ml-auto size-3 text-[var(--ink5)] transition-transform group-open:rotate-90" />
            </summary>
            <div className="flex flex-col border-t border-[var(--hair2)]">
              {rows.length === 0 && <Empty>Nothing here.</Empty>}
              {rows.slice(0, 6).map((t) => (
                <Link key={t.id} href={taskHref(t)} className="flex flex-col gap-0.5 border-b border-[var(--hair2)] p-[8px_16px] transition-colors last:border-0 hover:bg-[var(--wash)]">
                  <span className="truncate text-[12px] text-[var(--ink2)]">{t.title}</span>
                  <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[.8px] text-[var(--ink4)]">
                    {t.projectCode}
                    {t.dueDate && ` · ${t.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                    {b.key === "blocked" && t.blockedReason && (
                      <span className="flex min-w-0 items-center gap-1 normal-case text-[var(--bad)]">
                        <ShieldAlert className="size-2.5 flex-none" />
                        <span className="truncate">{t.blockedReason}</span>
                      </span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function DeveloperPreset({ d, userId }: { d: DevDashboard; userId: string }) {
  return (
    <>
      <FirstLoginChecklist group="developer" userId={userId} />
      <FocusHero d={d} />
      <QueueBuckets d={d} />
      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <Panel title="My boards" sub="DEV LENS">
          {d.boards.length ? (
            d.boards.map((b) => (
              <Link key={b.projectId} href={`/projects/${b.projectId}?tab=Board&lens=dev`} className="flex items-center gap-3 border-b border-[var(--hair2)] p-[9px_16px] transition-colors last:border-0 hover:bg-[var(--wash)]">
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--qink)]">{b.name}</span>
                <span className="font-mono text-[9.5px] tabular-nums text-[var(--ink4)]">{b.openMine} open · {b.code}</span>
                <ArrowRight className="size-3 flex-none text-[var(--ink5)]" />
              </Link>
            ))
          ) : (
            <Empty>You&apos;re not on a project yet — ask to join one from /projects.</Empty>
          )}
        </Panel>
        <Panel title="Done this week" sub="MOMENTUM">
          {d.doneThisWeek.length ? (
            d.doneThisWeek.map((t) => (
              <div key={t.id} className="flex items-center gap-2.5 border-b border-[var(--hair2)] p-[8px_16px] last:border-0">
                <CircleCheckBig className="size-3.5 flex-none text-[var(--ok)]" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink2)]">{t.title}</span>
                <span className="font-mono text-[9px] text-[var(--ink4)]">{t.projectCode}</span>
              </div>
            ))
          ) : (
            <Empty>Nothing completed yet this week — the list fills as you ship.</Empty>
          )}
        </Panel>
      </section>
    </>
  );
}
