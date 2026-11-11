"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerHeader } from "@/components/ui/drawer";
import { PageHeader } from "@/components/list/page-header";
import { FilterChips, FilterSelect, ListToolbar, SearchField, type ActiveFilter, type FilterOption } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { paginate } from "@/lib/list-state";
import { formatDate, formatDayMonth } from "@/lib/dates";
import {
  AGE_BUCKETS,
  AGE_LABEL,
  APPROVALS_CHANGED,
  ageDays,
  ageLabel,
  approvalTabs,
  approvalTitle,
  filterApprovals,
  itemsForTab,
  parseTab,
  projectOptions,
  type ApprovalIdea,
  type ApprovalItem,
  type ApprovalsFeed,
  type ApprovalStaffing,
  type ApprovalTab,
  type RollupSummary,
} from "@/lib/approvals";
import { FOCUS, PRIMARY, SECONDARY, TAB, TAB_ACTIVE, TAB_COUNT, TABS_ROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX8 — Approvals v1 (UX plan D5). One list of ideas and staffing requests waiting for this
 * person, oldest first, with All · Ideas · Staffing tabs, search, Project and Age filters, and
 * always-visible pagination (view state in the URL). Each row's action opens a right-hand
 * drawer — Triage for an idea, Review for a staffing request — which posts to the existing
 * routes. After a decision: toast, close, refresh (and the sidebar badge recounts).
 */

const FILTER_KEYS = ["project", "age"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
const FILTER_LABEL: Record<FilterKey, string> = { project: "Project", age: "Age" };

const COMPACT_SECONDARY = `inline-flex h-[var(--control-h-compact)] items-center justify-center whitespace-nowrap rounded-[8px] border border-[var(--input)] bg-[var(--qcard)] px-2.5 text-[12px] font-semibold text-[var(--ink2)] hover:text-[var(--qink)] ${FOCUS}`;
const FIELD = `w-full rounded-[var(--control-r)] border border-[var(--input)] bg-[var(--qcard)] px-3 text-[13px] text-[var(--qink)] placeholder:text-[var(--ink3)] ${FOCUS}`;
const NOTE = "rounded-[var(--control-r)] bg-[color-mix(in_oklab,var(--stage-exploring)_8%,transparent)] px-3 py-2.5 text-[12.5px] text-[var(--qink)]";

// Ideas: New in the intake grey, Reviewing in the exploring blue (as on the Ideas page);
// an open staffing request in the waiting amber (as on People › Staffing requests).
const CHIP_TOKEN: Record<string, string> = { New: "--stage-intake", Reviewing: "--stage-exploring", Open: "--warn-ink" };

function Chip({ label }: { label: string }) {
  const tok = CHIP_TOKEN[label] ?? "--ink3";
  return (
    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[12px] font-semibold" style={{ color: `var(${tok})`, background: `color-mix(in oklab, var(${tok}) 12%, transparent)` }}>
      {label}
    </span>
  );
}

type Drawer = { kind: ApprovalItem["kind"]; id: string } | null;

/** POST JSON to an existing decision route; the route's own message on failure. */
async function post(url: string, body: unknown, fallback: string): Promise<string | null> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (res?.ok) return null;
  const data = res ? ((await res.json().catch(() => null)) as { error?: { message?: string } } | null) : null;
  return data?.error?.message ?? fallback;
}

export function ApprovalsClient({
  feed,
  projects,
  tenantName,
  timeZone,
  nowIso,
}: {
  feed: ApprovalsFeed;
  projects: { id: string; code: string; name: string }[];
  tenantName: string;
  timeZone: string;
  nowIso: string;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const list = useListUrl("approvals", 10);
  const [drawer, setDrawer] = useState<Drawer>(null);

  const projectOpts = useMemo<FilterOption[]>(() => projectOptions(feed.items), [feed.items]);
  const opts: Record<FilterKey, FilterOption[]> = { project: projectOpts, age: AGE_BUCKETS.map((b) => ({ value: b, label: AGE_LABEL[b] })) };
  // Only allow-listed values reach the filter; an odd URL reads as "all".
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, opts[k].some((o) => o.value === list.get(k)) ? list.get(k) : ""])) as Record<FilterKey, string>;

  // Tabs offer only the kinds this person may decide; counts follow search + filters.
  const filtered = useMemo(() => filterApprovals(feed.items, { q: list.q, project: f.project, age: f.age }, now, timeZone), [feed.items, list.q, f.project, f.age, now, timeZone]);
  const tabs = approvalTabs(filtered).filter((t) => t.key === "all" || (t.key === "ideas" ? feed.can.ideas : feed.can.staffing));
  const rawTab = parseTab(list.get("tab"));
  const tab: ApprovalTab = tabs.some((t) => t.key === rawTab) ? rawTab : "all";
  const shown = itemsForTab(filtered, tab);
  const { rows, info } = paginate(shown, list.page, list.size);

  const active: ActiveFilter[] = FILTER_KEYS.filter((k) => f[k]).map((k) => ({
    key: k,
    label: `${FILTER_LABEL[k]}: ${opts[k].find((o) => o.value === f[k])?.label ?? f[k]}`,
  }));
  const isFiltered = active.length > 0 || !!list.q;
  const clearAll = () => list.clear([...FILTER_KEYS]);

  const open = drawer ? feed.items.find((i) => i.kind === drawer.kind && i.id === drawer.id) : undefined;
  const searchLabel = feed.can.ideas && feed.can.staffing ? "Search approvals by project or person" : feed.can.ideas ? "Search ideas by title or person" : "Search requests by project or person";

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <PageHeader eyebrow={tenantName} title="Approvals" description="Ideas and staffing requests waiting for your decision." />

      {feed.rollup && <RollupBanner rollup={feed.rollup} />}

      <nav aria-label="Approval types">
        <ul className={TABS_ROW}>
          {tabs.map((t) => (
            <li key={t.key}>
              <button type="button" aria-current={t.key === tab ? "page" : undefined} onClick={() => list.set({ tab: t.key === "all" ? null : t.key })} className={cn(TAB, t.key === tab && TAB_ACTIVE)}>
                {t.label}
                <span className={TAB_COUNT}>{t.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-2">
        <ListToolbar>
          <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder={searchLabel} label="Search approvals" className="sm:w-[320px]" />
          {feed.can.staffing && <FilterSelect label="Project" allLabel="All projects" value={f.project} options={opts.project} onChange={(v) => list.set({ project: v })} />}
          <FilterSelect label="Age" allLabel="Any age" value={f.age} options={opts.age} onChange={(v) => list.set({ age: v })} />
          <FilterChips filters={active} onRemove={(k) => list.set({ [k]: null })} onClearAll={clearAll} />
        </ListToolbar>
      </div>

      <TableCard footer={<TableFooter info={info} noun="approvals" onPage={list.setPage} onSize={list.setSize} />}>
        {rows.length === 0 ? (
          isFiltered ? (
            <ListEmpty
              filtered
              noun={tab === "ideas" ? "ideas" : tab === "staffing" ? "staffing requests" : "approvals"}
              onClear={clearAll}
              hint={f.project && tab !== "staffing" && feed.can.ideas ? "Ideas have no project until they are accepted, so the Project filter hides them." : undefined}
            />
          ) : (
            <EmptyQueue tab={tab} can={feed.can} />
          )
        ) : (
          <ul aria-label="Waiting for your decision">
            {rows.map((item) => (
              <ApprovalRow key={`${item.kind}-${item.id}`} item={item} days={ageDays(item.createdAt, now, timeZone)} onOpen={() => setDrawer({ kind: item.kind, id: item.id })} />
            ))}
          </ul>
        )}
      </TableCard>

      <Drawer open={!!open} onClose={() => setDrawer(null)}>
        {open?.kind === "idea" && <TriageDrawer key={open.id} idea={open} projects={projects} tz={timeZone} now={now} onDone={() => setDrawer(null)} />}
        {open?.kind === "staffing" && <ReviewDrawer key={open.id} req={open} tz={timeZone} now={now} onDone={() => setDrawer(null)} />}
      </Drawer>
    </main>
  );
}

function RollupBanner({ rollup }: { rollup: RollupSummary }) {
  const counts = `${rollup.received} of ${rollup.total} ${rollup.total === 1 ? "update" : "updates"} in`;
  return (
    <aside aria-label="Weekly roll-up" className={cn(NOTE, "flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4")}>
      <p className="flex items-start gap-2">
        <Info className="mt-0.5 size-4 flex-none text-[var(--stage-exploring)]" aria-hidden />
        <span>
          {rollup.approved ? (
            <>
              <b className="font-semibold">Weekly roll-up: approved for this week</b> ({counts}). It lives in Reports › This week.
            </>
          ) : (
            <>
              <b className="font-semibold">Weekly roll-up: {counts}.</b> It is approved in Reports › This week.
            </>
          )}
        </span>
      </p>
      <Link href="/reports" className={`flex-none pl-6 text-[12.5px] font-semibold text-[var(--qink)] underline-offset-2 hover:underline sm:pl-0 ${FOCUS}`}>
        Open roll-up →
      </Link>
    </aside>
  );
}

function EmptyQueue({ tab, can }: { tab: ApprovalTab; can: ApprovalsFeed["can"] }) {
  const title = tab === "ideas" ? "No ideas waiting for triage" : tab === "staffing" ? "No staffing requests waiting" : "Nothing is waiting for your decision";
  const ideas = "New ideas appear here when someone submits one, and stay until you accept, park or merge them.";
  const staffing = "Staffing requests appear here when a project manager asks for someone, and stay until you fill or decline them.";
  const hint = tab === "ideas" ? ideas : tab === "staffing" ? staffing : [can.ideas && ideas, can.staffing && staffing].filter(Boolean).join(" ");
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <p className="text-[14px] font-semibold text-[var(--qink)]">{title}</p>
      <p className="max-w-[56ch] text-[12.5px] text-[var(--ink3)]">{hint}</p>
    </div>
  );
}

function ApprovalRow({ item, days, onOpen }: { item: ApprovalItem; days: number; onOpen: () => void }) {
  const title = approvalTitle(item);
  const sub =
    item.kind === "idea"
      ? ["Idea", item.personName && `submitted by ${item.personName}`].filter(Boolean).join(" · ")
      : `Staffing · requested by ${item.personName} · ${item.allocationPct}%`;
  const chip = item.kind === "idea" ? item.status : "Open";
  const age = ageLabel(days);
  const action = item.kind === "idea" ? "Triage" : "Review";
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_96px_80px_auto]">
      <div className="min-w-0">
        <span className="block truncate text-[13.5px] font-semibold text-[var(--qink)]" title={title}>
          {title}
        </span>
        <span className="block truncate text-[12px] text-[var(--ink3)]">{sub}</span>
        <span className="mt-1 flex items-center gap-2 sm:hidden">
          <Chip label={chip} />
          <span className="text-[12px] text-[var(--ink2)]">{age}</span>
        </span>
      </div>
      <span className="max-sm:hidden">
        <Chip label={chip} />
      </span>
      <span className="text-[12.5px] tabular-nums text-[var(--ink2)] max-sm:hidden">{age}</span>
      <button type="button" onClick={onOpen} className={COMPACT_SECONDARY} aria-label={`${action}: ${title}`}>
        {action}
      </button>
    </li>
  );
}

// ── Drawers ────────────────────────────────────────────────────────────────────

const ago = (days: number) => (days === 0 ? "today" : `${ageLabel(days)} ago`);

/** The design-spec drawer header (step line, 17/700 title, subtitle; bordered close). */
function DrawerHead({ step, title, sub }: { step: string; title: string; sub: string }) {
  return <DrawerHeader step={step} title={title} subtitle={sub} />;
}

function Details({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[var(--ink3)]">{k}</dt>
          <dd className="whitespace-pre-line break-words text-[var(--qink)]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Segmented<T extends string>({ label, options, value, onChange, render }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void; render: (v: T) => string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 self-start rounded-[var(--control-r)] bg-[var(--surface-2)] p-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={o === value}
          onClick={() => onChange(o)}
          className={cn(`h-[30px] rounded-[8px] px-3 text-[12.5px] font-semibold ${FOCUS}`, o === value ? "bg-[var(--qcard)] text-[var(--qink)] shadow-sm" : "text-[var(--ink3)] hover:text-[var(--qink)]")}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[.07em] text-[var(--ink3)]">{children}</h3>;
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-[12.5px] font-semibold text-[var(--bad-ink)]">
      {error}
    </p>
  );
}

/** After any decision: toast, close, refresh the list, and let the sidebar badge recount. */
function useDone(onDone: () => void) {
  const router = useRouter();
  return (message: string) => {
    toast.success(message);
    onDone();
    router.refresh();
    window.dispatchEvent(new Event(APPROVALS_CHANGED));
  };
}

const TRIAGE = ["accept", "park", "merge"] as const;
type Triage = (typeof TRIAGE)[number];
const TRIAGE_LABEL: Record<Triage, string> = { accept: "Accept", park: "Park", merge: "Merge" };

function TriageDrawer({ idea, projects, tz, now, onDone }: { idea: ApprovalIdea; projects: { id: string; code: string; name: string }[]; tz: string; now: Date; onDone: () => void }) {
  const done = useDone(onDone);
  const [mode, setMode] = useState<Triage>("accept");
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = ageDays(idea.createdAt, now, tz);
  const reviewing = idea.status === "Reviewing";

  async function triage(body: Record<string, unknown>, message: string) {
    setBusy(true);
    setError(null);
    const err = await post(`/api/ideas/${idea.id}/triage`, body, "Triage failed. Try again.");
    setBusy(false);
    if (err) return setError(err);
    done(message);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "park") {
      if (reason.trim().length < 5) return setError("Say why it is being parked (at least 5 characters).");
      await triage({ action: "park", reason: reason.trim() }, `“${idea.title}” parked. The submitter has been told why.`);
    } else if (mode === "merge") {
      if (!target) return setError("Choose the project to merge into.");
      const p = projects.find((x) => x.id === target);
      await triage({ action: "merge", projectId: target }, `“${idea.title}” merged into ${p?.name ?? "the project"}.`);
    }
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      <DrawerHead step={`Idea · ${idea.status}`} title={idea.title} sub={`Submitted${idea.personName ? ` by ${idea.personName}` : ""} · ${ago(days)}`} />
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <section>
          <SectionTitle>The idea</SectionTitle>
          <Details
            rows={[
              ["Sponsor", idea.sponsor],
              ["Problem", idea.problem],
              ["Expected value", idea.expectedValue ?? <span className="text-[var(--ink3)]">Not given</span>],
              ...(idea.suggestedPortfolioName ? ([["Portfolio", `${idea.suggestedPortfolioName} (suggested)`]] as [string, ReactNode][]) : []),
              ["Submitted", `${formatDate(idea.createdAt, tz)}${idea.personName ? ` by ${idea.personName}` : ""}`],
            ]}
          />
        </section>

        <section>
          <SectionTitle>Status</SectionTitle>
          <p className="text-[13px] text-[var(--ink2)]">
            {reviewing ? "Marked as reviewing. Move it back to New if it isn't being looked at yet." : "New. Mark it as reviewing while you look into it; it stays in this list either way."}
          </p>
          <button type="button" disabled={busy} onClick={() => void triage({ action: "review", reviewing: !reviewing }, reviewing ? `“${idea.title}” moved back to New.` : `“${idea.title}” marked as reviewing.`)} className={cn(SECONDARY, "mt-2")}>
            {reviewing ? "Back to New" : "Mark as reviewing"}
          </button>
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle>Decision</SectionTitle>
          <Segmented label="Decision" options={TRIAGE} value={mode} onChange={(m) => {
              setMode(m);
              setError(null);
            }} render={(m) => TRIAGE_LABEL[m]} />
          {mode === "accept" && <p className={NOTE}>Accepting opens the project wizard with this idea filled in. The idea is marked Accepted when you create the project.</p>}
          {mode === "park" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-[var(--qink)]">Why is it parked?</span>
              <textarea rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: good idea, wrong quarter. Revisit after the migration." className={cn(FIELD, "py-2")} />
              <span className="text-[12px] text-[var(--ink3)]">The submitter is told why. At least 5 characters.</span>
            </label>
          )}
          {mode === "merge" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-[var(--qink)]">Merge into which project?</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)} className={cn(FIELD, "h-[var(--control-h)]")}>
                <option value="">Choose a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
              <span className="text-[12px] text-[var(--ink3)]">The idea is kept on that project&apos;s record. Active projects only.</span>
            </label>
          )}
        </section>
        <ErrorLine error={error} />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button type="button" onClick={onDone} className={SECONDARY}>
          Cancel
        </button>
        {mode === "accept" ? (
          <Link href={`/projects/new?fromIdea=${idea.id}`} className={PRIMARY}>
            Accept in project wizard
          </Link>
        ) : (
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? "Saving…" : mode === "park" ? "Park idea" : "Merge idea"}
          </button>
        )}
      </div>
    </form>
  );
}

interface BenchRow {
  userId: string;
  name: string;
  totalPct: number;
  awayDaysInWindow: number;
}

const REVIEW = ["fill", "decline"] as const;
type Review = (typeof REVIEW)[number];
const REVIEW_LABEL: Record<Review, string> = { fill: "Fill", decline: "Decline" };

function ReviewDrawer({ req, tz, now, onDone }: { req: ApprovalStaffing; tz: string; now: Date; onDone: () => void }) {
  const done = useDone(onDone);
  const [mode, setMode] = useState<Review>("fill");
  const [bench, setBench] = useState<BenchRow[] | null>(null);
  const [benchError, setBenchError] = useState(false);
  const [pick, setPick] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = ageDays(req.createdAt, now, tz);
  const windowText = `${formatDayMonth(req.windowStart, tz)} – ${formatDate(req.windowEnd, tz)}`;

  // Candidates for the window: people who've held the role first, then least booked; leave surfaced.
  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams({ start: req.windowStart, end: req.windowEnd, role: req.role });
    fetch(`/api/staffing/bench?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bench"))))
      .then((d: { data?: BenchRow[] }) => live && setBench(d.data ?? []))
      .catch(() => {
        if (!live) return;
        setBench([]);
        setBenchError(true);
      });
    return () => {
      live = false;
    };
  }, [req.windowStart, req.windowEnd, req.role]);

  const chosen = bench?.find((b) => b.userId === pick);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "fill" && !chosen) return setError("Choose who fills it.");
    if (mode === "decline" && reason.trim().length < 3) return setError("Say why it is declined (at least 3 characters).");
    setBusy(true);
    setError(null);
    const err = await post(
      `/api/staffing/requests/${req.id}`,
      mode === "fill" ? { action: "fill", userId: pick } : { action: "decline", reason: reason.trim() },
      "Couldn't resolve the request. Try again.",
    );
    setBusy(false);
    if (err) return setError(err);
    done(mode === "fill" ? `${chosen?.name ?? "They"} added to ${req.projectName} as ${req.role}.` : `Request declined. ${req.personName} has been told why.`);
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      <DrawerHead step="Staffing request" title={approvalTitle(req)} sub={`Requested by ${req.personName} · ${ago(days)}`} />
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <section>
          <SectionTitle>The request</SectionTitle>
          <Details
            rows={[
              [
                "Project",
                <Link key="p" href={`/projects/${req.projectId}`} className={`font-semibold hover:underline ${FOCUS}`}>
                  {req.projectCode} · {req.projectName}
                </Link>,
              ],
              ["Role", req.role],
              ["Allocation", `${req.allocationPct}%`],
              ["Window", windowText],
              ["Note", req.note ?? <span className="text-[var(--ink3)]">None</span>],
              ["Raised", `${formatDate(req.createdAt, tz)} by ${req.personName}`],
            ]}
          />
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle>Decision</SectionTitle>
          <Segmented label="Decision" options={REVIEW} value={mode} onChange={(m) => {
              setMode(m);
              setError(null);
            }} render={(m) => REVIEW_LABEL[m]} />
          {mode === "fill" ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12.5px] text-[var(--ink3)]">
                People who have worked as {req.role} come first, then the least booked. Leave inside the window is shown. Filling adds them to the project at {req.allocationPct}% for the window.
              </p>
              {bench === null ? (
                <p className="text-[12.5px] text-[var(--ink3)]">Loading people…</p>
              ) : bench.length === 0 ? (
                <p className="text-[12.5px] text-[var(--ink3)]">{benchError ? "Couldn't load people. Close and try again." : "No active people to choose from."}</p>
              ) : (
                <div role="radiogroup" aria-label="Fill with" className="max-h-[320px] overflow-y-auto rounded-[var(--control-r)] border border-[var(--border)]">
                  {bench.map((b) => (
                    <label key={b.userId} className={cn("flex cursor-pointer items-center gap-3 border-b border-[var(--border)] px-3 py-2 last:border-0", pick === b.userId && "bg-[color-mix(in_oklab,var(--brand)_6%,transparent)]")}>
                      <input type="radio" name="fill-with" value={b.userId} checked={pick === b.userId} onChange={() => setPick(b.userId)} className="accent-[var(--brand)]" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--qink)]">{b.name}</span>
                      {b.awayDaysInWindow > 0 && (
                        <span className="whitespace-nowrap rounded-full bg-[color-mix(in_oklab,var(--warn-ink)_12%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--warn-ink)]">
                          {b.awayDaysInWindow}d leave
                        </span>
                      )}
                      <span className="min-w-[78px] whitespace-nowrap text-right text-[12px] tabular-nums text-[var(--ink3)]">{b.totalPct}% booked</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-[var(--qink)]">Why is it declined?</span>
              <textarea rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: no testers free until next quarter." className={cn(FIELD, "py-2")} />
              <span className="text-[12px] text-[var(--ink3)]">{req.personName} is told why. Up to 300 characters.</span>
            </label>
          )}
        </section>
        <ErrorLine error={error} />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button type="button" onClick={onDone} className={SECONDARY}>
          Cancel
        </button>
        <button type="submit" disabled={busy || (mode === "fill" && !chosen)} className={PRIMARY}>
          {busy ? "Saving…" : mode === "fill" ? (chosen ? `Fill with ${chosen.name}` : "Fill request") : "Decline request"}
        </button>
      </div>
    </form>
  );
}
