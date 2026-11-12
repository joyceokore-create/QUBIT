"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KpiCard, KpiRow } from "@/components/ui/kpi-card";
import { Bars, Meter, RagBar } from "@/components/ui/kpi-charts";
import { Chip, HealthPill } from "@/components/ui/status-pill";
import { TextLink } from "@/components/ui/text-link";
import { Banner, Columns, Foot, ListRow, Panel, PanelList, PanelRow } from "@/components/ui/panel";
import { Choice, Drawer, DrawerError, DrawerFooter, DrawerFrame, DrawerHeader, DrawerSection, Field, FIELD_INPUT, FIELD_TEXTAREA } from "@/components/ui/drawer";
import { PageHeader } from "@/components/list/page-header";
import { useListUrl } from "@/components/list/use-list-url";
import { dayKey, formatDate, formatDayMonth } from "@/lib/dates";
import { buildTodo, daysLate, itemsForTab, pmKpis, todoTabs, TODO_TABS, type PmToday, type PmTodayProject, type TodoItem, type TodoTab } from "@/lib/pm-today";
import { COMPACT, FOCUS, PRIMARY, SECONDARY, TAB, TAB_ACTIVE_ON_CARD, TAB_COUNT, TABS_ROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX7 + UX fidelity F1 — PM › Today, built to design spec v2 (docs/08). Brief → four KPI cards
 * with mini charts → the "To Do" panel across the PM's projects, most urgent first (All ·
 * Overdue · Gates · Updates · Risks) → My Projects and Team This Week. Two actions open drawers
 * here: move an overdue milestone, resolve a status dispute. The rest go to the page that owns
 * them (the weekly update lives in the project's This Week tab).
 */

const SLIP_REASONS = ["Vendor or third party late", "Dependency not ready", "Scope changed", "Not enough people", "Testing found issues", "Other"] as const;
const GO_LIVE = ["No change", "Moves", "Not sure yet"] as const;
const RAG_FROM: Record<string, "Green" | "Amber" | "Red" | null> = { G: "Green", A: "Amber", R: "Red", N: null };
type OpenDrawer = { kind: "milestone"; id: string } | { kind: "dispute"; projectId: string } | null;

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
  const [drawer, setDrawer] = useState<OpenDrawer>(null);

  const healthLine = [
    k.byHealth.ok && `${k.byHealth.ok} on track`,
    k.byHealth.warn && `${k.byHealth.warn} at risk`,
    k.byHealth.bad && `${k.byHealth.bad} off track`,
    k.byHealth.none && `${k.byHealth.none} not rated`,
  ].filter(Boolean).join(" · ");

  const dateLine = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(now).replace(",", "");
  const due = k.projects - k.updatesSent;
  const overdue = k.overdueMilestones + k.overdueTasks;

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-[22px_22px_72px]">
      <PageHeader eyebrow={dateLine} title="Today" description="Everything across your projects that needs you, most urgent first." />

      {brief}

      <KpiRow count={4} label="Your numbers">
        <KpiCard label="My Projects" value={k.projects} context={healthLine || "No projects yet"} chart={k.projects ? <RagBar ok={k.byHealth.ok} warn={k.byHealth.warn} bad={k.byHealth.bad} /> : undefined} />
        <KpiCard label="Due in the Next 7 Days" value={k.dueNext7} context="Milestones" chart={<Bars values={k.dueNext7PerDay} />} />
        <KpiCard
          label="Overdue"
          value={overdue}
          context={`${k.overdueMilestones} ${k.overdueMilestones === 1 ? "milestone" : "milestones"} · ${k.overdueTasks} ${k.overdueTasks === 1 ? "task" : "tasks"}`}
          contextTone={overdue ? "bad" : "neutral"}
        />
        <KpiCard
          label="Updates Due Friday"
          value={due}
          unit={`of ${k.projects}`}
          context={`${k.updatesSent} sent${k.updatesDrafted ? `, ${k.updatesDrafted} ${k.updatesDrafted === 1 ? "draft" : "drafts"} ready` : ""}`}
          chart={k.projects ? <Meter value={k.updatesSent} max={k.projects} tone="ok" /> : undefined}
        />
      </KpiRow>

      <Columns
        main={
          <Panel title="To Do" labelledBy="pm-todo" action={<TextLink href="/board">Open My Board</TextLink>}>
            <nav aria-label="To do views">
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
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
                <p className="text-[14px] font-semibold text-[var(--ds-ink)]">
                  {today.projects.length === 0 ? "You don't run any active projects yet" : tab === "all" ? "Nothing needs you right now" : "Nothing here right now"}
                </p>
                <p className="max-w-[52ch] text-[12.5px] text-[var(--ds-ink3)]">
                  {today.projects.length === 0
                    ? "Projects you lead, or where you're a Project Manager member, appear here with what needs you on each."
                    : "Overdue milestones, unsent updates, gates, disputes, red risks and your team's blockers appear here as they come up."}
                </p>
              </div>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {shown.map((it) => (
                  <TodoRow key={it.id} it={it} onAction={(a) => setDrawer(a)} />
                ))}
              </ul>
            )}
            {shown.length > 0 && <Foot>One list, most urgent first. Each action opens where the work is done.</Foot>}
          </Panel>
        }
        rail={
          <>
            <MyProjectsPanel projects={today.projects} tz={tz} />
            <Panel title="Team This Week" action={<TextLink href="/people">People</TextLink>}>
              {today.clashes.length === 0 ? (
                <p className="text-[12.5px] text-[var(--ds-ink3)]">No one on your projects is booked over 100%.</p>
              ) : (
                <PanelList>
                  {today.clashes.slice(0, 4).map((c) => (
                    <PanelRow key={c.name} title={`${c.name} booked at ${c.pct}%`} sub={c.projects.join(" and ")} chip={<Chip tone="warn">Clash</Chip>} />
                  ))}
                </PanelList>
              )}
            </Panel>
          </>
        }
      />

      <Drawer open={!!drawer} onClose={() => setDrawer(null)}>
        {drawer?.kind === "milestone" && <MilestoneForm m={today.overdueMilestones.find((x) => x.id === drawer.id)!} tz={tz} now={now} onDone={() => setDrawer(null)} />}
        {drawer?.kind === "dispute" && <DisputeForm p={today.projects.find((x) => x.id === drawer.projectId)!} onDone={() => setDrawer(null)} />}
      </Drawer>
    </main>
  );
}

function TodoRow({ it, onAction }: { it: TodoItem; onAction: (d: OpenDrawer) => void }) {
  const a = it.action;
  const button =
    a.kind === "link" ? (
      <Link href={a.href} className={COMPACT}>
        {a.label}
      </Link>
    ) : (
      <button type="button" className={COMPACT} onClick={() => onAction(a.kind === "milestone" ? { kind: "milestone", id: a.milestoneId } : { kind: "dispute", projectId: a.projectId })}>
        {a.label}
      </button>
    );
  return <ListRow title={it.title} sub={it.sub} chip={<Chip tone={it.chip.tone}>{it.chip.label}</Chip>} meta={it.when} action={button} />;
}

const METER_TONE = { G: "ok", A: "warn", R: "bad", N: "info" } as const;

function MyProjectsPanel({ projects, tz }: { projects: PmTodayProject[]; tz: string }) {
  return (
    <Panel title="My Projects" action={<TextLink href="/projects?mine=1">Projects</TextLink>}>
      {projects.length === 0 ? (
        <p className="text-[12.5px] text-[var(--ds-ink3)]">None yet. When you lead a project or are added as its Project Manager, it appears here.</p>
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
              sub={p.nextMilestone ? `Next: ${p.nextMilestone.name}${p.nextMilestone.dueDate ? ` · ${formatDayMonth(p.nextMilestone.dueDate, tz)}` : ""}` : "No upcoming milestone"}
              chip={RAG_FROM[p.reported] ? <HealthPill value={RAG_FROM[p.reported]} /> : <Chip>Not rated</Chip>}
            >
              <span className="flex items-center gap-2">
                <Meter value={p.pct} max={100} tone={METER_TONE[(p.reported as keyof typeof METER_TONE) ?? "N"] ?? "info"} className="flex-1" />
                <span className="w-[34px] text-right text-[11.5px] tabular-nums text-[var(--ds-ink3)]">{p.pct}%</span>
              </span>
            </PanelRow>
          ))}
        </PanelList>
      )}
    </Panel>
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
    <DrawerFrame
      onSubmit={submit}
      header={<DrawerHeader step="Milestone" title={m.name} subtitle={`${m.projectName} · was due ${formatDate(m.dueDate, tz)} · ${late} ${late === 1 ? "day" : "days"} late`} />}
      footer={
        <DrawerFooter>
          <button type="button" onClick={onDone} className={SECONDARY}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? "Saving…" : "Save New Date"}
          </button>
        </DrawerFooter>
      }
    >
      <Field label="New date" hint="Today or later.">
        <input type="date" required min={today} value={newDate} onChange={(e) => setNewDate(e.target.value)} className={cn(FIELD_INPUT, "w-[200px]")} />
      </Field>
      <Field label="Why it slipped">
        <select required value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className={FIELD_INPUT}>
          <option value="" disabled>
            Choose a reason
          </option>
          {SLIP_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>
      <DrawerSection title="Effect on Go-Live">
        <Choice label="Effect on go-live" value={effect} options={GO_LIVE.map((g) => ({ value: g, label: g }))} onChange={setEffect} />
      </DrawerSection>
      <Field label="Note" hint="Optional. Up to 500 characters.">
        <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: moved until the vendor environment is stable" className={FIELD_TEXTAREA} />
      </Field>
      <Banner>The original date stays in the history. Saving clears the overdue flag.</Banner>
      {error && <DrawerError>{error}</DrawerError>}
    </DrawerFrame>
  );
}

const RAGS = ["Green", "Amber", "Red"] as const;
const RAG_WORD: Record<(typeof RAGS)[number], string> = { Green: "On track", Amber: "At risk", Red: "Off track" };
const RAG_TONE = { Green: "ok", Amber: "warn", Red: "bad" } as const;
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
    if (differs && reason.trim().length < 5) return setError("Say why your rating differs from QUBIT's (at least 5 characters).");
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
      setError(body?.error?.message ?? "Couldn't save the rating. Try again.");
      return;
    }
    toast.success(`${p.name}: ${RAG_WORD[rating]} confirmed and sent to the Head.`);
    onDone();
    router.refresh();
  }

  return (
    <DrawerFrame
      onSubmit={submit}
      header={<DrawerHeader step="Status Dispute" title={p.name} subtitle={`You reported ${RAG_FROM[p.reported] ? RAG_WORD[RAG_FROM[p.reported]!] : "no status"} · QUBIT calculates ${RAG_WORD[computed]}`} />}
      footer={
        <DrawerFooter>
          <button type="button" onClick={onDone} className={SECONDARY}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !loaded} className={PRIMARY}>
            {busy ? "Saving…" : "Save Rating"}
          </button>
        </DrawerFooter>
      }
    >
      <DrawerSection title={`Why It Calculates ${RAG_WORD[computed].replace(/\b\w/g, (c) => c.toUpperCase())}`}>
        {p.reasons.length ? (
          <ul className="m-0 flex list-disc flex-col gap-[5px] pl-[18px] text-[13px] text-[var(--ds-ink2)]">
            {p.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-[var(--ds-ink2)]">No trouble signals right now.</p>
        )}
      </DrawerSection>
      <DrawerSection title="Your Rating">
        <Choice label="Your rating" rag value={rating} options={RAGS.map((r) => ({ value: r, label: RAG_WORD[r], tone: RAG_TONE[r] }))} onChange={setRating} />
      </DrawerSection>
      <Field label="Line for the Head">
        <textarea rows={3} maxLength={500} value={line} onChange={(e) => setLine(e.target.value)} disabled={!loaded} placeholder="For example: SIT 3 days behind; vendor SLA escalated" className={FIELD_TEXTAREA} />
      </Field>
      {differs && (
        <Field label="Why your rating differs" hint="The Head sees this. It expires after 7 days.">
          <textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: the blocker clears on Monday; the vendor confirmed" className={FIELD_TEXTAREA} />
        </Field>
      )}
      <Banner tone={greener ? "warn" : "info"}>{greener ? "Keeping a greener rating than QUBIT calculates needs a reason, which the Head sees." : "Saving confirms this week's rating and sends it to the Head's roll-up."}</Banner>
      {error && <DrawerError>{error}</DrawerError>}
    </DrawerFrame>
  );
}
