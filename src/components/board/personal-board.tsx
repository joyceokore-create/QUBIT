"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { FilterSelect } from "@/components/list/list-toolbar";
import { Chip } from "@/components/ui/status-pill";
import { CARD, CARD_BG } from "@/lib/surface";
import { cn } from "@/lib/utils";

// The personal board (docs/18 §4): lanes To do · Doing · Done as VIEWS over the
// 5-status taxonomy (docs/15 6.1 untouched) — Doing wears an InProgress/InReview/InQA
// sub-badge. Grouped by project with an All tab; assigned tasks carry "added by <name>";
// lane moves notify the reporter (server-side, via the outbox). Completion rules by
// type: Feature/Bug hand to QA (the option here is "In QA — hand to QA"); ad-hoc types
// complete directly. Default view, never a wall — project boards stay for triage.

interface BoardTask {
  id: string;
  title: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  status: string;
  type: string;
  blocked: boolean;
  blockedReason: string | null;
  addedBy: string | null;
  /** M7-C — mirrored from YouTrack: read-only here, edited there. */
  sourceSystem: string | null;
  externalKey: string | null;
  externalUrl: string | null;
  dueDate: string | null;
  updatedAt?: string;
}

const DOING = ["InProgress", "InReview", "InQA"];
const LANES = [
  { key: "todo", label: "To Do", statuses: ["NotStarted"] },
  { key: "doing", label: "In Progress", statuses: DOING },
  { key: "done", label: "Done This Week", statuses: ["Completed"] },
] as const;

/** Allowed moves per docs/18 §4 — QA owns Completed for Feature/Bug. */

export function PersonalBoard({ viewerName: _viewerName }: { viewerName: string }) {
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [projectTab, setProjectTab] = useState<string>("all");

  const load = useCallback(async () => {
    const d = await fetch("/api/board").then((r) => r.json()).catch(() => null);
    if (d?.data) setTasks(d.data);
  }, []);

  useEffect(() => {
    void load();
    // Both sides of a handoff update without refresh (docs/18 §10) — task events
    // ride the tenant SSE stream.
    const es = new EventSource("/api/events");
    const onTask = () => void load();
    for (const t of ["task.assigned", "task.status_changed", "task.completed", "task.ready_for_qa"]) {
      es.addEventListener(t, onTask);
    }
    return () => es.close();
  }, [load]);

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) map.set(t.projectId, `${t.projectName}`);
    return [...map.entries()];
  }, [tasks]);

  const visible = projectTab === "all" ? tasks : tasks.filter((t) => t.projectId === projectTab);


  // "Done This Week": completed tasks last updated since Monday (local), the closest signal
  // to completion time the board carries.
  const monday = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  })();
  const due = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <FilterSelect label="Project" allLabel="All projects" value={projectTab === "all" ? "" : projectTab} options={projects.map(([id, name]) => ({ value: id, label: name }))} onChange={(v) => setProjectTab(v || "all")} />
      </div>

      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-3">
        {LANES.map((lane) => {
          const laneTasks = visible
            .filter((t) => (lane.statuses as readonly string[]).includes(t.status))
            .filter((t) => lane.key !== "done" || !t.updatedAt || new Date(t.updatedAt).getTime() >= monday);
          return (
            // Designer, 12 Nov 2026: lanes are standard cards (white, card shadow); tasks inside are flat
            // grey tiles (no border, no shadow) that step darker on hover — one elevation level.
            <section key={lane.key} aria-label={lane.label} className={cn(CARD, "flex min-h-[180px] flex-col gap-2 p-3.5")} style={CARD_BG}>
              <div className="flex items-center justify-between px-0.5 pb-0.5 text-[13px]">
                <b className="font-bold text-[var(--ds-ink)]">{lane.label}</b>
                <span className="rounded-full bg-[var(--ds-mutedw)] px-[7px] text-[11px] font-bold tabular-nums text-[var(--ds-ink2)]">{laneTasks.length}</span>
              </div>
              {laneTasks.length === 0 && <p className="px-1 py-2 text-[12px] text-[var(--ds-ink3)]">{lane.key === "done" ? "Nothing finished yet this week." : "Nothing here."}</p>}
              {laneTasks.map((t) => (
                <article key={t.id} className="flex flex-col gap-[3px] rounded-[11px] bg-[var(--ds-surface2)] px-3 py-2.5 transition-colors hover:bg-[var(--ds-thead)]">
                  <Link href={`/projects/${t.projectId}?tab=Board&task=${t.id}`} className="rounded-[3px] text-[13px] font-semibold leading-[1.35] text-[var(--ds-ink)] hover:underline">
                    {t.title}
                  </Link>
                  <span className="text-[12px] text-[var(--ds-ink3)]">
                    {t.projectName}
                    {t.type !== "Feature" ? ` · ${t.type}` : ""}
                    {t.addedBy ? ` · added by ${t.addedBy}` : ""}
                  </span>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11.5px] text-[var(--ds-ink3)]">
                    <span className="flex items-center gap-1.5">
                      {t.blocked ? (
                        <Chip tone="bad">Blocked</Chip>
                      ) : lane.key === "doing" ? (
                        <Chip tone={t.status === "InProgress" ? "info" : "vio"}>{t.status === "InQA" ? "With QA" : t.status === "InReview" ? "In review" : "In progress"}</Chip>
                      ) : null}
                      {t.externalKey && (
                        <a href={t.externalUrl ?? undefined} target="_blank" rel="noreferrer noopener" title="Open in YouTrack, where this task is moved" className="inline-flex items-center gap-0.5 rounded-[4px] hover:text-[var(--ds-brand-ink)]">
                          {t.externalKey}
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      )}
                    </span>
                    <span>{t.dueDate ? due(t.dueDate) : ""}</span>
                  </div>
                  {t.blocked && t.blockedReason && (
                    <p className="flex items-center gap-1 text-[11.5px] text-[var(--ds-bad-text)]">
                      <ShieldAlert className="size-3 flex-none" aria-hidden /> {t.blockedReason}
                    </p>
                  )}
                </article>
              ))}
            </section>
          );
        })}
      </div>
      <p className="text-[12px] text-[var(--ds-ink3)]">Tasks move in YouTrack and this board follows. Flag anything stuck as blocked from the project board.</p>
    </div>
  );
}
