"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, FileText, Flag } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApprovalQueue } from "./approval-queue";

interface Task {
  id: string;
  title: string;
  projectId: string;
  projectCode: string;
  status: string;
  priority: string;
  /** Open linked blocker exists — "Blocked" is a flag since Phase 6.1, not a status. */
  blocked: boolean;
  blockedReason: string | null;
  dueDate: string | null;
  updatedAt: string;
}

const DAY = 86_400_000;
const PRIORITY_RANK: Record<string, number> = { Critical: 3, High: 2, Medium: 1, Low: 0 };
const STATUS_LABELS: Record<string, string> = {
  NotStarted: "Not started",
  InProgress: "In progress",
  InReview: "In review",
  InQA: "In QA",
  Completed: "Completed",
};
/** Deep link into the project's board with the card highlighted (work-cycle UX). */
const boardHref = (t: Pick<Task, "projectId" | "id">, lens?: string) =>
  `/projects/${t.projectId}?tab=Board&task=${t.id}${lens ? `&lens=${lens}` : ""}`;

function fmtDue(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
}

export function MyTasksClient({
  name,
  roles,
  tasks: initial,
  managed,
  inTest,
}: {
  name: string;
  roles: string[];
  tasks: Task[];
  managed: Task[];
  inTest: Task[];
}) {
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const pureMember = roles.length === 0 || roles.every((r) => r === "Member");

  async function setStatus(id: string, next: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t || busy.has(id) || t.status === next) return;
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
  const toggle = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (t) void setStatus(id, t.status === "Completed" ? "InProgress" : "Completed");
  };
  async function flagBlocked(id: string) {
    if (!flagReason.trim()) return;
    const ok = await fetch(`/api/tasks/${id}/block`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: flagReason.trim() }),
    }).then((r) => r.ok);
    if (ok) {
      setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, blocked: true, blockedReason: flagReason.trim() } : x)));
      setFlaggingId(null);
      setFlagReason("");
    }
  }
  async function resolveBlocked(id: string) {
    const ok = await fetch(`/api/tasks/${id}/block`, { method: "DELETE" }).then((r) => r.ok);
    if (ok) setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, blocked: false, blockedReason: null } : x)));
  }

  const now = Date.now();
  const buckets = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "Completed");
    const dueMs = (t: Task) => (t.dueDate ? new Date(t.dueDate).getTime() : null);
    const blocked = open.filter((t) => t.blocked);
    const overdue = open.filter((t) => !t.blocked && dueMs(t) !== null && dueMs(t)! < now);
    const dueThisWeek = open.filter((t) => !t.blocked && dueMs(t) !== null && dueMs(t)! >= now && dueMs(t)! <= now + 7 * DAY);
    const later = open.filter((t) => !t.blocked && !overdue.includes(t) && !dueThisWeek.includes(t));
    const recentlyCompleted = tasks
      .filter((t) => t.status === "Completed" && new Date(t.updatedAt).getTime() >= now - 14 * DAY)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return { open, blocked, overdue, dueThisWeek, later, recentlyCompleted };
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
    { key: "blocked", label: "Blocked — waiting on others", tok: "--bad", items: buckets.blocked },
    { key: "later", label: "Open", tok: "--qinfo", items: buckets.later },
    { key: "recentlyCompleted", label: "Recently completed", tok: "--ok", items: buckets.recentlyCompleted, muted: true },
  ] as const;

  return (
    <main className="flex w-full flex-col gap-4 p-[22px_24px_90px]">
      <div className="flex items-end justify-between gap-4 [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
        <div>
          <div className="mb-1.5 font-mono rv:font-sans text-[10px] rv:text-overline font-semibold uppercase tracking-[2.4px] text-[var(--ink4)]">
            Member view / {name}
          </div>
          <h1 className="font-heading text-[27px] rv:text-heading-lg font-bold tracking-[-.8px] text-[var(--qink)]">My tasks</h1>
          <p className="mt-1.5 text-[13px] rv:text-body-sm text-[var(--ink3)]">
            You have <span className="font-semibold text-[var(--qink)]">{buckets.open.length} open {buckets.open.length === 1 ? "task" : "tasks"}</span> across your projects
            {focus.length ? " — start with these." : "."}
          </p>
        </div>
        <Link
          href="/reports"
          className="flex flex-none items-center gap-1.5 rounded-full border border-[var(--hair)] px-3.5 py-2 text-[12px] font-semibold text-[var(--ink2)] transition-colors hover:border-brand hover:text-brand"
          title="Generate your weekly report in the Reports centre"
        >
          <FileText className="size-3.5" /> My week
        </Link>
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
              <div className="flex-1 text-[13.5px] rv:text-heading-xs font-semibold leading-[1.4] tracking-[-.1px] text-[var(--qink)]">{f.title}</div>
              <div className="flex items-center gap-2.5">
                <Select value={f.status} onValueChange={(v) => v && void setStatus(f.id, v)} items={STATUS_LABELS}>
                  <SelectTrigger className="h-7 w-[120px] text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Link href={boardHref(f)} className="text-[11.5px] font-semibold text-brand">
                  Open board →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Awaiting my approval (join requests) — self-hides when empty */}
      <ApprovalQueue />

      {/* Buckets */}
      <div className="flex flex-col gap-3.5 [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.1s_both]">
        {bucketDefs.map((b) =>
          b.items.length === 0 ? null : (
            <section key={b.key}>
              <div className="mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-[2px]" style={{ background: `var(${b.tok})` }} />
                <span className="font-mono rv:font-sans text-[9.5px] rv:text-overline font-semibold uppercase tracking-[2px]" style={{ color: `var(${b.tok})` }}>{b.label}</span>
                <span className="font-mono text-[9.5px] text-[var(--ink5)]">{b.items.length}</span>
              </div>
              <div
                className="overflow-hidden rounded-[14px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]"
                style={{ background: "var(--cardbg)" }}
              >
                {b.items.map((t) => {
                  const done = t.status === "Completed";
                  return (
                    <div key={t.id} className="flex flex-col border-b border-[var(--hair2)] transition-colors last:border-0 hover:bg-[var(--wash)]">
                      <div className="flex items-center gap-3 p-[10px_15px]">
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
                        <span className={`min-w-0 flex-1 truncate text-[13px] ${done ? "text-[var(--ink4)] line-through" : "text-[var(--ink2)]"}`}>
                          {t.title}
                          {t.blocked && t.blockedReason && (
                            <span className="ml-2 text-[11px] text-[var(--bad)]" title={t.blockedReason}>— {t.blockedReason}</span>
                          )}
                        </span>
                        {!done && (
                          <Select value={t.status} onValueChange={(v) => v && void setStatus(t.id, v)} items={STATUS_LABELS}>
                            <SelectTrigger className="h-6 w-[110px] flex-none text-[10.5px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_LABELS).map(([k, label]) => (
                                <SelectItem key={k} value={k}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {!done && (
                          t.blocked ? (
                            <button
                              type="button"
                              onClick={() => void resolveBlocked(t.id)}
                              className="flex-none text-[10.5px] font-semibold text-[var(--bad)] hover:underline"
                            >
                              Resolve
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setFlaggingId(flaggingId === t.id ? null : t.id); setFlagReason(""); }}
                              aria-label="Flag blocked"
                              title="Flag blocked"
                              className="flex-none text-[var(--ink5)] transition-colors hover:text-[var(--bad)]"
                            >
                              <Flag className="size-3" />
                            </button>
                          )
                        )}
                        <Link
                          href={boardHref(t)}
                          className="flex-none rounded-[5px] bg-[var(--wash2)] px-2 py-[3px] font-mono text-[9.5px] tracking-[1px] text-[var(--ink3)] transition-colors hover:text-brand"
                          title="Open on the board"
                        >
                          {t.projectCode}
                        </Link>
                        <span className="w-12 flex-none text-right font-mono text-[10px] text-[var(--ink4)]">{t.dueDate ? fmtDue(t.dueDate) : ""}</span>
                      </div>
                      {flaggingId === t.id && (
                        <div className="flex items-center gap-2 px-[15px] pb-2.5 pl-[46px]">
                          <input
                            value={flagReason}
                            onChange={(e) => setFlagReason(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void flagBlocked(t.id);
                              if (e.key === "Escape") { setFlaggingId(null); setFlagReason(""); }
                            }}
                            placeholder="Blocked by…"
                            autoFocus
                            className="h-7 min-w-0 flex-1 rounded-[6px] border border-ink-4 bg-background px-2 text-[11.5px] text-foreground outline-none focus:border-brand"
                          />
                          <button type="button" onClick={() => void flagBlocked(t.id)} className="text-[11px] font-semibold text-[var(--bad)]">
                            Flag
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ),
        )}
      </div>

      {/* Role-aware sections (§6) — rows deep-link to the highlighted card on the board. */}
      {managed.length > 0 && (
        <ReferenceSection label="Across my projects" sub="ASSIGNED TO THE TEAM" items={managed} />
      )}
      {inTest.length > 0 && (
        <ReferenceSection label="In test" sub="TESTING · UAT · SIT" items={inTest} lens="qa" />
      )}

      {tasks.length === 0 && managed.length === 0 && inTest.length === 0 && (
        <div className="rounded-[16px] border border-dashed border-[var(--hair)] p-10 text-center [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_both]">
          <p className="text-[13px] text-[var(--ink3)]">
            {pureMember
              ? "No tasks assigned yet — join a project to get started."
              : "Nothing is assigned to you right now."}
          </p>
          {pureMember && (
            <Link
              href="/projects"
              className="mt-3 inline-block rounded-full bg-[var(--brand)] px-4 py-2 text-[12.5px] font-bold text-[var(--onbrand)]"
              style={{ boxShadow: "0 4px 16px color-mix(in oklab, var(--brand) var(--glowA), transparent)" }}
            >
              Browse projects to join
            </Link>
          )}
        </div>
      )}
    </main>
  );
}

/** Read-only reference list for role-aware sections (PM "across my projects", QA "in test").
 * These are other people's tasks, so no complete-toggle — rows deep-link to the board card
 * (the QA section lands on the QA lens). */
function ReferenceSection({
  label,
  sub,
  items,
  lens,
}: {
  label: string;
  sub: string;
  items: Task[];
  lens?: string;
}) {
  return (
    <section className="[animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.12s_both]">
      <div className="mb-2 flex items-center gap-2">
        <span className="size-1.5 rounded-[2px] bg-[var(--qinfo)]" />
        <span className="font-mono rv:font-sans text-[9.5px] rv:text-overline font-semibold uppercase tracking-[2px] text-[var(--ink3)]">{label}</span>
        <span className="font-mono text-[9px] tracking-[1px] text-[var(--ink5)]">{sub}</span>
        <span className="font-mono text-[9.5px] text-[var(--ink5)]">{items.length}</span>
      </div>
      <div
        className="overflow-hidden rounded-[14px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]"
        style={{ background: "var(--cardbg)" }}
      >
        {items.map((t) => (
          <Link
            key={t.id}
            href={boardHref(t, lens)}
            className="flex w-full items-center gap-3 border-b border-[var(--hair2)] p-[10px_15px] text-left transition-colors last:border-0 hover:bg-[var(--wash)]"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink2)]">
              {t.title}
              {t.blocked && <span className="ml-2 font-mono text-[9px] font-semibold uppercase tracking-[1px] text-[var(--bad)]">Blocked</span>}
            </span>
            <span className="flex-none rounded-[5px] bg-[var(--wash2)] px-2 py-[3px] font-mono text-[9.5px] tracking-[1px] text-[var(--ink3)]">{t.projectCode}</span>
            <span className="w-12 flex-none text-right font-mono text-[10px] text-[var(--ink4)]">{t.dueDate ? fmtDue(t.dueDate) : ""}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
