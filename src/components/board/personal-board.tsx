"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldAlert, UserRound } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  dueDate: string | null;
}

const DOING = ["InProgress", "InReview", "InQA"];
const LANES = [
  { key: "todo", label: "To do", statuses: ["NotStarted"] },
  { key: "doing", label: "Doing", statuses: DOING },
  { key: "done", label: "Done", statuses: ["Completed"] },
] as const;

/** Allowed moves per docs/18 §4 — QA owns Completed for Feature/Bug. */
function statusOptions(t: BoardTask): { value: string; label: string }[] {
  const base = [
    { value: "NotStarted", label: "To do" },
    { value: "InProgress", label: "Doing" },
    { value: "InReview", label: "In review" },
    { value: "InQA", label: "In QA — hand to QA" },
  ];
  if (["Feature", "Bug"].includes(t.type)) return base; // Completed comes from QA
  return [...base, { value: "Completed", label: "Done" }];
}

export function PersonalBoard({ viewerName }: { viewerName: string }) {
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [projectTab, setProjectTab] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);

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

  const move = async (task: BoardTask, status: string) => {
    setError(null);
    const prev = task.status;
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status } : t))); // optimistic
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status: prev } : t)));
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not move the task.");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Project tabs — grouping, not a wall. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {([["all", "All"], ...projects] as [string, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setProjectTab(id)}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
              projectTab === id
                ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] text-[var(--brand)]"
                : "border-[var(--w08)] text-[var(--ink3)] hover:text-[var(--qink)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="text-[11.5px] text-[var(--bad)]">{error}</p>}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {LANES.map((lane) => {
          const laneTasks = visible
            .filter((t) => (lane.statuses as readonly string[]).includes(t.status))
            .slice(0, lane.key === "done" ? 15 : undefined);
          return (
            <div key={lane.key} className="flex min-h-[180px] flex-col gap-2 rounded-[14px] border border-[var(--cardbd)] bg-[var(--wash)] p-2.5">
              <div className="flex items-baseline gap-2 px-1">
                <span className="font-heading text-[12.5px] font-bold text-[var(--qink)]">{lane.label}</span>
                <span className="font-mono text-[9.5px] tabular-nums text-[var(--ink4)]">{laneTasks.length}</span>
                {lane.key === "done" && <span className="font-mono text-[8px] uppercase tracking-[.8px] text-[var(--ink5)]">feeds your weekly report</span>}
              </div>
              {laneTasks.length === 0 && <p className="px-1 text-[11px] text-[var(--ink5)]">Empty.</p>}
              {laneTasks.map((t) => (
                <div key={t.id} className="flex flex-col gap-1.5 rounded-[10px] border border-[var(--w06)] bg-[var(--qcard)] p-2.5">
                  <Link href={`/projects/${t.projectId}?tab=Board&task=${t.id}`} className="text-[12.5px] font-semibold leading-[1.35] text-[var(--qink)] hover:text-brand">
                    {t.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[.6px] text-[var(--ink4)]">
                    <span>{t.projectCode}</span>
                    {t.type !== "Feature" && <span>· {t.type}</span>}
                    {t.dueDate && <span>· due {new Date(t.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
                    {lane.key === "doing" && DOING.includes(t.status) && (
                      <span className="rounded-[4px] bg-[var(--wash2)] px-1 py-0.5 text-[var(--qinfo)]">
                        {t.status === "InQA" ? "with QA" : t.status === "InReview" ? "in review" : "in progress"}
                      </span>
                    )}
                    {t.addedBy && (
                      <span className="flex items-center gap-0.5 normal-case text-[var(--ink3)]" title={`Assigned by ${t.addedBy}`}>
                        <UserRound className="size-2.5" /> added by {t.addedBy}
                      </span>
                    )}
                  </div>
                  {t.blocked && t.blockedReason && (
                    <p className="flex items-center gap-1 text-[10px] text-[var(--bad)]">
                      <ShieldAlert className="size-2.5 flex-none" /> {t.blockedReason}
                    </p>
                  )}
                  {lane.key !== "done" && (
                    <Select value={t.status} onValueChange={(v) => v && v !== t.status && void move(t, v)}>
                      <SelectTrigger className="h-6 w-[160px] text-[10px]" aria-label={`Move ${t.title}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {statusOptions(t).map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-[var(--ink5)]">
        Signed in as {viewerName}. Feature and bug work is completed by QA — hand it over with “In QA”.
        Project boards stay at each project for triage and handoffs.
      </p>
    </div>
  );
}
