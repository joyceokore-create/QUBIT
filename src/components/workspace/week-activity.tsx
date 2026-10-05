"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ShieldAlert, RefreshCw } from "lucide-react";
import { CARD_GLASS as CARD } from "@/lib/surface";

/**
 * "This week" task feed — the evidence the weekly report is drafted from. Read-only
 * mirror of what moved on the tracker this reporting week (done / in progress /
 * in review / blocked / open), grouped with counts. Work moves in YouTrack (or on the
 * full board for native tasks); this reflects it. Built from ProjectTask state
 * (lastActivityAt + status), NOT domain events — so YouTrack-mirrored work counts.
 */

interface TaskJson {
  id: string;
  title: string;
  status: string;
  type: string;
  taskKey: string | null;
  assigneeName: string | null;
  externalAssigneeName: string | null;
  blocked: boolean;
  sourceSystem: string | null;
  externalKey: string | null;
  externalUrl: string | null;
  lastActivityAt: string;
  approvalStatus: string;
}

const GROUPS = [
  { key: "done", label: "Done", tok: "--ok" },
  { key: "inprogress", label: "In progress", tok: "--qinfo" },
  { key: "review", label: "In review / QA", tok: "--qinfo" },
  { key: "blocked", label: "Blocked", tok: "--bad" },
  { key: "open", label: "Open", tok: "--ink4" },
] as const;
type GroupKey = (typeof GROUPS)[number]["key"];

/** ISO week start (Monday 00:00, local) — the week the report speaks about. */
function weekStart(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  return d;
}

function groupOf(t: TaskJson): GroupKey | null {
  if (t.status === "Completed") return "done";
  if (t.blocked) return "blocked";
  if (t.status === "InProgress") return "inprogress";
  if (t.status === "InReview" || t.status === "InQA") return "review";
  if (t.status === "NotStarted") return "open";
  return null;
}

export function WeekActivity({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<TaskJson[] | null>(null);
  const [mirrored, setMirrored] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${projectId}/tasks`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setTasks((d?.tasks ?? []) as TaskJson[]);
        setMirrored(Boolean(d?.mirrored));
      })
      .catch(() => alive && setTasks([]));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const grouped = useMemo(() => {
    const start = weekStart();
    const out = new Map<GroupKey, TaskJson[]>(GROUPS.map((g) => [g.key, []]));
    for (const t of tasks ?? []) {
      if (t.approvalStatus === "Draft") continue;
      const g = groupOf(t);
      if (!g) continue;
      const movedThisWeek = new Date(t.lastActivityAt) >= start;
      // Blocked work stays visible however old — a stuck task is never "last week's news".
      if (!movedThisWeek && g !== "blocked") continue;
      out.get(g)!.push(t);
    }
    return out;
  }, [tasks]);

  if (tasks === null) {
    return (
      <div className={`${CARD} flex items-center gap-2 p-6 text-[12px] text-[var(--ink4)]`} style={{ background: "var(--cardbg)" }}>
        <RefreshCw className="size-3.5 animate-spin" /> Loading this week&apos;s activity…
      </div>
    );
  }

  const total = [...grouped.values()].reduce((n, l) => n + l.length, 0);

  return (
    <section className={`${CARD} overflow-hidden`} style={{ background: "var(--cardbg)" }}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--hair2)] p-[12px_16px]">
        <h2 className="font-heading text-[14px] rv:text-heading-xs font-bold text-[var(--qink)]">This week&apos;s tasks</h2>
        <span className="flex flex-wrap items-baseline gap-x-2.5">
          {GROUPS.map((g) => {
            const c = grouped.get(g.key)!.length;
            return (
              <span key={g.key} className="font-mono text-[9.5px] uppercase tracking-[.7px] tabular-nums" style={{ color: c ? `var(${g.tok})` : "var(--ink5)" }}>
                <b className="text-[12px]">{c}</b> {g.label}
              </span>
            );
          })}
        </span>
        <span className="ml-auto text-[10px] text-[var(--ink5)]">
          {mirrored ? "Mirrored from YouTrack — the report drafts from this" : "Read-only — edit tasks on the board"}
        </span>
      </header>

      {total === 0 ? (
        <div className="p-6 text-center">
          <p className="text-[12.5px] font-semibold text-[var(--qink)]">A quiet week so far.</p>
          <p className="mt-1 text-[11px] text-[var(--ink4)]">
            {mirrored ? "Nothing on the tracker moved this week — activity appears here as it syncs." : "Nothing moved this week yet."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {GROUPS.map((g) => {
            const list = grouped.get(g.key)!;
            if (!list.length) return null;
            return (
              <div key={g.key} className="border-b border-[var(--hair2)] last:border-0">
                <div className="flex items-baseline gap-2 p-[8px_16px_4px]">
                  <span className="size-1.5 rounded-full" style={{ background: `var(${g.tok})` }} aria-hidden />
                  <span className="font-mono text-[9.5px] font-bold uppercase tracking-[.8px]" style={{ color: `var(${g.tok})` }}>{g.label}</span>
                  <span className="font-mono text-[9.5px] tabular-nums text-[var(--ink5)]">{list.length}</span>
                </div>
                <ul>
                  {list.map((t) => {
                    const key = t.externalKey ?? t.taskKey;
                    const who = t.assigneeName ?? t.externalAssigneeName;
                    return (
                      <li key={t.id} className="flex items-center gap-2.5 p-[6px_16px] transition-colors hover:bg-[var(--wash)]">
                        {key && <span className="flex-none font-mono text-[10px] font-bold tabular-nums text-[var(--ink4)]">{key}</span>}
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--qink)]">{t.title}</span>
                        {t.blocked && g.key !== "blocked" && <ShieldAlert className="size-3 flex-none text-[var(--bad)]" aria-label="Blocked" />}
                        {t.type !== "Feature" && (
                          <span className="hidden flex-none rounded-[4px] bg-[var(--wash2)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[.6px] text-[var(--ink4)] sm:inline">
                            {t.type}
                          </span>
                        )}
                        {who && <span className="hidden flex-none text-[11px] text-[var(--ink4)] md:block">{who}</span>}
                        {t.externalUrl && (
                          <a
                            href={t.externalUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="flex-none text-[var(--ink4)] transition-colors hover:text-brand"
                            aria-label={`Open ${key ?? t.title} in YouTrack`}
                          >
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
