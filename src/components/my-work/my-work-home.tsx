"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FolderKanban, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { KpiCard, KpiRow } from "@/components/ui/kpi-card";
import { Bars, Meter } from "@/components/ui/kpi-charts";
import { Chip, HealthPill, type ChipTone } from "@/components/ui/status-pill";
import { TextLink } from "@/components/ui/text-link";
import { Banner, Columns, ListGroup, ListRow, Panel, PanelList, PanelRow } from "@/components/ui/panel";
import { Choice, Drawer, DrawerError, DrawerFooter, DrawerFrame, DrawerHeader, DrawerSection, DrawerText, Field, FIELD_INPUT, FIELD_TEXTAREA, Kv } from "@/components/ui/drawer";
import { PageHeader } from "@/components/list/page-header";
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
import { COMPACT, FOCUS, PRIMARY, SECONDARY, TAB, TAB_ACTIVE_ON_CARD, TAB_COUNT, TABS_ROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX6 + UX fidelity Tier 1 — Member › My Work, built to design spec v2 (docs/08). Brief → three
 * KPI cards → the "Focus" panel of the tasks assigned to you, grouped Overdue · Today · This
 * Week, with tabs and counts → a short side panel (your blockers, your projects). Tasks open in the right-hand drawer; raising a
 * blocker happens in the same drawer, with Back. Status is owned by YouTrack (tasks are
 * mirrored read-only), so the drawer links there instead of offering a status control.
 */

const STATUS_TONE: Record<string, ChipTone> = {
  Blocked: "bad",
  "In progress": "info",
  "In review": "vio",
  "In QA": "vio",
  "To do": "muted",
};

function StatusChip({ word }: { word: string }) {
  return <Chip tone={STATUS_TONE[word] ?? "muted"}>{word}</Chip>;
}

/** Tasks due on each of the next 7 tenant-local days (KPI bars; from real due dates). */
function duePerDay(tasks: MyTask[], now: Date, tz: string): number[] {
  return Array.from({ length: 7 }, (_, i) => {
    const k = dayKey(new Date(now.getTime() + i * 86_400_000), tz);
    return tasks.filter((t) => t.dueDate && dayKey(t.dueDate, tz) === k).length;
  });
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
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-[22px_22px_72px]">
      <PageHeader eyebrow={formatDateLong(now, tz)} title="My Work" description="Your tasks, ordered by when they are due." />

      {brief}

      <KpiRow count={3} label="Your numbers">
        <KpiCard
          label="Due This Week"
          value={k.dueThisWeek}
          context={k.overdue ? `${k.dueToday} today · ${k.overdue} overdue` : `${k.dueToday} today`}
          contextTone={k.overdue ? "bad" : "neutral"}
          chart={<Bars values={duePerDay(work.tasks, now, tz)} />}
        />
        <KpiCard
          label="Blocked"
          value={k.blocked}
          context={k.firstBlocker ? <span className="line-clamp-1">{k.firstBlocker}</span> : "Nothing blocked"}
          contextTone={k.blocked ? "bad" : "neutral"}
          chart={work.tasks.length ? <Meter value={k.blocked} max={work.tasks.length} tone="bad" /> : undefined}
        />
        <KpiCard
          label="Done This Week"
          value={k.doneThisWeek}
          change={doneChange}
          changeTone={k.doneChange > 0 ? "good" : k.doneChange < 0 ? "bad" : "neutral"}
          context="Completed in YouTrack"
        />
      </KpiRow>

      <Columns
        main={
          <Panel title="Focus" labelledBy="my-focus" action={<TextLink href="/board">Open My Board</TextLink>}>
            <nav aria-label="Task views">
              <ul className={TABS_ROW}>
                {tabs.map((t) => (
                  <li key={t.key}>
                    <button type="button" aria-current={t.key === tab ? "page" : undefined} onClick={() => list.set({ tab: t.key === "all" ? null : t.key })} className={cn(TAB, t.key === tab && TAB_ACTIVE_ON_CARD)}>
                      {t.label}
                      <span className={TAB_COUNT}>{t.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            {groups.length === 0 ? (
              <EmptyTasks tab={tab} anyTasks={work.tasks.length > 0} unmatched={work.unmatched.count} />
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {groups.map((g) => (
                  <GroupRows key={g.group} label={`${DUE_GROUP_LABEL[g.group]} · ${g.tasks.length}`}>
                    {g.tasks.map((t) => (
                      <TaskRow key={t.id} t={t} tz={tz} overdue={g.group === "overdue"} onOpen={open} />
                    ))}
                  </GroupRows>
                ))}
              </ul>
            )}
          </Panel>
        }
        rail={
          <>
            <BlockersPanel
              work={work}
              tz={tz}
              onOpen={(id) => {
                const t = work.tasks.find((x) => x.id === id);
                if (t) open(t);
              }}
            />
            <ProjectsPanel projects={work.projects} />
            {work.unmatched.count > 0 && (
              <Panel title="Not Matched in YouTrack">
                <p className="text-[12.5px] leading-snug text-[var(--ds-ink3)]">
                  {work.unmatched.count} open {work.unmatched.count === 1 ? "task on your projects is" : "tasks on your projects are"} assigned in YouTrack to{" "}
                  {work.unmatched.names.length ? work.unmatched.names.join(", ") : "someone"}, with no matching QUBIT account. If one of them is you, ask your admin to use the same email in both, so those tasks appear here.
                </p>
              </Panel>
            )}
          </>
        }
      />

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

function GroupRows({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <ListGroup>{label}</ListGroup>
      {children}
    </>
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
  const sub = [t.projectName, t.role, t.key, t.blocker ? `blocked since ${formatDayMonth(t.blocker.since, tz)}` : null].filter(Boolean).join(" · ");
  return (
    <ListRow
      title={
        <button type="button" onClick={() => onOpen(t)} className={cn("max-w-full truncate rounded-sm text-left hover:underline", FOCUS)}>
          {t.title}
        </button>
      }
      sub={sub}
      chip={<StatusChip word={word} />}
      meta={<span className={overdue ? "font-semibold text-[var(--ds-bad-text)]" : undefined}>{dueText(t, tz, overdue)}</span>}
      action={
        <button type="button" className={COMPACT} onClick={() => onOpen(t)}>
          {t.blocker ? "Update" : "Open"}
        </button>
      }
    />
  );
}

function EmptyTasks({ tab, anyTasks, unmatched }: { tab: MyTab; anyTasks: boolean; unmatched: number }) {
  // U7 — say what will appear and how to start.
  if (anyTasks) {
    const what = { overdue: "Nothing is overdue.", today: "Nothing is due today.", blocked: "Nothing is blocked.", raised: "No open issues you raised.", all: "" }[tab];
    return <p className="px-4 py-10 text-center text-[13px] text-[var(--ds-ink3)]">{what}</p>;
  }
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <p className="text-[14px] font-semibold text-[var(--ds-ink)]">No tasks assigned to you yet</p>
      <p className="max-w-[52ch] text-[12.5px] text-[var(--ds-ink3)]">
        Tasks assigned to you in YouTrack appear here, grouped by when they are due.
        {unmatched > 0 && " Some tasks on your projects have a YouTrack assignee QUBIT couldn't match; see the note on the right."}
      </p>
    </div>
  );
}

function BlockersPanel({ work, tz, onOpen }: { work: MyWork; tz: string; onOpen: (taskId: string) => void }) {
  return (
    <Panel title="Your Blockers">
      {work.blockers.length === 0 ? (
        <p className="text-[12.5px] text-[var(--ds-ink3)]">None. If something stops you, open the task and raise a blocker.</p>
      ) : (
        <PanelList>
          {work.blockers.map((b) => (
            <PanelRow
              key={b.id}
              title={
                b.taskId && work.tasks.some((t) => t.id === b.taskId) ? (
                  <button type="button" onClick={() => onOpen(b.taskId!)} className={cn("rounded-[3px] text-left hover:underline", FOCUS)}>
                    {b.description}
                  </button>
                ) : (
                  b.description
                )
              }
              sub={`${b.projectName} · since ${formatDayMonth(b.since, tz)}${b.unblocker ? ` · ${b.unblocker} can unblock` : ""}`}
              chip={<Chip tone="bad">Blocked</Chip>}
            />
          ))}
        </PanelList>
      )}
    </Panel>
  );
}

function ProjectsPanel({ projects }: { projects: MyProject[] }) {
  return (
    <Panel title="My Projects" action={<TextLink href="/projects?mine=1">Projects</TextLink>}>
      {projects.length === 0 ? (
        <p className="text-[12.5px] text-[var(--ds-ink3)]">You aren&apos;t on any active project yet. When a PM adds you, it appears here.</p>
      ) : (
        <PanelList>
          {projects.map((p) => (
            <PanelRow
              key={p.id}
              title={
                <Link href={`/projects/${p.id}`} className={cn("rounded-[3px] hover:underline", FOCUS)}>
                  {p.name}
                </Link>
              }
              sub={`${p.role ? `Your role: ${p.role}` : "Assigned tasks"} · ${p.openTasks} ${p.openTasks === 1 ? "task" : "tasks"}`}
              chip={p.health ? <HealthPill value={p.health} /> : <Chip>No report</Chip>}
            />
          ))}
        </PanelList>
      )}
    </Panel>
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
    <Drawer open={!!task} onClose={onClose}>
      {task && (mode === "task" ? <TaskView t={task} tz={tz} onRaise={() => setMode("blocker")} onDone={onClose} /> : <BlockerForm t={task} project={project} today={today} onBack={() => setMode("task")} onDone={onClose} />)}
    </Drawer>
  );
}

// D-F5: tasks are mirrored from YouTrack, so status is shown read-only (the design's status
// control, disabled) with "Open in YouTrack" to change it.
const STATUS_STEPS = [
  { value: "To do", label: "To do" },
  { value: "In progress", label: "In progress" },
  { value: "Done", label: "Done" },
] as const;

function TaskView({ t, tz, onRaise, onDone }: { t: MyTask; tz: string; onRaise: () => void; onDone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const word = taskStatusWord(t.status, !!t.blocker);
  const step = t.status === "Completed" ? "Done" : word === "To do" ? "To do" : "In progress";

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
    <DrawerFrame
      header={<DrawerHeader step={`Task${t.key ? ` · ${t.key}` : ""}`} title={t.title} subtitle={`${t.projectName}${t.dueDate ? ` · due ${formatDate(t.dueDate, tz)}` : ""}`} />}
      footer={
        <DrawerFooter>
          <Link href={`/projects/${t.projectId}?tab=Board&task=${t.id}`} className={SECONDARY}>
            <FolderKanban className="size-3.5" aria-hidden /> Open in Project
          </Link>
          {t.externalUrl && (
            <a href={t.externalUrl} target="_blank" rel="noopener noreferrer" className={PRIMARY}>
              Open in YouTrack <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </DrawerFooter>
      }
    >
      <DrawerSection title="Status" aside={word === "Blocked" || word === "In review" || word === "In QA" ? <StatusChip word={word} /> : undefined}>
        <Choice label="Status (read-only)" value={step} options={STATUS_STEPS.map((o) => ({ value: o.value, label: o.label }))} disabled />
        <DrawerText hint>Status is updated in YouTrack and syncs here.</DrawerText>
      </DrawerSection>
      <Kv
        rows={[
          ["Due", t.dueDate ? formatDate(t.dueDate, tz) : "No due date"],
          ["Estimate", t.estimate ?? "Not set"],
          ["Your role", t.role ?? "Not set"],
          ["Linked milestone", t.milestone ?? "None"],
          ["Priority", t.severity ? `${t.priority} · ${t.severity} severity` : t.priority],
        ]}
      />
      {t.description && (
        <DrawerSection title="Description">
          <p className="whitespace-pre-wrap text-[13px] leading-[1.55] text-[var(--ds-ink2)]">{t.description}</p>
        </DrawerSection>
      )}
      {t.blocker ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-2 rounded-[10px] bg-[var(--ds-badw)] p-3 text-[12.5px] text-[var(--ds-ink)]">
          <TriangleAlert className="mt-0.5 size-3.5 text-[var(--ds-bad-text)]" aria-hidden />
          <span>
            <b>Blocked since {formatDayMonth(t.blocker.since, tz)}.</b> {t.blocker.description}
            {t.blocker.unblocker ? ` ${t.blocker.unblocker} can unblock it.` : ""}
          </span>
          <button type="button" disabled={busy} onClick={resolve} className={cn(COMPACT, "col-start-2 justify-self-start")}>
            {busy ? "Saving…" : "Mark Resolved"}
          </button>
        </div>
      ) : (
        !t.raisedByMe && (
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-2 rounded-[10px] bg-[var(--ds-badw)] p-3 text-[12.5px] text-[var(--ds-ink)]">
            <TriangleAlert className="mt-0.5 size-3.5 text-[var(--ds-bad-text)]" aria-hidden />
            <span>
              <b>Blocked?</b> Raise a blocker and your PM sees it straight away.
            </span>
            <button type="button" onClick={onRaise} className={cn(COMPACT, "col-start-2 justify-self-start")}>
              Raise Blocker
            </button>
          </div>
        )
      )}
    </DrawerFrame>
  );
}

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
    <DrawerFrame
      onSubmit={submit}
      header={<DrawerHeader onBack={onBack} backLabel="Back to Task" step="Blocker" title={t.title} subtitle={`${t.projectName} · your task`} />}
      footer={
        <DrawerFooter>
          <button type="button" onClick={onBack} className={SECONDARY}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? "Raising…" : "Raise Blocker"}
          </button>
        </DrawerFooter>
      }
    >
      <Field label="What is blocking you?" hint="Up to 500 characters. Your PM sees this.">
        <textarea value={what} onChange={(e) => setWhat(e.target.value)} maxLength={500} rows={4} required placeholder="For example: waiting on vendor test data" className={FIELD_TEXTAREA} />
      </Field>
      <Field label="Who can unblock it?" hint={`Someone on ${t.projectName}. They're told too.`}>
        <select value={who} onChange={(e) => setWho(e.target.value)} className={FIELD_INPUT}>
          <option value="">Choose a person or team (or leave it to your PM)</option>
          {(project?.people ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Blocked since" hint="Today or up to 90 days ago.">
        <input type="date" value={since} min={minDay} max={today} onChange={(e) => setSince(e.target.value)} className={cn(FIELD_INPUT, "w-[200px]")} />
      </Field>
      <Banner>{pms.length ? `${pms.join(" and ")} ${pms.length === 1 ? "is" : "are"} told straight away.` : "This project has no PM yet, so nobody is told automatically."}</Banner>
      {error && <DrawerError>{error}</DrawerError>}
    </DrawerFrame>
  );
}
