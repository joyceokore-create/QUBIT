"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/list/page-header";
import { FilterChips, FilterSelect, ListToolbar, SearchField } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { Banner, ListRow } from "@/components/ui/panel";
import { Chip } from "@/components/ui/status-pill";
import { TabStrip } from "@/components/ui/tab-strip";
import { Choice, Drawer, DrawerError, DrawerFooter, DrawerFrame, DrawerHeader, DrawerSection, DrawerText, Field, FIELD_INPUT, FIELD_TEXTAREA, Kv } from "@/components/ui/drawer";
import { dayKey, formatDate, formatDayMonth } from "@/lib/dates";
import {
  canCompleteGlcAction,
  DECISION_TAB_LABEL,
  DECISION_TABS,
  DECISIONS_CHANGED,
  DUE_FILTER_LABEL,
  DUE_FILTERS,
  dueChip,
  dueMeta,
  glcChip,
  outcomeChip,
  raisedByFull,
  raisedByLine,
  type DecisionRow,
  type DecisionTab,
  type GlcRow,
} from "@/lib/decisions";
import type { DecisionsPageData } from "@/server/decision-requests";
import { COMPACT, COMPACT_PRIMARY, PRIMARY, SECONDARY } from "@/lib/surface";

// WS2 (UX fidelity Tier 4) — the Decisions page, drawn to the design's decisionsPage (header,
// tabs with counts, toolbar, row list with the pager) and drawer 15 "Record a Decision". The
// server pages, searches and filters (page.tsx); every write goes through /api/decisions/*,
// which audit and notify. After any write: toast, close, refresh, and the sidebar recounts.

type Option = { value: string; label: string };
type Viewer = { id: string; roles: string[]; mayRaise: boolean; mayDecide: boolean; mayCreateAction: boolean; headLevel: boolean; executive: boolean };
type DrawerState = { kind: "decision"; row: DecisionRow } | { kind: "raise" } | { kind: "action"; from: DecisionRow | null } | null;

const EMPTY_HINT: Record<DecisionTab, string> = {
  waiting: "Decisions a Head or a PM raises for the Group appear here, soonest due first.",
  decided: "Decisions the Group has recorded appear here, most recent first. Each one is also on its project's Register.",
  actions: "Action items from the Group-level committee appear here, with their owner and due date.",
};

/** POST JSON; the route's own message on failure. */
async function post(url: string, body: unknown, fallback: string): Promise<string | null> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (res?.ok) return null;
  const data = res ? ((await res.json().catch(() => null)) as { error?: { message?: string } } | null) : null;
  return data?.error?.message ?? fallback;
}

function useDone(onClose: () => void) {
  const router = useRouter();
  return (message: string) => {
    toast.success(message);
    onClose();
    router.refresh();
    window.dispatchEvent(new Event(DECISIONS_CHANGED));
  };
}

/** "Fri 6 Nov" in the tenant's zone. */
function weekdayDate(d: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(new Date(d)).replace(",", "");
}

export function DecisionsClient({
  tab,
  data,
  openRow,
  viewer,
  raiseProjects,
  allProjects,
  owners,
  startRaise,
  raiseProjectId,
  timeZone,
  nowIso,
}: {
  tab: DecisionTab;
  data: DecisionsPageData;
  openRow: DecisionRow | null;
  viewer: Viewer;
  raiseProjects: { id: string; name: string }[];
  allProjects: { id: string; name: string }[];
  owners: Option[];
  startRaise: boolean;
  raiseProjectId: string | null;
  timeZone: string;
  nowIso: string;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const list = useListUrl("decisions", 10);
  const [drawer, setDrawer] = useState<DrawerState>(() => (openRow ? { kind: "decision", row: openRow } : startRaise ? { kind: "raise" } : null));
  // A link to ?open=<id> while already here (a notification, the home's "Go to the Decision").
  useEffect(() => {
    if (openRow) setDrawer({ kind: "decision", row: openRow });
  }, [openRow]);

  const close = () => {
    setDrawer(null);
    if (list.get("open") || list.get("raise")) list.set({ open: null, raise: null, page: list.page > 1 ? list.page : null });
  };

  const project = list.get("project");
  const person = list.get("person");
  const due = list.get("due");
  const actions = tab === "actions";
  const personLabel = actions ? "Owner" : "Raised By";
  const active = [
    project && { key: "project", label: `Project: ${data.filters.projects.find((o) => o.value === project)?.label ?? project}` },
    person && { key: "person", label: `${personLabel}: ${data.filters.people.find((o) => o.value === person)?.label ?? person}` },
    due && { key: "due", label: `Due: ${DUE_FILTER_LABEL[due as keyof typeof DUE_FILTER_LABEL] ?? due}` },
  ].filter((x): x is { key: string; label: string } => !!x);
  const filtered = !!list.q || active.length > 0;
  const counts: Record<DecisionTab, number> = data.counts;

  const headerAction = actions ? (
    viewer.mayCreateAction ? (
      <button type="button" className={PRIMARY} onClick={() => setDrawer({ kind: "action", from: null })}>
        <Plus className="size-3.5" aria-hidden /> New Action
      </button>
    ) : null
  ) : viewer.mayRaise ? (
    <button type="button" className={PRIMARY} onClick={() => setDrawer({ kind: "raise" })}>
      <Plus className="size-3.5" aria-hidden /> Raise a Decision
    </button>
  ) : null;

  return (
    <>
      <PageHeader title="Decisions" description="Decisions waiting on the Group, and GLC actions." actions={headerAction} />
      <TabStrip
        label="Decision views"
        active={tab}
        tabs={DECISION_TABS.map((t) => ({ key: t, label: DECISION_TAB_LABEL[t], count: counts[t], href: t === "waiting" ? "/decisions" : `/decisions?tab=${t}` }))}
      />
      <ListToolbar label={actions ? "Search GLC actions" : "Search decisions"}>
        <SearchField
          value={list.q}
          onChange={(q) => list.set({ q })}
          placeholder={actions ? "Search actions by title or project" : "Search decisions by title or project"}
          label={actions ? "Search GLC actions" : "Search decisions"}
        />
        <FilterSelect label="Project" allLabel="All projects" value={project} options={data.filters.projects} onChange={(v) => list.set({ project: v })} />
        <FilterSelect label={personLabel} allLabel="Everyone" value={person} options={data.filters.people} onChange={(v) => list.set({ person: v })} />
        <FilterSelect label="Due" allLabel="Any due date" value={due} options={DUE_FILTERS.map((f) => ({ value: f, label: DUE_FILTER_LABEL[f] }))} onChange={(v) => list.set({ due: v })} />
        <FilterChips filters={active} onClearAll={() => list.clear(["project", "person", "due"])} />
      </ListToolbar>
      <TableCard footer={<TableFooter info={data.info} noun={actions ? "GLC actions" : "decisions"} onPage={list.setPage} onSize={list.setSize} />}>
        {(actions ? data.actions.length : data.requests.length) === 0 ? (
          <ListEmpty
            filtered={filtered}
            noun={actions ? "GLC actions" : tab === "decided" ? "decided decisions" : "decisions waiting"}
            onClear={() => list.clear(["project", "person", "due"])}
            hint={filtered ? undefined : EMPTY_HINT[tab]}
          />
        ) : actions ? (
          <ul className="m-0 flex list-none flex-col p-0" aria-label="GLC actions">
            {data.actions.map((a) => (
              <GlcListRow key={a.id} a={a} viewer={viewer} now={now} tz={timeZone} />
            ))}
          </ul>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0" aria-label={tab === "waiting" ? "Decisions waiting on the Group" : "Decided"}>
            {data.requests.map((r, i) => {
              const decided = r.status === "decided";
              const chip = decided ? outcomeChip(r.outcome) : dueChip(r.dueDate, now, timeZone);
              const sub = decided
                ? `${r.projectName ?? "Group level"} · ${r.outcome ?? "decided"}${r.decidedByName ? ` by ${r.decidedByName}` : ""}`
                : `${r.projectName ?? "Group level"} · ${raisedByLine(r.raisedBy)}${r.status === "deferred" ? " · deferred" : ""}`;
              const decide = !decided && viewer.mayDecide;
              return (
                <ListRow
                  key={r.id}
                  title={r.title}
                  sub={sub}
                  chip={<Chip tone={chip.tone}>{chip.label}</Chip>}
                  meta={decided ? (r.decidedAt ? formatDayMonth(r.decidedAt, timeZone) : null) : dueMeta(r.dueDate, now, timeZone)}
                  action={
                    <button type="button" onClick={() => setDrawer({ kind: "decision", row: r })} className={decide && i === 0 && list.page === 1 ? COMPACT_PRIMARY : COMPACT} aria-label={`${decide ? "Decide" : "View"}: ${r.title}`}>
                      {decide ? "Decide" : "View"}
                    </button>
                  }
                />
              );
            })}
          </ul>
        )}
      </TableCard>

      <Drawer open={!!drawer} onClose={close}>
        {drawer?.kind === "decision" && (
          <DecisionDrawer
            key={drawer.row.id}
            row={drawer.row}
            viewer={viewer}
            now={now}
            tz={timeZone}
            onClose={close}
            onAddAction={() => setDrawer({ kind: "action", from: drawer.row })}
          />
        )}
        {drawer?.kind === "raise" && <RaiseDrawer projects={raiseProjects} headLevel={viewer.headLevel} initialProjectId={raiseProjectId} todayKey={dayKey(now, timeZone)} onClose={close} />}
        {drawer?.kind === "action" && <ActionDrawer from={drawer.from} projects={allProjects} owners={owners} todayKey={dayKey(now, timeZone)} onClose={close} />}
      </Drawer>
    </>
  );
}

function GlcListRow({ a, viewer, now, tz }: { a: GlcRow; viewer: Viewer; now: Date; tz: string }) {
  const done = useDone(() => {});
  const [busy, setBusy] = useState(false);
  const chip = glcChip(a.status, a.dueDate, now, tz);
  const mayComplete = a.status === "open" && canCompleteGlcAction(viewer.roles, viewer.id, a.ownerId);
  async function complete() {
    setBusy(true);
    const err = await post(`/api/decisions/actions/${a.id}/complete`, {}, "Couldn't mark it done. Try again.");
    setBusy(false);
    if (err) return void toast.error(err);
    done(`“${a.title}” marked done.`);
  }
  return (
    <ListRow
      title={a.title}
      sub={[a.projectName ?? "Group level", a.ownerName ? `owner ${a.ownerName}` : "no owner", a.decisionTitle ? `from “${a.decisionTitle}”` : null].filter(Boolean).join(" · ")}
      chip={<Chip tone={chip.tone}>{chip.label}</Chip>}
      meta={a.status === "done" ? null : dueMeta(a.dueDate, now, tz)}
      action={
        mayComplete ? (
          <button type="button" disabled={busy} onClick={() => void complete()} className={COMPACT} aria-label={`Mark done: ${a.title}`}>
            {busy ? "Saving…" : "Mark Done"}
          </button>
        ) : undefined
      }
    />
  );
}

// ── Drawer 15: Record a Decision (and the read-only view) ─────────────────────

type Mode = "approve" | "decline" | "defer";
const MODES: { value: Mode; label: string }[] = [
  { value: "approve", label: "Approve" },
  { value: "decline", label: "Decline" },
  { value: "defer", label: "Defer" },
];

const NOTE_PLACEHOLDER: Record<Mode, string> = {
  approve: "For example: Approved. Review spend at the cutover rehearsal.",
  decline: "For example: Declined. The budget is committed to the core upgrade this year.",
  defer: "For example: Deferred until the vendor confirms the cost.",
};

function DecisionDrawer({ row, viewer, now, tz, onClose, onAddAction }: { row: DecisionRow; viewer: Viewer; now: Date; tz: string; onClose: () => void; onAddAction: () => void }) {
  const done = useDone(onClose);
  const [mode, setMode] = useState<Mode>("approve");
  const [note, setNote] = useState("");
  const [newDue, setNewDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decided = row.status === "decided";
  const canRecord = !decided && viewer.mayDecide;
  const todayKey = dayKey(now, tz);
  const overdue = !!row.dueDate && dayKey(row.dueDate, tz) < todayKey;
  const dueLine = row.dueDate ? `${overdue && !decided ? "was due" : "due"} ${weekdayDate(row.dueDate, tz)}` : "no due date";
  const subtitle = [row.projectName ?? "Group level", raisedByFull(row.raisedBy), dueLine].join(" · ");
  const names = row.notifyNames;
  const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? "The person who raised it");
  const told = `${who} ${names.length > 1 ? "are" : "is"} notified`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const text = note.trim();
    if (mode !== "approve" && text.length < 3) return setError(mode === "decline" ? "Say why it was declined — the note goes on the record." : "Say why it was deferred — the note goes on the record.");
    if (mode === "defer" && !newDue) return setError("Choose the new due date.");
    if (mode === "defer" && newDue <= todayKey) return setError("Defer to a day after today.");
    setBusy(true);
    const body = mode === "defer" ? { action: "defer", note: text, dueDate: newDue } : { action: mode, ...(text && { note: text }) };
    const err = await post(`/api/decisions/${row.id}/decide`, body, "Couldn't record the decision. Try again.");
    setBusy(false);
    if (err) return setError(err);
    done(mode === "approve" ? `“${row.title}” approved.` : mode === "decline" ? `“${row.title}” declined.` : `“${row.title}” deferred to ${formatDayMonth(newDue + "T12:00:00Z", "UTC")}.`);
  }

  const details: [string, React.ReactNode][] = [
    ...row.options.map((o) => [o.label, o.text] as [string, React.ReactNode]),
    ["Raised", `${formatDate(row.createdAt, tz)}`],
    ...(row.status === "deferred" && row.outcomeNote ? ([["Deferred", row.outcomeNote]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <DrawerFrame
      onSubmit={canRecord ? submit : undefined}
      header={<DrawerHeader step="Decision for the Group" title={row.title} subtitle={subtitle} />}
      footer={
        <DrawerFooter note={!decided && !viewer.mayDecide ? "Executives record the Group's decision." : undefined}>
          {canRecord ? (
            <>
              <button type="button" onClick={onClose} className={SECONDARY}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={PRIMARY}>
                {busy ? "Saving…" : "Record Decision"}
              </button>
            </>
          ) : (
            <>
              {decided && viewer.mayCreateAction && (
                <button type="button" onClick={onAddAction} className={SECONDARY}>
                  Add GLC Action
                </button>
              )}
              {decided && row.projectId ? (
                <Link href={`/projects/${row.projectId}?tab=Register`} className={PRIMARY}>
                  Open Register
                </Link>
              ) : (
                <button type="button" onClick={onClose} className={SECONDARY}>
                  Close
                </button>
              )}
            </>
          )}
        </DrawerFooter>
      }
    >
      <DrawerSection title="What Is Being Asked">{row.context ? <DrawerText>{row.context}</DrawerText> : <DrawerText hint>No details were given.</DrawerText>}</DrawerSection>
      <Kv rows={details} />
      {decided ? (
        <DrawerSection title="Decision">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--ds-ink3)]">
            <Chip tone={outcomeChip(row.outcome).tone}>{outcomeChip(row.outcome).label}</Chip>
            <span>
              {row.decidedByName ? `by ${row.decidedByName}` : ""}
              {row.decidedAt ? ` · ${formatDate(row.decidedAt, tz)}` : ""}
            </span>
          </div>
          {row.outcomeNote ? <DrawerText>{row.outcomeNote}</DrawerText> : <DrawerText hint>No note was added.</DrawerText>}
          {row.projectId && <DrawerText hint>Added to the project&apos;s Register.</DrawerText>}
        </DrawerSection>
      ) : canRecord ? (
        <>
          <DrawerSection title="Decision">
            <Choice
              label="Decision"
              value={mode}
              options={MODES}
              onChange={(m) => {
                setMode(m);
                setError(null);
              }}
            />
          </DrawerSection>
          {mode === "defer" && (
            <Field label="New Due Date" htmlFor="decision-new-due" hint="The decision stays in Waiting until this date.">
              <input id="decision-new-due" type="date" min={addDay(todayKey)} value={newDue} onChange={(e) => setNewDue(e.target.value)} className={FIELD_INPUT} required />
            </Field>
          )}
          <Field label="Note for the Record" htmlFor="decision-note" hint={mode === "approve" ? "Optional." : "Required."}>
            <textarea
              id="decision-note"
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={NOTE_PLACEHOLDER[mode]}
              className={FIELD_TEXTAREA}
            />
          </Field>
          <Banner>
            {told}
            {row.projectId && mode !== "defer" ? ", and the decision is added to the project's Register." : "."}
          </Banner>
          {error && <DrawerError>{error}</DrawerError>}
        </>
      ) : null}
    </DrawerFrame>
  );
}

function addDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// ── Raise a Decision ───────────────────────────────────────────────────────────

function RaiseDrawer({ projects, headLevel, initialProjectId, todayKey, onClose }: { projects: { id: string; name: string }[]; headLevel: boolean; initialProjectId: string | null; todayKey: string; onClose: () => void }) {
  const done = useDone(onClose);
  const [projectId, setProjectId] = useState(initialProjectId ?? (headLevel ? "" : (projects[0]?.id ?? "")));
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [ifApproved, setIfApproved] = useState("");
  const [ifDeclined, setIfDeclined] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 3) return setError("Give the decision a title (3 characters or more).");
    if (!headLevel && !projectId) return setError("Choose the project this decision is for.");
    setBusy(true);
    const err = await post(
      "/api/decisions",
      { title: title.trim(), projectId: projectId || null, context: context.trim() || undefined, ifApproved: ifApproved.trim() || undefined, ifDeclined: ifDeclined.trim() || undefined, dueDate: dueDate || null },
      "Couldn't raise the decision. Try again.",
    );
    setBusy(false);
    if (err) return setError(err);
    done(`“${title.trim()}” raised. Executives have been notified.`);
  }

  return (
    <DrawerFrame
      onSubmit={submit}
      header={<DrawerHeader step="Decisions" title="Raise a Decision" subtitle="Ask the Group to decide. Executives record the outcome." />}
      footer={
        <DrawerFooter>
          <button type="button" onClick={onClose} className={SECONDARY}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? "Saving…" : "Raise Decision"}
          </button>
        </DrawerFooter>
      }
    >
      <Field label="Project" htmlFor="raise-project" hint={headLevel ? undefined : "Projects you run."}>
        <select id="raise-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={FIELD_INPUT}>
          {headLevel ? <option value="">No project (Group level)</option> : <option value="">Choose a project</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title" htmlFor="raise-title">
        <input id="raise-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required placeholder="For example: Extra budget for data migration" className={FIELD_INPUT} />
      </Field>
      <Field label="What Is Being Asked" htmlFor="raise-context">
        <textarea id="raise-context" rows={3} maxLength={2000} value={context} onChange={(e) => setContext(e.target.value)} placeholder="The ask, in a sentence or two." className={FIELD_TEXTAREA} />
      </Field>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="If Approved" htmlFor="raise-yes">
          <input id="raise-yes" value={ifApproved} onChange={(e) => setIfApproved(e.target.value)} maxLength={300} placeholder="For example: go-live stays 30 Nov" className={FIELD_INPUT} />
        </Field>
        <Field label="If Declined" htmlFor="raise-no">
          <input id="raise-no" value={ifDeclined} onChange={(e) => setIfDeclined(e.target.value)} maxLength={300} placeholder="For example: go-live moves 3 weeks" className={FIELD_INPUT} />
        </Field>
      </div>
      <Field label="Due Date" htmlFor="raise-due" hint="When the Group needs to decide. Optional.">
        <input id="raise-due" type="date" min={todayKey} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={FIELD_INPUT} />
      </Field>
      <Banner>Executives are notified. You and the project&apos;s PM hear back when it is decided.</Banner>
      {error && <DrawerError>{error}</DrawerError>}
    </DrawerFrame>
  );
}

// ── New GLC Action ─────────────────────────────────────────────────────────────

function ActionDrawer({ from, projects, owners, todayKey, onClose }: { from: DecisionRow | null; projects: { id: string; name: string }[]; owners: Option[]; todayKey: string; onClose: () => void }) {
  const done = useDone(onClose);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(from?.projectId ?? "");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 3) return setError("Give the action a title (3 characters or more).");
    setBusy(true);
    const err = await post(
      "/api/decisions/actions",
      { title: title.trim(), projectId: projectId || null, ownerId: ownerId || null, dueDate: dueDate || null, decisionRequestId: from?.id ?? null },
      "Couldn't add the action. Try again.",
    );
    setBusy(false);
    if (err) return setError(err);
    done(`“${title.trim()}” added to GLC actions.${ownerId ? " The owner has been notified." : ""}`);
  }

  return (
    <DrawerFrame
      onSubmit={submit}
      header={<DrawerHeader step="GLC Actions" title="New Action" subtitle={from ? `From the decision “${from.title}”` : "An action item from the Group-level committee."} />}
      footer={
        <DrawerFooter>
          <button type="button" onClick={onClose} className={SECONDARY}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? "Saving…" : "Add Action"}
          </button>
        </DrawerFooter>
      }
    >
      <Field label="Title" htmlFor="glc-title">
        <input id="glc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="For example: Confirm vendor support terms" className={FIELD_INPUT} />
      </Field>
      <Field label="Project" htmlFor="glc-project">
        <select id="glc-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={FIELD_INPUT}>
          <option value="">No project (Group level)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Owner" htmlFor="glc-owner">
        <select id="glc-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={FIELD_INPUT}>
          <option value="">No owner yet</option>
          {owners.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Due Date" htmlFor="glc-due" hint="Optional.">
        <input id="glc-due" type="date" min={todayKey} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={FIELD_INPUT} />
      </Field>
      {error && <DrawerError>{error}</DrawerError>}
    </DrawerFrame>
  );
}
