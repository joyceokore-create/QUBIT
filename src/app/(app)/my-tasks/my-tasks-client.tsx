"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { usePanel } from "@/components/panels/panel-context";

interface Task {
  id: string;
  title: string;
  projectId: string;
  projectCode: string;
  status: string;
  priority: string;
  dueDate: string | null;
  updatedAt: string;
}

const DAY = 86_400_000;
const PRIORITY_RANK: Record<string, number> = { Critical: 3, High: 2, Medium: 1, Low: 0 };

function fmtDue(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
}

export function MyTasksClient({ name, tasks: initial }: { name: string; tasks: Task[] }) {
  const { openProject } = usePanel();
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  async function toggle(id: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t || busy.has(id)) return;
    const next = t.status === "Completed" ? "InProgress" : "Completed";
    const nowIso = new Date().toISOString();
    setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, status: next, updatedAt: nowIso } : x)));
    setBusy((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // revert on failure
      setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, status: t.status, updatedAt: t.updatedAt } : x)));
    } finally {
      setBusy((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }
  }

  const now = Date.now();
  const buckets = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "Completed");
    const dueMs = (t: Task) => (t.dueDate ? new Date(t.dueDate).getTime() : null);
    const overdue = open.filter((t) => dueMs(t) !== null && dueMs(t)! < now);
    const dueThisWeek = open.filter((t) => dueMs(t) !== null && dueMs(t)! >= now && dueMs(t)! <= now + 7 * DAY);
    const later = open.filter((t) => !overdue.includes(t) && !dueThisWeek.includes(t));
    const recentlyCompleted = tasks
      .filter((t) => t.status === "Completed" && new Date(t.updatedAt).getTime() >= now - 14 * DAY)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return { open, overdue, dueThisWeek, later, recentlyCompleted };
  }, [tasks, now]);

  // Focus queue: three most-urgent open tasks (overdue → due-this-week → rest), then by priority.
  const focus = useMemo(() => {
    const urgency = (t: Task) => {
      const d = t.dueDate ? new Date(t.dueDate).getTime() : Infinity;
      if (d < now) return 0;
      if (d <= now + 7 * DAY) return 1;
      return 2;
    };
    return [...buckets.open]
      .sort((a, b) => urgency(a) - urgency(b) || (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0))
      .slice(0, 3);
  }, [buckets.open, now]);

  const bucketDefs = [
    { key: "overdue", label: "Overdue", tok: "--bad", items: buckets.overdue },
    { key: "dueThisWeek", label: "Due this week", tok: "--warn", items: buckets.dueThisWeek },
    { key: "later", label: "Open", tok: "--qinfo", items: buckets.later },
    { key: "recentlyCompleted", label: "Recently completed", tok: "--ok", items: buckets.recentlyCompleted, muted: true },
  ] as const;

  return (
    <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-4 p-[22px_24px_90px]">
      <div className="[animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
        <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[2.4px] text-[var(--ink4)]">
          Member view / {name}
        </div>
        <h1 className="font-heading text-[27px] font-bold tracking-[-.8px] text-[var(--qink)]">My tasks</h1>
        <p className="mt-1.5 text-[13px] text-[var(--ink3)]">
          You have <span className="font-semibold text-[var(--qink)]">{buckets.open.length} open {buckets.open.length === 1 ? "task" : "tasks"}</span> across your projects
          {focus.length ? " — start with these." : "."}
        </p>
      </div>

      {/* Focus queue */}
      {focus.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.05s_both]">
          {focus.map((f) => (
            <div
              key={f.id}
              className="flex flex-col gap-2.5 rounded-[16px] border border-[var(--cardbd)] p-4 shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25] transition-transform duration-200 hover:-translate-y-[3px]"
              style={{ background: "var(--cardbg)" }}
            >
              <div className="flex items-center justify-between font-mono text-[9.5px] tracking-[1px] text-[var(--ink4)]">
                <span>{f.projectCode}</span>
                <span>{fmtDue(f.dueDate)}</span>
              </div>
              <div className="flex-1 text-[13.5px] font-semibold leading-[1.4] tracking-[-.1px] text-[var(--qink)]">{f.title}</div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => toggle(f.id)}
                  disabled={busy.has(f.id)}
                  className="flex items-center gap-1.5 rounded-full border border-[var(--hair)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--ok)] hover:text-[var(--ok)] disabled:opacity-50"
                >
                  <Check className="size-3" /> Done
                </button>
                <button type="button" onClick={() => openProject(f.projectId)} className="text-[11.5px] font-semibold text-brand">
                  Open project →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Buckets */}
      <div className="flex flex-col gap-3.5 [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.1s_both]">
        {bucketDefs.map((b) =>
          b.items.length === 0 ? null : (
            <section key={b.key}>
              <div className="mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-[2px]" style={{ background: `var(${b.tok})` }} />
                <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[2px]" style={{ color: `var(${b.tok})` }}>{b.label}</span>
                <span className="font-mono text-[9.5px] text-[var(--ink5)]">{b.items.length}</span>
              </div>
              <div
                className="overflow-hidden rounded-[14px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]"
                style={{ background: "var(--cardbg)" }}
              >
                {b.items.map((t) => {
                  const done = t.status === "Completed";
                  return (
                    <div key={t.id} className="flex items-center gap-3 border-b border-[var(--hair2)] p-[10px_15px] transition-colors last:border-0 hover:bg-[var(--wash)]">
                      <button
                        type="button"
                        onClick={() => toggle(t.id)}
                        disabled={busy.has(t.id)}
                        aria-label={done ? "Mark not done" : "Mark done"}
                        className="flex size-[18px] flex-none items-center justify-center rounded-md border-[1.5px] transition-colors disabled:opacity-50"
                        style={{ borderColor: done ? "var(--ok)" : "var(--w14)", background: done ? "var(--ok)" : "transparent" }}
                      >
                        {done && <Check className="size-[11px] text-[var(--onbrand)]" strokeWidth={3} />}
                      </button>
                      <span className={`min-w-0 flex-1 truncate text-[13px] ${done ? "text-[var(--ink4)] line-through" : "text-[var(--ink2)]"}`}>{t.title}</span>
                      <button
                        type="button"
                        onClick={() => openProject(t.projectId)}
                        className="flex-none rounded-[5px] bg-[var(--wash2)] px-2 py-[3px] font-mono text-[9.5px] tracking-[1px] text-[var(--ink3)] transition-colors hover:text-brand"
                      >
                        {t.projectCode}
                      </button>
                      <span className="w-12 flex-none text-right font-mono text-[10px] text-[var(--ink4)]">{t.dueDate ? fmtDue(t.dueDate) : ""}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ),
        )}
      </div>

      {tasks.length === 0 && (
        <div className="rounded-[16px] border border-dashed border-[var(--hair)] p-10 text-center text-[13px] text-[var(--ink4)]">
          No tasks assigned to you yet. A project manager assigns tasks from the project panel.
        </div>
      )}
    </main>
  );
}
