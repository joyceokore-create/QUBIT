"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ExternalLink, FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { KpiCard } from "@/components/ui/kpi-card";
import { HealthPill } from "@/components/ui/status-pill";
import { useListUrl } from "@/components/list/use-list-url";
import { dayKey, formatDate, formatDayMonth } from "@/lib/dates";
import {
  DUE_GROUP_LABEL,
  MY_TABS,
  groupByDue,
  myKpis,
  myTabs,
  taskStatusWord,
  tasksForTab,
  type MyProject,
  type MyTab,
  type MyTask,
  type MyWork,
} from "@/lib/my-work";
import { CARD, FOCUS, PRIMARY, SECONDARY, TAB, TAB_ACTIVE_ON_CARD, TAB_COUNT, TABS_ROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX6 — Member › My work (UX plan D3/D4, UX6). Brief → three KPI cards → one list of the
 * tasks assigned to you, grouped Overdue · Today · This week, with tabs and counts → a short
 * side panel (your blockers, your projects). Tasks open in the right-hand drawer; raising a
 * blocker happens in the same drawer, with Back. Status is owned by YouTrack (tasks are
 * mirrored read-only), so the drawer links there instead of offering a status control.
 */

const COMPACT = `inline-flex h-[var(--control-h-compact)] items-center justify-center gap-1.5 rounded-[8px] border border-[var(--input)] bg-[var(--qcard)] px-2.5 text-[12px] font-semibold text-[var(--ink2)] hover:text-[var(--qink)] ${FOCUS}`;

const STATUS_TONE: Record<string, string> = {
  Blocked: "--bad-ink",
  "In progress": "--stage-exploring",
  "In review": "--stage-evaluating",
  "In QA": "--stage-evaluating",
  "To do": "--ink3",
};

function StatusChip({ word }: { word: string }) {
  const tok = STATUS_TONE[word] ?? "--ink3";
  return (
    <span
      className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[12px] font-semibold"
      style={{ color: `var(${tok})`, background: `color-mix(in oklab, var(${tok}) 12%, transparent)` }}
    >
      {word}
    </span>
  );
}

export function MyWorkHome({ work, brief, nowIso }: { work: MyWork; brief: ReactNode; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const tz = work.timeZone;
  const list = useListUrl("my-work", 10);
  const tabs = myTabs(work, now, tz);
  const rawTab = list.get("tab") as MyTab;
  const tab: MyTab = MY_TABS.includes(rawTab) && tabs.some((t) => t.key === rawTab) ? rawTab : "all";
  const shown = tasksForTab(work, tab, now, tz);
  const groups = groupByDue(shown, now, tz);
  const k = myKpis(work, now, tz);

  const [openTask, setOpenTask] = useState<MyTask | null>(null);
  const [mode, setMode] = useState<"task" | "blocker">("task");
  const open = (t: MyTask, m: "task" | "blocker" = "task") => {
    setOpenTask(t);
    setMode(m);
  };

  const doneChange = k.doneChange === 0 ? "Same as last week" : `${k.doneChange > 0 ? "+" : "−"}${Math.abs(k.doneChange)} vs last week`;

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 p-[22px_24px_72px]">
      <header>
        <div className="text-[12px] font-semibold text-[var(--ink3)]">{formatDateLong(now, tz)}</div>
        <h1 className="font-heading text-[24px] font-bold tracking-[-.5px] text-[var(--qink)]">My work</h1>
        <p className="mt-0.5 text-[13px] text-[var(--ink3)]">Your tasks, ordered by when they are due.</p>
      </header>

      {brief}

      <section aria-label="Your numbers" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Due this week"
          value={k.dueThisWeek}
          context={k.overdue ? `${k.dueToday} today · ${k.overdue} overdue` : `${k.dueToday} today`}
        />
        <KpiCard label="Blocked" value={k.blocked} context={k.firstBlocker ? <span className="line-clamp-1">{k.firstBlocker}</span> : "Nothing blocked"} />
        <KpiCard
          label="Done this week"
          value={k.doneThisWeek}
          change={doneChange}
          changeTone={k.doneChange > 0 ? "good" : k.doneChange < 0 ? "bad" : "neutral"}
          context="Completed in YouTrack"
        />
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-label="Your tasks" className={cn(CARD, "min-w-0 overflow-hidden")} style={{ background: "var(--cardbg)" }}>
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--border)] px-4 pt-3">
            <nav aria-label="Task views">
              <ul className={TABS_ROW}>
                {tabs.map((t) => (
                  <li key={t.key}>
                    <button
                      type="button"
                      aria-current={t.key === tab ? "page" : undefined}
                      onClick={() => list.set({ tab: t.key === "all" ? null : t.key })}
                      className={cn(TAB, t.key === tab && TAB_ACTIVE_ON_CARD)}
                    >
                      {t.label}
                      <span className={TAB_COUNT}>{t.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            <Link href="/board" className={`mb-2 text-[12.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] ${FOCUS}`}>
              Open My Board →
            </Link>
          </div>

          {groups.length === 0 ? (
            <EmptyTasks tab={tab} anyTasks={work.tasks.length > 0} unmatched={work.unmatched.count} />
          ) : (
            groups.map((g) => (
              <div key={g.group}>
                <h2 className="flex items-center gap-2 bg-[var(--surface-2)] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[.07em] text-[var(--ink3)]">
                  {DUE_GROUP_LABEL[g.group]}
                  <span className="tracking-normal">{g.tasks.length}</span>
                </h2>
                <ul>
                  {g.tasks.map((t) => (
                    <TaskRow key={t.id} t={t} tz={tz} overdue={g.group === "overdue"} onOpen={open} />
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>

        <aside className="flex flex-col gap-4" aria-label="Side panel">
          <BlockersPanel work={work} tz={tz} onOpen={(id) => {
            const t = work.tasks.find((x) => x.id === id);
            if (t) open(t);
          }} />
          <ProjectsPanel projects={work.projects} />
          {work.unmatched.count > 0 && (
            <section className={cn(CARD, "p-4")} style={{ background: "var(--cardbg)" }}>
              <h2 className="text-[13.5px] font-semibold text-[var(--qink)]">Not matched in YouTrack</h2>
              <p className="mt-1 text-[12.5px] leading-snug text-[var(--ink3)]">
                {work.unmatched.count} open {work.unmatched.count === 1 ? "task on your projects is" : "tasks on your projects are"} assigned in YouTrack to{" "}
                {work.unmatched.names.length ? work.unmatched.names.join(", ") : "someone"}, with no matching QUBIT account. If one of them is you, ask
                your admin to use the same email in both, so those tasks appear here.
              </p>
            </section>
          )}
        </aside>
      </div>

      <TaskDrawer
        task={openTask}
        mode={mode}
        setMode={setMode}
        project={openTask ? work.projects.find((p) => p.id === openTask.projectId) : undefined}
        tz={tz}
        today={dayKey(now, tz)}
        onClose={() => setOpenTask(null)}
      />
    </main>
  );
}

function formatDateLong(d: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(d);
  return p.replace(",", "");
}

function dueText(t: MyTask, tz: string, overdue: boolean): string {
  if (!t.dueDate) return "No due date";
  return overdue ? `was ${formatDayMonth(t.dueDate, tz)}` : formatDayMonth(t.dueDate, tz);
}

function TaskRow({ t, tz, overdue, onOpen }: { t: MyTask; tz: string; overdue: boolean; onOpen: (t: MyTask, m?: "task" | "blocker") => void }) {
  const word = taskStatusWord(t.status, !!t.blocker);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_110px_90px_auto]">
      <div className="min-w-0">
        <button type="button" onClick={() => onOpen(t)} className={`block max-w-full truncate rounded-sm text-left text-[13.5px] font-semibold text-[var(--qink)] hover:underline ${FOCUS}`}>
          {t.title}
        </button>
        <span className="block truncate text-[12px] text-[var(--ink3)]">
          {t.projectName}
          {t.role ? ` · ${t.role}` : ""}
          {t.key ? ` · ${t.key}` : ""}
          {t.blocker ? ` · blocked since ${formatDayMonth(t.blocker.since, tz)}` : ""}
        </span>
        {/* Phones hide the status and due columns; keep the due date (and overdue) visible. */}
        <span className={cn("block text-[12px] sm:hidden", overdue ? "font-semibold text-[var(--bad-ink)]" : "text-[var(--ink2)]")}>
          {word} · {dueText(t, tz, overdue)}
        </span>
      </div>
      <span className="max-sm:hidden">
        <StatusChip word={word} />
      </span>
      <span className={cn("text-[12.5px] max-sm:hidden", overdue ? "font-semibold text-[var(--bad-ink)]" : "text-[var(--ink2)]")}>{dueText(t, tz, overdue)}</span>
      <button type="button" className={COMPACT} onClick={() => onOpen(t)}>
        {t.blocker ? "Update" : "Open"}
      </button>
    </li>
  );
}

function EmptyTasks({ tab, anyTasks, unmatched }: { tab: MyTab; anyTasks: boolean; unmatched: number }) {
  // U7 — say what will appear and how to start.
  if (anyTasks) {
    const what = { overdue: "Nothing is overdue.", today: "Nothing is due today.", blocked: "Nothing is blocked.", raised: "No open issues you raised.", all: "" }[tab];
    return <p className="px-4 py-10 text-center text-[13px] text-[var(--ink3)]">{what}</p>;
  }
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <p className="text-[14px] font-semibold text-[var(--qink)]">No tasks assigned to you yet</p>
      <p className="max-w-[52ch] text-[12.5px] text-[var(--ink3)]">
        Tasks assigned to you in YouTrack appear here, grouped by when they are due.
        {unmatched > 0 && " Some tasks on your projects have a YouTrack assignee QUBIT couldn't match; see the note on the right."}
      </p>
    </div>
  );
}

function BlockersPanel({ work, tz, onOpen }: { work: MyWork; tz: string; onOpen: (taskId: string) => void }) {
  return (
    <section className={cn(CARD, "p-4")} style={{ background: "var(--cardbg)" }}>
      <h2 className="mb-1 text-[13.5px] font-semibold text-[var(--qink)]">Your blockers</h2>
      {work.blockers.length === 0 ? (
        <p className="text-[12.5px] text-[var(--ink3)]">None. If something stops you, open the task and raise a blocker.</p>
      ) : (
        <ul>
          {work.blockers.map((b) => (
            <li key={b.id} className="border-t border-[var(--border)] py-2 first:border-0">
              {b.taskId && work.tasks.some((t) => t.id === b.taskId) ? (
                <button type="button" onClick={() => onOpen(b.taskId!)} className={`text-left text-[13px] font-semibold text-[var(--qink)] hover:underline ${FOCUS}`}>
                  {b.description}
                </button>
              ) : (
                <span className="text-[13px] font-semibold text-[var(--qink)]">{b.description}</span>
              )}
              <span className="block text-[12px] text-[var(--ink3)]">
                {b.projectName} · since {formatDayMonth(b.since, tz)}
                {b.unblocker ? ` · ${b.unblocker} can unblock` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProjectsPanel({ projects }: { projects: MyProject[] }) {
  return (
    <section className={cn(CARD, "p-4")} style={{ background: "var(--cardbg)" }}>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[13.5px] font-semibold text-[var(--qink)]">My projects</h2>
        <Link href="/projects?mine=1" className={`text-[12.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] ${FOCUS}`}>
          Projects →
        </Link>
      </div>
      {projects.length === 0 ? (
        <p className="text-[12.5px] text-[var(--ink3)]">You aren&apos;t on any active project yet. When a PM adds you, it appears here.</p>
      ) : (
        <ul>
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 border-t border-[var(--border)] py-2 first:border-0">
              <div className="min-w-0">
                <Link href={`/projects/${p.id}`} className={`block truncate text-[13px] font-semibold text-[var(--qink)] hover:underline ${FOCUS}`}>
                  {p.name}
                </Link>
                <span className="block truncate text-[12px] text-[var(--ink3)]">
                  {p.role ? `Your role: ${p.role}` : "Assigned tasks"} · {p.openTasks} {p.openTasks === 1 ? "task" : "tasks"}
                </span>
              </div>
              {p.health ? <HealthPill value={p.health} /> : <span className="whitespace-nowrap text-[12px] text-[var(--ink3)]">No report</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TaskDrawer({
  task,
  mode,
  setMode,
  project,
  tz,
  today,
  onClose,
}: {
  task: MyTask | null;
  mode: "task" | "blocker";
  setMode: (m: "task" | "blocker") => void;
  project: MyProject | undefined;
  tz: string;
  today: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]">
        {task && (mode === "task" ? <TaskView t={task} tz={tz} onRaise={() => setMode("blocker")} onDone={onClose} /> : <BlockerForm t={task} project={project} today={today} onBack={() => setMode("task")} onDone={onClose} />)}
      </SheetContent>
    </Sheet>
  );
}

function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[var(--ink3)]">{k}</dt>
          <dd className="text-[var(--qink)]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function TaskView({ t, tz, onRaise, onDone }: { t: MyTask; tz: string; onRaise: () => void; onDone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const word = taskStatusWord(t.status, !!t.blocker);

  async function resolve() {
    setBusy(true);
    const res = await fetch(`/api/tasks/${t.id}/block`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      toast.error("Couldn't mark the blocker resolved. Try again.");
      return;
    }
    toast.success("Blocker resolved. Your PM can see it's cleared.");
    onDone();
    router.refresh();
  }

  return (
    <>
      <div className="border-b border-[var(--border)] px-5 py-4 pr-12">
        <div className="text-[11.5px] font-semibold text-[var(--ink3)]">Task{t.key ? ` · ${t.key}` : ""}</div>
        <SheetTitle className="mt-0.5 text-[17px] font-bold text-[var(--qink)]">{t.title}</SheetTitle>
        <SheetDescription className="mt-0.5 text-[12.5px] text-[var(--ink3)]">
          {t.projectName}
          {t.dueDate ? ` · due ${formatDate(t.dueDate, tz)}` : ""}
        </SheetDescription>
      </div>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <section>
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[.07em] text-[var(--ink3)]">Status</h3>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip word={word} />
            <span className="text-[12.5px] text-[var(--ink3)]">Status is updated in YouTrack and syncs here.</span>
          </div>
        </section>
        <Kv
          rows={[
            ["Due", t.dueDate ? formatDate(t.dueDate, tz) : "No due date"],
            ["Estimate", t.estimate ?? "—"],
            ["Your role", t.role ?? "—"],
            ["Priority", t.severity ? `${t.priority} · ${t.severity} severity` : t.priority],
            ["Milestone", t.milestone ?? "—"],
          ]}
        />
        {t.description && (
          <section>
            <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[.07em] text-[var(--ink3)]">Description</h3>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--ink2)]">{t.description}</p>
          </section>
        )}
        {t.blocker ? (
          <section className="rounded-[var(--control-r)] border border-[color-mix(in_oklab,var(--bad-ink)_30%,transparent)] bg-[color-mix(in_oklab,var(--bad-ink)_6%,transparent)] p-3.5">
            <p className="flex items-start gap-2 text-[13px] text-[var(--qink)]">
              <AlertTriangle className="mt-0.5 size-4 flex-none text-[var(--bad-ink)]" aria-hidden />
              <span>
                <b>Blocked since {formatDayMonth(t.blocker.since, tz)}.</b> {t.blocker.description}
                {t.blocker.unblocker ? ` ${t.blocker.unblocker} can unblock it.` : ""}
              </span>
            </p>
            {/* U9 — actions sit below the callout's text. */}
            <button type="button" disabled={busy} onClick={resolve} className={cn(SECONDARY, "mt-2.5")}>
              {busy ? "Saving…" : "Mark resolved"}
            </button>
          </section>
        ) : (
          !t.raisedByMe && (
            <section className="rounded-[var(--control-r)] border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
              <p className="flex items-start gap-2 text-[13px] text-[var(--qink)]">
                <AlertTriangle className="mt-0.5 size-4 flex-none text-[var(--warn-ink)]" aria-hidden />
                <span>
                  <b>Blocked?</b> Raise a blocker and your PM sees it straight away.
                </span>
              </p>
              <button type="button" onClick={onRaise} className={cn(SECONDARY, "mt-2.5")}>
                Raise blocker
              </button>
            </section>
          )
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <Link href={`/projects/${t.projectId}?tab=Board&task=${t.id}`} className={SECONDARY}>
          <FolderKanban className="size-4" aria-hidden /> Open in project
        </Link>
        {t.externalUrl && (
          <a href={t.externalUrl} target="_blank" rel="noopener noreferrer" className={PRIMARY}>
            Open in YouTrack <ExternalLink className="size-4" aria-hidden />
          </a>
        )}
      </div>
    </>
  );
}

const FIELD = `w-full rounded-[var(--control-r)] border border-[var(--input)] bg-[var(--qcard)] px-3 text-[13px] text-[var(--qink)] placeholder:text-[var(--ink3)] ${FOCUS}`;

function BlockerForm({ t, project, today, onBack, onDone }: { t: MyTask; project: MyProject | undefined; today: string; onBack: () => void; onDone: () => void }) {
  const router = useRouter();
  const [what, setWhat] = useState("");
  const [who, setWho] = useState("");
  const [since, setSince] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minDay = new Date(Date.parse(`${today}T12:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
  const pms = project?.pmNames ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!what.trim()) {
      setError("Say what is blocking you.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tasks/${t.id}/block`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: what.trim(), unblockerId: who || null, since }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      setError(body?.error?.message ?? "Couldn't raise the blocker. Try again.");
      return;
    }
    toast.success(pms.length ? `Blocker raised. ${pms.join(" and ")} ${pms.length === 1 ? "has" : "have"} been told.` : "Blocker raised.");
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      <div className="border-b border-[var(--border)] px-5 py-4 pr-12">
        <button type="button" onClick={onBack} className={`mb-1 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] ${FOCUS}`}>
          <ArrowLeft className="size-3.5" aria-hidden /> Back to task
        </button>
        <div className="text-[11.5px] font-semibold text-[var(--ink3)]">Blocker</div>
        <SheetTitle className="mt-0.5 text-[17px] font-bold text-[var(--qink)]">{t.title}</SheetTitle>
        <SheetDescription className="mt-0.5 text-[12.5px] text-[var(--ink3)]">{t.projectName} · your task</SheetDescription>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--qink)]">What is blocking you?</span>
          <textarea
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            maxLength={500}
            rows={4}
            required
            placeholder="For example: waiting on vendor test data"
            className={cn(FIELD, "py-2")}
          />
          <span className="text-[12px] text-[var(--ink3)]">Up to 500 characters. Your PM sees this.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--qink)]">Who can unblock it?</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} className={cn(FIELD, "h-[var(--control-h)]")}>
            <option value="">Not sure (your PM decides)</option>
            {(project?.people ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-[var(--ink3)]">Someone on {t.projectName}. They&apos;re told too.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--qink)]">Blocked since</span>
          <input type="date" value={since} min={minDay} max={today} onChange={(e) => setSince(e.target.value)} className={cn(FIELD, "h-[var(--control-h)] w-[200px]")} />
          <span className="text-[12px] text-[var(--ink3)]">Today or up to 90 days ago.</span>
        </label>
        <p className="rounded-[var(--control-r)] bg-[color-mix(in_oklab,var(--stage-exploring)_8%,transparent)] px-3 py-2.5 text-[12.5px] text-[var(--qink)]">
          {pms.length ? `${pms.join(" and ")} ${pms.length === 1 ? "is" : "are"} told straight away.` : "This project has no PM yet, so nobody is told automatically."}
        </p>
        {error && (
          <p role="alert" className="text-[12.5px] font-semibold text-[var(--bad-ink)]">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button type="button" onClick={onBack} className={SECONDARY}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy ? "Raising…" : "Raise blocker"}
        </button>
      </div>
    </form>
  );
}
