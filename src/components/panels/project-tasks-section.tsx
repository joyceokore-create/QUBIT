"use client";

import { useCallback, useEffect, useState } from "react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  phase: string | null;
  ownerRole: string | null;
  priority: string;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
}
interface Progress {
  total: number;
  completed: number;
  inProgress: number;
  blocked: number;
  pct: number;
}

const STATUS_META: Record<string, { token: string; label: string }> = {
  NotStarted: { token: "--ink4", label: "Not started" },
  InProgress: { token: "--qinfo", label: "In progress" },
  InReview: { token: "--warn", label: "In review" },
  InQA: { token: "--brand", label: "In QA" },
  Completed: { token: "--ok", label: "Completed" },
};

/** M-P2a (docs/33 §2, docs/25 §1) — the slide panel's task list is a READ-ONLY mirror
 * now: no add, no status/assignee/date edits, no delete, no generate. Work items are
 * managed in YouTrack; the project board carries the blocker/discussion affordances. */
export function ProjectTasksSection({ projectId }: { projectId: string; canEdit?: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [progress, setProgress] = useState<Progress>({ total: 0, completed: 0, inProgress: 0, blocked: 0, pct: 0 });

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/tasks`).then((r) => r.json());
    setTasks(d.tasks ?? []);
    setProgress(d.progress ?? { total: 0, completed: 0, inProgress: 0, blocked: 0, pct: 0 });
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold text-foreground">
          Tasks {progress.total > 0 && <span className="text-ink-3">· {progress.total}</span>}
        </div>
        <span className="rounded-full border border-[var(--w08)] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[.8px] text-ink-3">
          mirrored from YouTrack
        </span>
      </div>

      {progress.total > 0 && (
        <div>
          <div className="h-[6px] overflow-hidden rounded-full bg-[var(--w08)]">
            <div className="h-full rounded-full bg-[var(--ok)]" style={{ width: `${progress.pct}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-ink-3">
            {progress.completed}/{progress.total} done · {progress.pct}%
            {progress.blocked > 0 && <span className="text-[var(--bad)]"> · {progress.blocked} blocked</span>}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {tasks.map((t) => {
          const m = STATUS_META[t.status] ?? STATUS_META.NotStarted;
          const overdue = t.dueDate && t.status !== "Completed" && new Date(t.dueDate) < new Date();
          return (
            <div key={t.id} className="flex items-center gap-2 rounded-[6px] bg-background px-3 py-2 text-xs">
              <span className="size-[7px] flex-none rounded-full" style={{ background: `var(${m.token})` }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{t.title}</span>
                <span className="block truncate text-[10.5px] text-ink-3">
                  {[t.phase, t.ownerRole, t.priority, t.assigneeName].filter(Boolean).join(" · ") || "—"}
                  {t.dueDate && (
                    <span style={{ color: overdue ? "var(--bad)" : undefined }}>
                      {" · due "}
                      {new Date(t.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </span>
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ color: `var(${m.token})`, background: `color-mix(in oklab, var(${m.token}) 14%, transparent)` }}
              >
                {m.label}
              </span>
            </div>
          );
        })}
        {tasks.length === 0 && (
          <p className="text-xs text-ink-3">No work items yet — they appear at the first sync after YouTrack is connected.</p>
        )}
      </div>
    </div>
  );
}
