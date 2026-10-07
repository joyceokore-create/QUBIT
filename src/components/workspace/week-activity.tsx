"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Mail, RefreshCw } from "lucide-react";
import { syncBadge } from "@/components/workspace/project-board";
import { CARD_GLASS as CARD, CARD_BG, FOCUS } from "@/lib/surface";

/**
 * "What moved this week" — the evidence the status update is drafted from. A read-only
 * mirror of what moved on the tracker this reporting week, counted into chips that
 * TOGGLE their list (Blocked open by default — a stuck task is never last week's news).
 * Blocked rows carry their age and, for the PM, a Nudge that emails the assignee
 * (Milestone A). Built from ProjectTask state, NOT domain events, so YouTrack-mirrored
 * work counts.
 */

interface TaskJson {
  id: string;
  title: string;
  status: string;
  type: string;
  taskKey: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  externalAssigneeName: string | null;
  blocked: boolean;
  blockedSince: string | null;
  lastNudgedAt: string | null;
  sourceSystem: string | null;
  externalKey: string | null;
  externalUrl: string | null;
  lastActivityAt: string;
  approvalStatus: string;
}

interface SyncJson {
  connected: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  syncIntervalMinutes: number;
}

const GROUPS = [
  { key: "done", label: "done", tok: "--ok" },
  { key: "inprogress", label: "in progress", tok: "--qinfo" },
  { key: "blocked", label: "blocked", tok: "--bad" },
  { key: "open", label: "new", tok: "--ink4" },
] as const;
type GroupKey = (typeof GROUPS)[number]["key"];

const NUDGE_COOLDOWN_MS = 24 * 3_600_000;

/** ISO week start (Monday 00:00, local) — the week the report speaks about. */
function weekStart(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  return d;
}

function groupOf(t: TaskJson): GroupKey | null {
  if (t.status === "Completed") return "done";
  if (t.blocked) return "blocked";
  if (t.status === "InProgress" || t.status === "InReview" || t.status === "InQA") return "inprogress";
  if (t.status === "NotStarted") return "open";
  return null;
}

function ageLabel(iso: string, now = new Date()): string {
  const min = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min}m ago`;
  if (min < 48 * 60) return `${Math.floor(min / 60)}h ago`;
  return `${Math.floor(min / 1440)}d ago`;
}

type NudgeState = { kind: "sending" } | { kind: "emailed" } | { kind: "nudged" } | { kind: "error"; message: string };

export function WeekActivity({ projectId, canNudge }: { projectId: string; canNudge: boolean }) {
  const [tasks, setTasks] = useState<TaskJson[] | null>(null);
  const [mirrored, setMirrored] = useState(false);
  const [sync, setSync] = useState<SyncJson | null>(null);
  const [open, setOpen] = useState<Set<GroupKey>>(() => new Set(["blocked"]));
  const [nudges, setNudges] = useState<Record<string, NudgeState>>({});
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${projectId}/tasks`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setTasks((d?.tasks ?? []) as TaskJson[]);
        setMirrored(Boolean(d?.mirrored));
      })
      .catch(() => alive && setTasks([]));
    fetch(`/api/projects/${projectId}/integrations`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const yt = (d?.data ?? d?.items ?? []).find((c: { provider: string }) => c.provider === "youtrack");
        setSync(
          yt
            ? { connected: Boolean(yt.connected), lastSyncAt: yt.lastSyncAt ?? null, lastSyncError: yt.lastSyncError ?? null, syncIntervalMinutes: yt.syncIntervalMinutes ?? 60 }
            : null,
        );
      })
      .catch(() => alive && setSync(null));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const grouped = useMemo(() => {
    const start = weekStart();
    const out = new Map<GroupKey, TaskJson[]>(GROUPS.map((g) => [g.key, []]));
    for (const t of tasks ?? []) {
      if (t.approvalStatus === "Draft") continue;
      const g = groupOf(t);
      if (!g) continue;
      const movedThisWeek = new Date(t.lastActivityAt) >= start;
      // Blocked work stays visible however old — a stuck task is never "last week's news".
      if (!movedThisWeek && g !== "blocked") continue;
      out.get(g)!.push(t);
    }
    return out;
  }, [tasks]);

  const toggle = (key: GroupKey) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const nudge = async (t: TaskJson) => {
    setNudges((p) => ({ ...p, [t.id]: { kind: "sending" } }));
    const res = await fetch(`/api/tasks/${t.id}/nudge`, { method: "POST" });
    const d = await res.json().catch(() => null);
    if (res.ok) setNudges((p) => ({ ...p, [t.id]: { kind: d?.data?.emailed ? "emailed" : "nudged" } }));
    else if (res.status === 409) setNudges((p) => ({ ...p, [t.id]: { kind: "nudged" } }));
    else setNudges((p) => ({ ...p, [t.id]: { kind: "error", message: d?.error?.message ?? "Could not nudge." } }));
  };

  if (tasks === null) {
    return (
      <div className={`${CARD} flex items-center gap-2 p-6 text-[12px] text-[var(--ink4)]`} style={CARD_BG}>
        <RefreshCw className="size-3.5 animate-spin" aria-hidden /> Loading this week&apos;s activity…
      </div>
    );
  }

  const total = [...grouped.values()].reduce((n, l) => n + l.length, 0);
  const badge = mirrored && now ? syncBadge(sync ? { ...sync, connected: true } : null, now) : null;
  const source = !mirrored
    ? { text: "from the board", tok: "--ink4" }
    : !badge || badge.kind === "off"
      ? { text: "from YouTrack", tok: "--ink4" }
      : badge.kind === "fresh"
        ? { text: `from YouTrack · synced ${sync?.lastSyncAt ? ageLabel(sync.lastSyncAt, now!) : "just now"}`, tok: "--ink4" }
        : badge.kind === "stale"
          ? { text: `from YouTrack · stale · last synced ${sync?.lastSyncAt ? ageLabel(sync.lastSyncAt, now!) : "never"}`, tok: "--warn" }
          : { text: "from YouTrack · sync error", tok: "--bad" };

  return (
    <section className={`${CARD} overflow-hidden`} style={CARD_BG} aria-labelledby="week-activity">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 p-[12px_16px]">
        <h2 id="week-activity" className="font-heading text-[14px] rv:text-heading-xs font-bold text-[var(--qink)]">
          What moved this week
        </h2>
        <span className="text-[11px]" style={{ color: `var(${source.tok})` }} title={badge?.label}>
          {source.text}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {GROUPS.map((g) => {
            const n = grouped.get(g.key)!.length;
            if (g.key === "open" && n === 0) return null;
            const pressed = open.has(g.key);
            return (
              <button
                key={g.key}
                type="button"
                aria-pressed={pressed}
                aria-controls={`wa-${g.key}`}
                disabled={n === 0}
                onClick={() => toggle(g.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:cursor-default ${FOCUS}`}
                style={
                  n === 0
                    ? { borderColor: "var(--border)", color: "var(--ink5)" }
                    : pressed
                      ? { borderColor: `color-mix(in oklab, var(${g.tok}) 35%, transparent)`, background: `color-mix(in oklab, var(${g.tok}) 10%, transparent)`, color: `var(${g.tok})` }
                      : { borderColor: "var(--border)", color: "var(--ink3)" }
                }
              >
                <span className="size-[7px] rounded-full" style={{ background: n === 0 ? "var(--ink5)" : `var(${g.tok})` }} aria-hidden />
                {n} {g.label}
              </button>
            );
          })}
        </div>
      </header>

      {total === 0 ? (
        <div className="border-t border-[var(--hair2)] p-6 text-center">
          <p className="text-[12.5px] font-semibold text-[var(--qink)]">A quiet week so far.</p>
          <p className="mt-1 text-[11px] text-[var(--ink4)]">
            {mirrored ? "Nothing on the tracker moved this week — activity appears here as it syncs." : "Nothing moved this week yet."}
          </p>
        </div>
      ) : (
        GROUPS.map((g) => {
          const list = grouped.get(g.key)!;
          if (!list.length || !open.has(g.key)) return null;
          return (
            <ul key={g.key} id={`wa-${g.key}`} className="border-t border-[var(--hair2)]">
              {list.map((t) => {
                const key = t.externalKey ?? t.taskKey;
                const who = t.assigneeName ?? t.externalAssigneeName;
                const blockedDays = t.blockedSince && now ? Math.max(0, Math.floor((now.getTime() - new Date(t.blockedSince).getTime()) / 86_400_000)) : null;
                const state = nudges[t.id] ?? (t.lastNudgedAt && now && now.getTime() - new Date(t.lastNudgedAt).getTime() < NUDGE_COOLDOWN_MS ? { kind: "nudged" as const } : null);
                const emailable = Boolean(t.assigneeId);
                return (
                  <li key={t.id} className="flex items-center gap-2.5 border-b border-[var(--hair2)] p-[7px_16px] transition-colors last:border-0 hover:bg-[var(--wash)]">
                    {key && <span className="w-[62px] flex-none truncate font-mono text-[10.5px] font-bold tabular-nums text-[var(--ink4)]">{key}</span>}
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--qink)]">{t.title}</span>
                    {(t.status === "InReview" || t.status === "InQA") && g.key === "inprogress" && (
                      <span className="hidden flex-none rounded-[4px] bg-[var(--wash2)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[.6px] text-[var(--ink4)] sm:inline">
                        {t.status === "InQA" ? "In QA" : "In review"}
                      </span>
                    )}
                    {g.key === "blocked" && blockedDays !== null && (
                      <span
                        className="flex-none rounded-[4px] px-1.5 font-mono text-[10px] font-bold tabular-nums"
                        style={{ color: "var(--bad)", background: "color-mix(in oklab, var(--bad) 10%, transparent)" }}
                        title={`Blocked since ${new Date(t.blockedSince!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                      >
                        {blockedDays}d
                      </span>
                    )}
                    {who && <span className="hidden flex-none text-[11px] text-[var(--ink4)] md:block">{who}</span>}
                    {g.key === "blocked" && canNudge && (
                      <NudgeControl state={state} emailable={emailable} who={who} onNudge={() => void nudge(t)} />
                    )}
                    {t.externalUrl && (
                      <a
                        href={t.externalUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={`flex-none rounded-[4px] text-[var(--ink4)] transition-colors hover:text-brand ${FOCUS}`}
                        aria-label={`Open ${key ?? t.title} in YouTrack`}
                      >
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          );
        })
      )}
    </section>
  );
}

function NudgeControl({
  state,
  emailable,
  who,
  onNudge,
}: {
  state: NudgeState | null;
  emailable: boolean;
  who: string | null;
  onNudge: () => void;
}) {
  if (state?.kind === "emailed" || state?.kind === "nudged") {
    const emailed = state.kind === "emailed";
    return (
      <span
        className="inline-flex flex-none items-center gap-1 text-[11px] font-semibold text-[var(--ok)]"
        title={emailed ? "Emailed · can nudge again after 24h" : "Nudged · again after 24h"}
      >
        <Check className="size-3" aria-hidden /> {emailed ? "Emailed" : "Nudged"}
      </span>
    );
  }
  if (!emailable) {
    return (
      <button
        type="button"
        aria-disabled="true"
        title={who ? `${who} isn't a QUBIT user — nudge them in YouTrack` : "No assignee to nudge"}
        className={`inline-flex flex-none items-center gap-1 rounded-[6px] border border-[var(--input)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink5)] ${FOCUS}`}
      >
        <Mail className="size-3" aria-hidden /> <span className="hidden sm:inline">Nudge</span>
      </button>
    );
  }
  return (
    <span className="flex flex-none items-center gap-1.5">
      <button
        type="button"
        onClick={onNudge}
        disabled={state?.kind === "sending"}
        aria-label={who ? `Nudge ${who}` : "Nudge"}
        className={`inline-flex items-center gap-1 rounded-[6px] border border-[var(--input)] bg-background px-2 py-0.5 text-[11px] font-semibold text-[var(--ink2)] transition-colors hover:text-brand disabled:opacity-60 ${FOCUS}`}
      >
        <Mail className="size-3" aria-hidden /> <span className="hidden sm:inline">{state?.kind === "sending" ? "Sending…" : "Nudge"}</span>
      </button>
      {state?.kind === "error" && <span className="text-[10.5px] text-[var(--bad)]">{state.message}</span>}
    </span>
  );
}
