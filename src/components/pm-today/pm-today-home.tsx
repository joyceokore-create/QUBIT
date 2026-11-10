"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { KpiCard } from "@/components/ui/kpi-card";
import { HealthPill } from "@/components/ui/status-pill";
import { useListUrl } from "@/components/list/use-list-url";
import { dayKey, formatDate, formatDayMonth } from "@/lib/dates";
import { buildTodo, daysLate, itemsForTab, pmKpis, todoTabs, TODO_TABS, type PmToday, type PmTodayProject, type TodoItem, type TodoTab, type Tone } from "@/lib/pm-today";
import { CARD, FOCUS, PRIMARY, SECONDARY, TAB, TAB_ACTIVE_ON_CARD, TAB_COUNT, TABS_ROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX7 — PM › Today (UX plan D3/D4, UX7). Brief → four KPI cards → one "To do" list across the
 * PM's projects, most urgent first, with tabs and counts → My projects and Team this week.
 * Two actions open drawers here: move an overdue milestone, resolve a status dispute. The
 * rest go to the page that owns them (the weekly update lives in the project's This week tab).
 */

const SLIP_REASONS = ["Vendor or third party late", "Dependency not ready", "Scope changed", "Not enough people", "Testing found issues", "Other"] as const;
const GO_LIVE = ["No change", "Moves", "Not sure yet"] as const;
const RAG_FROM: Record<string, "Green" | "Amber" | "Red" | null> = { G: "Green", A: "Amber", R: "Red", N: null };
const TONE: Record<Tone, string> = { bad: "--bad-ink", warn: "--warn-ink", info: "--stage-exploring", muted: "--ink3" };
const COMPACT = `inline-flex h-[var(--control-h-compact)] items-center justify-center whitespace-nowrap rounded-[8px] px-2.5 text-[12px] font-semibold ${FOCUS}`;
const COMPACT_SECONDARY = `${COMPACT} border border-[var(--input)] bg-[var(--qcard)] text-[var(--ink2)] hover:text-[var(--qink)]`;
const COMPACT_PRIMARY = `${COMPACT} bg-[var(--brand)] text-[var(--onbrand)] hover:opacity-90`;
const FIELD = `w-full rounded-[var(--control-r)] border border-[var(--input)] bg-[var(--qcard)] px-3 text-[13px] text-[var(--qink)] placeholder:text-[var(--ink3)] ${FOCUS}`;

function Chip({ tone, label }: { tone: Tone; label: string }) {
  const tok = TONE[tone];
  return (
    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[12px] font-semibold" style={{ color: `var(${tok})`, background: `color-mix(in oklab, var(${tok}) 12%, transparent)` }}>
      {label}
    </span>
  );
}

type Drawer = { kind: "milestone"; id: string } | { kind: "dispute"; projectId: string } | null;

export function PmTodayHome({ today, brief, nowIso }: { today: PmToday; brief: ReactNode; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const tz = today.timeZone;
  const items = useMemo(() => buildTodo(today, now), [today, now]);
  const tabs = todoTabs(items);
  const list = useListUrl("pm-today", 10);
  const raw = list.get("tab") as TodoTab;
  const tab: TodoTab = TODO_TABS.includes(raw) ? raw : "all";
  const shown = itemsForTab(items, tab);
  const k = pmKpis(today);
  const [drawer, setDrawer] = useState<Drawer>(null);

  const healthLine = [
    k.byHealth.ok && `${k.byHealth.ok} on track`,
    k.byHealth.warn && `${k.byHealth.warn} at risk`,
    k.byHealth.bad && `${k.byHealth.bad} off track`,
    k.byHealth.none && `${k.byHealth.none} not rated`,
  ].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 p-[22px_24px_72px]">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[12px] font-semibold text-[var(--ink3)]">{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(now).replace(",", "")}</div>
          <h1 className="font-heading text-[24px] font-bold tracking-[-.5px] text-[var(--qink)]">Today</h1>
          <p className="mt-0.5 text-[13px] text-[var(--ink3)]">Everything across your projects that needs you, most urgent first.</p>
        </div>
        <Link href="/reports/update" className={SECONDARY}>
          Weekly update
        </Link>
      </header>

      {brief}

      <section aria-label="Your numbers" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="My projects" value={k.projects} context={healthLine || "No projects yet"} />
        <KpiCard label="Due in the next 7 days" value={k.dueNext7} context="Milestones" />
        <KpiCard
          label="Overdue"
          value={k.overdueMilestones + k.overdueTasks}
          context={`${k.overdueMilestones} ${k.overdueMilestones === 1 ? "milestone" : "milestones"} · ${k.overdueTasks} ${k.overdueTasks === 1 ? "task" : "tasks"}`}
        />
        <KpiCard label="Updates sent" value={k.updatesSent} unit={`of ${k.projects}`} context="Due Friday 17:00" />
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-label="To do" className={cn(CARD, "min-w-0 overflow-hidden")} style={{ background: "var(--cardbg)" }}>
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--border)] px-4 pt-3">
            <nav aria-label="To do views">
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
          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
              <p className="text-[14px] font-semibold text-[var(--qink)]">
                {today.projects.length === 0 ? "You don't run any active projects yet" : tab === "all" ? "Nothing needs you right now" : "Nothing here right now"}
              </p>
              <p className="max-w-[52ch] text-[12.5px] text-[var(--ink3)]">
                {today.projects.length === 0
                  ? "Projects you lead, or where you're a Project Manager member, appear here with what needs you on each."
                  : "Overdue milestones, unsent updates, gates, disputes, red items and your team's blockers appear here as they come up."}
              </p>
            </div>
          ) : (
            <ul>
              {shown.map((it) => (
                <TodoRow key={it.id} it={it} onAction={(a) => setDrawer(a)} />
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-4" aria-label="Side panel">
          <MyProjectsPanel projects={today.projects} tz={tz} />
          <section className={cn(CARD, "p-4")} style={{ background: "var(--cardbg)" }}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-[13.5px] font-semibold text-[var(--qink)]">Team this week</h2>
              <Link href="/people" className={`text-[12.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] ${FOCUS}`}>
                People →
              </Link>
            </div>
            {today.clashes.length === 0 ? (
              <p className="text-[12.5px] text-[var(--ink3)]">No one on your projects is booked over 100%.</p>
            ) : (
              <ul>
                {today.clashes.slice(0, 4).map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-2 border-t border-[var(--border)] py-2 first:border-0">
                    <span className="min-w-0">
                      <b className="block truncate text-[13px] font-semibold text-[var(--qink)]">{c.name} booked at {c.pct}%</b>
                      <span className="block truncate text-[12px] text-[var(--ink3)]">{c.projects.join(", ")}</span>
                    </span>
                    <Chip tone="warn" label="Clash" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]">
          {drawer?.kind === "milestone" && (
            <MilestoneForm m={today.overdueMilestones.find((x) => x.id === drawer.id)!} tz={tz} now={now} onDone={() => setDrawer(null)} />
          )}
          {drawer?.kind === "dispute" && <DisputeForm p={today.projects.find((x) => x.id === drawer.projectId)!} onDone={() => setDrawer(null)} />}
        </SheetContent>
      </Sheet>
    </main>
  );
}

function TodoRow({ it, onAction }: { it: TodoItem; onAction: (d: Drawer) => void }) {
  const a = it.action;
  const button =
    a.kind === "link" ? (
      <Link href={a.href} className={a.primary ? COMPACT_PRIMARY : COMPACT_SECONDARY}>
        {a.label}
      </Link>
    ) : (
      <button type="button" className={COMPACT_SECONDARY} onClick={() => onAction(a.kind === "milestone" ? { kind: "milestone", id: a.milestoneId } : { kind: "dispute", projectId: a.projectId })}>
        {a.label}
      </button>
    );
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto_90px_auto]">
      <div className="min-w-0">
        <span className="block truncate text-[13.5px] font-semibold text-[var(--qink)]">{it.title}</span>
        <span className="block truncate text-[12px] text-[var(--ink3)]">{it.sub}</span>
        <span className="mt-1 flex items-center gap-2 sm:hidden">
          <Chip tone={it.chip.tone} label={it.chip.label} />
          {it.when && <span className="text-[12px] text-[var(--ink2)]">{it.when}</span>}
        </span>
      </div>
      <span className="max-sm:hidden">
        <Chip tone={it.chip.tone} label={it.chip.label} />
      </span>
      <span className="text-[12.5px] text-[var(--ink2)] max-sm:hidden">{it.when}</span>
      {button}
    </li>
  );
}

function MyProjectsPanel({ projects, tz }: { projects: PmTodayProject[]; tz: string }) {
  return (
    <section className={cn(CARD, "p-4")} style={{ background: "var(--cardbg)" }}>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[13.5px] font-semibold text-[var(--qink)]">My projects</h2>
        <Link href="/projects?mine=1" className={`text-[12.5px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] ${FOCUS}`}>
          Projects →
        </Link>
      </div>
      {projects.length === 0 ? (
        <p className="text-[12.5px] text-[var(--ink3)]">None yet. When you lead a project or are added as its Project Manager, it appears here.</p>
      ) : (
        <ul>
          {projects.map((p) => (
            <li key={p.id} className="border-t border-[var(--border)] py-2.5 first:border-0">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/projects/${p.id}`} className={`min-w-0 truncate text-[13px] font-semibold text-[var(--qink)] hover:underline ${FOCUS}`}>
                  {p.name}
                </Link>
                {RAG_FROM[p.reported] ? <HealthPill value={RAG_FROM[p.reported]} /> : <span className="text-[12px] text-[var(--ink3)]">Not rated</span>}
              </div>
              <span className="block truncate text-[12px] text-[var(--ink3)]">
                {p.nextMilestone ? `Next: ${p.nextMilestone.name}${p.nextMilestone.dueDate ? ` · ${formatDayMonth(p.nextMilestone.dueDate, tz)}` : ""}` : "No upcoming milestone"}
              </span>
              <span className="mt-1.5 flex items-center gap-2">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${p.pct}%` }} />
                </span>
                <span className="w-[34px] text-right text-[12px] tabular-nums text-[var(--ink2)]">{p.pct}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DrawerHead({ step, title, sub }: { step: string; title: string; sub: string }) {
  return (
    <div className="border-b border-[var(--border)] px-5 py-4 pr-12">
      <div className="text-[11.5px] font-semibold text-[var(--ink3)]">{step}</div>
      <SheetTitle className="mt-0.5 text-[17px] font-bold text-[var(--qink)]">{title}</SheetTitle>
      <SheetDescription className="mt-0.5 text-[12.5px] text-[var(--ink3)]">{sub}</SheetDescription>
    </div>
  );
}

function Segmented<T extends string>({ label, options, value, onChange, render }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void; render?: (v: T) => string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-[var(--control-r)] bg-[var(--surface-2)] p-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={o === value}
          onClick={() => onChange(o)}
          className={cn(`h-[30px] rounded-[8px] px-3 text-[12.5px] font-semibold ${FOCUS}`, o === value ? "bg-[var(--qcard)] text-[var(--qink)] shadow-sm" : "text-[var(--ink3)] hover:text-[var(--qink)]")}
        >
          {render ? render(o) : o}
        </button>
      ))}
    </div>
  );
}

function MilestoneForm({ m, tz, now, onDone }: { m: PmToday["overdueMilestones"][number]; tz: string; now: Date; onDone: () => void }) {
  const router = useRouter();
  const today = dayKey(now, tz);
  const [newDate, setNewDate] = useState("");
  const [reason, setReason] = useState<(typeof SLIP_REASONS)[number] | "">("");
  const [effect, setEffect] = useState<(typeof GO_LIVE)[number]>("No change");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const late = daysLate(m.dueDate, now, tz);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!newDate || !reason) {
      setError(!newDate ? "Choose a new date." : "Say why it slipped.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/milestones/${m.id}/reschedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newDate, reason, goLiveEffect: effect, note: note.trim() || undefined }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      setError(body?.error?.message ?? "Couldn't save the new date. Try again.");
      return;
    }
    toast.success(`${m.name} moved to ${formatDate(new Date(`${newDate}T12:00:00Z`), "UTC")}.`);
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      <DrawerHead step="Milestone" title={m.name} sub={`${m.projectName} · was due ${formatDate(m.dueDate, tz)} · ${late} ${late === 1 ? "day" : "days"} late`} />
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--qink)]">New date</span>
          <input type="date" required min={today} value={newDate} onChange={(e) => setNewDate(e.target.value)} className={cn(FIELD, "h-[var(--control-h)] w-[200px]")} />
          <span className="text-[12px] text-[var(--ink3)]">Today or later.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--qink)]">Why it slipped</span>
          <select required value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className={cn(FIELD, "h-[var(--control-h)]")}>
            <option value="" disabled>
              Choose a reason
            </option>
            {SLIP_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--qink)]">Effect on go-live</span>
          <Segmented label="Effect on go-live" options={GO_LIVE} value={effect} onChange={setEffect} />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--qink)]">Note</span>
          <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: moved until the vendor environment is stable" className={cn(FIELD, "py-2")} />
          <span className="text-[12px] text-[var(--ink3)]">Optional. Up to 500 characters.</span>
        </label>
        <p className="rounded-[var(--control-r)] bg-[color-mix(in_oklab,var(--stage-exploring)_8%,transparent)] px-3 py-2.5 text-[12.5px] text-[var(--qink)]">
          The original date stays in the history. Saving clears the overdue flag.
        </p>
        {error && (
          <p role="alert" className="text-[12.5px] font-semibold text-[var(--bad-ink)]">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button type="button" onClick={onDone} className={SECONDARY}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy ? "Saving…" : "Save new date"}
        </button>
      </div>
    </form>
  );
}

const RAGS = ["Green", "Amber", "Red"] as const;
const RAG_WORD: Record<(typeof RAGS)[number], string> = { Green: "On track", Amber: "At risk", Red: "Off track" };
const ORDER: Record<string, number> = { Red: 0, Amber: 1, Green: 2 };

function DisputeForm({ p, onDone }: { p: PmTodayProject; onDone: () => void }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [computed, setComputed] = useState<(typeof RAGS)[number]>(RAG_FROM[p.calculated] ?? "Amber");
  const [rating, setRating] = useState<(typeof RAGS)[number]>(RAG_FROM[p.calculated] ?? "Amber");
  const [line, setLine] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // This week's check-in: its computed status (the baseline an override is measured against)
  // and the PM's line so far.
  useEffect(() => {
    let live = true;
    fetch(`/api/projects/${p.id}/checkin`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!live || !body?.data) return;
        const d = body.data as { computedRag: (typeof RAGS)[number]; narrative: string | null; lines: string[] };
        setComputed(d.computedRag);
        setRating(d.computedRag);
        setLine(d.narrative ?? d.lines?.[0] ?? "");
      })
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [p.id]);

  const differs = rating !== computed;
  const greener = ORDER[rating] > ORDER[computed];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!line.trim()) return setError("Write the line for the Head.");
    if (differs && reason.trim().length < 5) return setError("Say why the status differs from QUBIT's (at least 5 characters).");
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${p.id}/checkin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ narrative: line.trim(), ...(differs ? { ragOverride: rating, overrideReason: reason.trim() } : {}) }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      setError(body?.error?.message ?? "Couldn't save the status. Try again.");
      return;
    }
    toast.success(`${p.name}: ${RAG_WORD[rating]} confirmed and sent to the Head.`);
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      <DrawerHead
        step="Status dispute"
        title={p.name}
        sub={`You report ${RAG_FROM[p.reported] ? RAG_WORD[RAG_FROM[p.reported]!] : "no status"} · QUBIT calculates ${RAG_WORD[computed]}`}
      />
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <section>
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[.07em] text-[var(--ink3)]">Why it calculates {RAG_WORD[computed]}</h3>
          {p.reasons.length ? (
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-[var(--ink2)]">
              {p.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-[var(--ink2)]">No trouble signals right now.</p>
          )}
        </section>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--qink)]">Your status this week</span>
          <Segmented label="Your status this week" options={RAGS} value={rating} onChange={setRating} render={(r) => RAG_WORD[r]} />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--qink)]">Line for the Head</span>
          <textarea rows={3} maxLength={500} value={line} onChange={(e) => setLine(e.target.value)} disabled={!loaded} placeholder="For example: SIT 3 days behind; vendor SLA escalated" className={cn(FIELD, "py-2")} />
        </label>
        {differs && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[var(--qink)]">Why your status differs</span>
            <textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: the blocker clears on Monday; the vendor confirmed" className={cn(FIELD, "py-2")} />
            <span className="text-[12px] text-[var(--ink3)]">The Head sees this. It expires after 7 days.</span>
          </label>
        )}
        <p className={cn("rounded-[var(--control-r)] px-3 py-2.5 text-[12.5px] text-[var(--qink)]", greener ? "bg-[color-mix(in_oklab,var(--warn-ink)_10%,transparent)]" : "bg-[color-mix(in_oklab,var(--stage-exploring)_8%,transparent)]")}>
          {greener ? "Keeping a greener status than QUBIT calculates needs a reason, which the Head sees." : "Saving confirms this week's status and sends it to the Head's roll-up."}
        </p>
        {error && (
          <p role="alert" className="text-[12.5px] font-semibold text-[var(--bad-ink)]">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button type="button" onClick={onDone} className={SECONDARY}>
          Cancel
        </button>
        <button type="submit" disabled={busy || !loaded} className={PRIMARY}>
          {busy ? "Saving…" : "Confirm & send"}
        </button>
      </div>
    </form>
  );
}
