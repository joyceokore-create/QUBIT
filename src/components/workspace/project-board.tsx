"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Flag, GitCommitHorizontal, MessageSquare, TriangleAlert } from "lucide-react";
import { ConversationDrawer } from "@/components/conversation/conversation-drawer";
import {
  availableLenses,
  BOARD_COLUMNS,
  defaultLens,
  isAging,
  isTriageBug,
  laneOf,
  lensFilter,
  wipOverloads,
  LENS_LABELS,
  type BoardLens,
} from "@/lib/board-lens";
import { ExportButton } from "@/components/export-button";
import type { ProjectRoleCategory } from "@/lib/roles";

interface Task {
  id: string;
  title: string;
  phase: string | null;
  ownerRole: string | null;
  priority: string;
  status: string;
  approvalStatus: string;
  type: string;
  taskKey: string | null;
  severity: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  blocked: boolean;
  /** M7-D (DM1.43) — assignee's project-role category; decides the card's lens. */
  assigneeCategory: ProjectRoleCategory | null;
  /** M7-B — commits that referenced this task's key. */
  commitCount: number;
  /** M7-A — keys of the incomplete tasks this one waits on. */
  waitingOn: string[];
  /** M7-C — set when the card mirrors a YouTrack issue (links out). */
  sourceSystem: string | null;
  externalKey: string | null;
  externalUrl: string | null;
  externalAssigneeName: string | null;
  lastActivityAt: string;
}
interface Progress {
  total: number;
  completed: number;
  blocked: number;
  pct: number;
}
interface SyncState {
  connected: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  syncIntervalMinutes: number;
}

/** M-P2a (docs/33): the four sync-health states the header must always show one of.
 * Pure — unit-tested. Stale = older than 2× the sync interval. */
export function syncBadge(
  s: SyncState | null,
  now = new Date(),
): { kind: "fresh" | "stale" | "error" | "off"; label: string } {
  if (!s || !s.connected) return { kind: "off", label: "Not connected to YouTrack" };
  if (s.lastSyncError) return { kind: "error", label: `Sync error — ${s.lastSyncError.slice(0, 80)}` };
  if (!s.lastSyncAt) return { kind: "stale", label: "Connected — first sync pending" };
  const ageMin = Math.floor((now.getTime() - new Date(s.lastSyncAt).getTime()) / 60_000);
  if (ageMin > 2 * s.syncIntervalMinutes) return { kind: "stale", label: `Stale — last synced ${ageMin}m ago` };
  return { kind: "fresh", label: `Synced from YouTrack · ${Math.max(0, ageMin)}m ago` };
}

const BADGE_STYLE: Record<string, { color: string; bg: string }> = {
  fresh: { color: "var(--ok)", bg: "color-mix(in oklab, var(--ok) 10%, transparent)" },
  stale: { color: "var(--warn)", bg: "color-mix(in oklab, var(--warn) 12%, transparent)" },
  error: { color: "var(--bad)", bg: "color-mix(in oklab, var(--bad) 10%, transparent)" },
  off: { color: "var(--ink4)", bg: "var(--wash2)" },
};

const STATUS_LABEL: Record<string, string> = {
  NotStarted: "Not started",
  InProgress: "In progress",
  InReview: "In review",
  InQA: "In QA",
  Completed: "Completed",
};

/** The ONE read-only project board (M-P2a, docs/25 §4). Three lanes — To do / Doing /
 * Done — as views over task states mirrored from YouTrack. Nobody creates, moves or
 * edits cards here (PMs included); moving work happens in YouTrack and QUBIT reflects
 * it. What stays human: flagging blockers (RAID) and discussing (comments). */
export function ProjectBoard({
  projectId,
  canEdit,
  viewerCategory = "Stakeholder",
  viewerId,
  focusTaskId = null,
  initialLens = null,
}: {
  projectId: string;
  /** Retained for the blocker affordance gate (RAID writes) — NOT task authoring. */
  canEdit: boolean;
  canPublish?: boolean;
  viewerCategory?: ProjectRoleCategory;
  viewerId?: string;
  focusTaskId?: string | null;
  initialLens?: BoardLens | null;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [progress, setProgress] = useState<Progress>({ total: 0, completed: 0, blocked: 0, pct: 0 });
  const [sync, setSync] = useState<SyncState | null>(null);
  const lenses = availableLenses(viewerCategory);
  const [lens, setLens] = useState<BoardLens>(() =>
    initialLens && lenses.includes(initialLens) ? initialLens : defaultLens(viewerCategory),
  );
  // docs/25 §4: a member defaults to MINE with a toggle to All; PMs default to All.
  const manage = viewerCategory === "PM";
  const [mine, setMine] = useState(!manage && viewerCategory !== "Stakeholder");
  const [discussTask, setDiscussTask] = useState<{ id: string; title: string } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState("");

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/tasks`).then((r) => r.json());
    setTasks(d.tasks ?? []);
    setProgress(d.progress ?? { total: 0, completed: 0, blocked: 0, pct: 0 });
  }, [projectId]);
  useEffect(() => {
    void load();
    // Sync health for the header badge — the integrations config the PM already sees,
    // reduced to the four states everyone should see.
    fetch(`/api/projects/${projectId}/integrations`)
      .then((r) => r.json())
      .then((d) => {
        const yt = (d.data ?? d.items ?? []).find((c: { provider: string }) => c.provider === "youtrack");
        setSync(
          yt
            ? {
                connected: Boolean(yt.connected),
                lastSyncAt: yt.lastSyncAt ?? null,
                lastSyncError: yt.lastSyncError ?? null,
                syncIntervalMinutes: yt.syncIntervalMinutes ?? 60,
              }
            : { connected: false, lastSyncAt: null, lastSyncError: null, syncIntervalMinutes: 60 },
        );
      })
      .catch(() => setSync(null));
  }, [load, projectId]);

  // Deep-linked card (?task=): make it visible, scroll, pulse.
  useEffect(() => {
    if (!focusTaskId || tasks.length === 0) return;
    const target = tasks.find((t) => t.id === focusTaskId);
    if (!target) return;
    if (!lensFilter(lens, target) && lenses.includes("all")) setLens("all");
    if (mine && target.assigneeId !== viewerId) setMine(false);
    setHighlightId(focusTaskId);
    const scroll = window.setTimeout(() => {
      document.getElementById(`task-${focusTaskId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    const clear = window.setTimeout(() => setHighlightId(null), 3500);
    return () => {
      window.clearTimeout(scroll);
      window.clearTimeout(clear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when the deep-linked card first appears
  }, [focusTaskId, tasks.length > 0]);

  const flagBlocked = async (id: string) => {
    if (!flagReason.trim()) return;
    const ok = await fetch(`/api/tasks/${id}/block`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: flagReason.trim() }),
    }).then((r) => r.ok);
    if (ok) {
      setFlaggingId(null);
      setFlagReason("");
      void load();
    }
  };
  const unflagBlocked = async (id: string) => {
    const ok = await fetch(`/api/tasks/${id}/block`, { method: "DELETE" }).then((r) => r.ok);
    if (ok) void load();
  };

  const now = Date.now();
  const draftCount = tasks.filter((t) => t.approvalStatus === "Draft").length;
  const triage = useMemo(() => (lens === "qa" ? tasks.filter(isTriageBug) : []), [lens, tasks]);
  const visible = useMemo(
    () =>
      tasks.filter(
        (t) => lensFilter(lens, t) && !(lens === "qa" && isTriageBug(t)) && (!mine || t.assigneeId === viewerId),
      ),
    [lens, tasks, mine, viewerId],
  );
  const overloads = useMemo(() => wipOverloads(tasks), [tasks]);
  const lensCount = (l: BoardLens) => tasks.filter((t) => lensFilter(l, t)).length;
  const mineCount = useMemo(() => tasks.filter((t) => t.assigneeId === viewerId).length, [tasks, viewerId]);
  const badge = syncBadge(sync);

  return (
    <div className="flex flex-col gap-4">
      <ConversationDrawer
        open={!!discussTask}
        onOpenChange={(o) => !o && setDiscussTask(null)}
        title={discussTask?.title ?? ""}
        entityType="project_task"
        entityId={discussTask?.id ?? null}
        viewerId={viewerId ?? ""}
        canPromote={manage}
      />

      {/* Header: sync health first (docs/33 — a stale board must never read as a quiet one) */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
          style={{ color: BADGE_STYLE[badge.kind].color, background: BADGE_STYLE[badge.kind].bg }}
          title={badge.kind === "off" ? "Work items appear once the YouTrack project is linked" : undefined}
        >
          🔗 {badge.label}
        </span>
        {badge.kind === "off" && canEdit && (
          <Link
            href={`/projects/${projectId}?tab=Integrations`}
            className="text-[11px] font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
          >
            Connect in Integrations →
          </Link>
        )}
        <span className="rounded-full border border-[var(--hair)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.8px] text-[var(--ink4)]">
          read-only
        </span>
        <div className="min-w-[180px] flex-1">
          <div className="h-[6px] overflow-hidden rounded-full bg-[var(--w08)]">
            <div className="h-full rounded-full bg-[var(--ok)]" style={{ width: `${progress.pct}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-[var(--ink4)]">
            {progress.completed}/{progress.total} done · {progress.pct}%
            {progress.blocked > 0 && <span className="text-[var(--bad)]"> · {progress.blocked} blocked</span>}
          </div>
        </div>
        <ExportButton href={`/api/export?kind=tasks&projectId=${projectId}`} />
        {draftCount > 0 && (
          <span
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold"
            style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 12%, transparent)" }}
            title="Legacy AI-drafted cards — the publish flow retired with task authoring (docs/25 §1)"
          >
            {draftCount} legacy draft{draftCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Lens tabs (DM1.43) + Mine/All (docs/25 §4 — members default to Mine) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {lenses.length === 1 && (
          <span className="rounded-full border border-[var(--hair)] px-3 py-1 text-[11.5px] font-semibold text-[var(--ink4)]">
            {LENS_LABELS[lenses[0]]} <span className="font-mono text-[9.5px] opacity-70">{visible.length + (lens === "qa" ? triage.length : 0)}</span>
          </span>
        )}
        {lenses.length > 1 &&
          lenses.map((l) => {
            const active = lens === l;
            return (
              <button
                key={l}
                type="button"
                onClick={() => setLens(l)}
                className="rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors"
                style={{
                  borderColor: active ? "var(--brand)" : "var(--hair)",
                  background: active ? "color-mix(in oklab, var(--brand) 10%, transparent)" : "transparent",
                  color: active ? "var(--brand)" : "var(--ink4)",
                }}
              >
                {LENS_LABELS[l]} <span className="font-mono text-[9.5px] opacity-70">{lensCount(l)}</span>
              </button>
            );
          })}
        {viewerId && (
          <>
            <span className="mx-1 h-4 w-px bg-[var(--hair)]" />
            {(["mine", "all"] as const).map((m) => {
              const active = m === "mine" ? mine : !mine;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMine(m === "mine")}
                  className="rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors"
                  style={{
                    borderColor: active ? "var(--brand)" : "var(--hair)",
                    background: active ? "color-mix(in oklab, var(--brand) 10%, transparent)" : "transparent",
                    color: active ? "var(--brand)" : "var(--ink4)",
                  }}
                >
                  {m === "mine" ? <>Mine <span className="font-mono text-[9.5px] opacity-70">{mineCount}</span></> : "All"}
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* QA triage strip: unassigned bugs, pinned. Assignment happens in YouTrack. */}
      {lens === "qa" && triage.length > 0 && (
        <div
          className="flex flex-col gap-2 rounded-[14px] border p-3"
          style={{ borderColor: "color-mix(in oklab, var(--bad) 40%, transparent)", background: "color-mix(in oklab, var(--bad) 5%, transparent)" }}
        >
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--bad)]">
            <TriangleAlert className="size-3" /> Triage — unassigned bugs
            <span className="text-[var(--ink4)]">{triage.length}</span>
            <span className="ml-auto font-sans text-[10px] font-medium normal-case tracking-normal text-[var(--ink4)]">
              assign them in YouTrack
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {triage.map((t) => (
              <div key={t.id} className="flex flex-col gap-1.5 rounded-[10px] border border-[var(--w07)] bg-[var(--qcard)] p-2.5 text-xs">
                <span className="font-medium text-[var(--qink)]">
                  {t.title}
                  {t.severity && (
                    <span
                      className="ml-1.5 rounded-[4px] px-1.5 py-[1px] font-mono text-[8.5px] font-semibold uppercase tracking-[1px]"
                      style={{
                        color: t.severity === "Critical" || t.severity === "High" ? "var(--bad)" : "var(--warn)",
                        background: `color-mix(in oklab, ${t.severity === "Critical" || t.severity === "High" ? "var(--bad)" : "var(--warn)"} 14%, transparent)`,
                      }}
                    >
                      {t.severity}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 truncate text-[10.5px] text-[var(--ink4)]">
                  {t.externalKey && t.externalUrl ? (
                    <a href={t.externalUrl} target="_blank" rel="noreferrer noopener" className="flex items-center gap-0.5 hover:text-brand">
                      {t.externalKey} <ExternalLink className="size-2.5" />
                    </a>
                  ) : (
                    (t.taskKey ?? "—")
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The three lanes (docs/25 §4): views over states — never a drop target. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {BOARD_COLUMNS.map((col) => {
          const items = visible.filter((t) => laneOf(t.status) === col.key);
          return (
            <div key={col.key} className="flex min-h-[120px] flex-col gap-2 rounded-[14px] border border-[var(--w07)] bg-[var(--w02)] p-2.5">
              <div className="flex items-center gap-2 px-1 py-0.5 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: `var(${col.token})` }}>
                <span className="size-2 rounded-full" style={{ background: `var(${col.token})` }} />
                {col.label}
                {col.key === "doing" && overloads.length > 0 && (
                  <span
                    className="flex items-center gap-0.5 text-[var(--warn)]"
                    title={`Over WIP limit: ${overloads.map((o) => `${o.name} (${o.count})`).join(", ")}`}
                  >
                    <TriangleAlert className="size-3" /> WIP
                  </span>
                )}
                <span className="ml-auto text-[var(--ink5)]">{items.length}</span>
              </div>

              {items.map((t) => {
                const overdue = t.dueDate && t.status !== "Completed" && new Date(t.dueDate).getTime() < now;
                const aging = !t.blocked && isAging(t.lastActivityAt, t.status, new Date(now));
                const sevTok = t.severity === "Critical" || t.severity === "High" ? "--bad" : "--warn";
                const focused = highlightId === t.id;
                return (
                  <div
                    key={t.id}
                    id={`task-${t.id}`}
                    className="flex flex-col gap-1.5 rounded-[10px] border bg-[var(--qcard)] p-2.5 text-xs transition-shadow duration-500"
                    title={aging ? "No activity for over 5 business days" : undefined}
                    style={{
                      borderColor: focused
                        ? "var(--brand)"
                        : t.blocked
                          ? "color-mix(in oklab, var(--bad) 45%, transparent)"
                          : aging
                            ? "color-mix(in oklab, var(--warn) 45%, transparent)"
                            : "var(--w07)",
                      boxShadow: focused ? "0 0 0 3px color-mix(in oklab, var(--brand) 30%, transparent)" : undefined,
                    }}
                  >
                    <span className="font-medium text-[var(--qink)]">
                      {t.title}
                      {t.approvalStatus === "Draft" && (
                        <span className="ml-1.5 rounded-[4px] px-1.5 py-[1px] font-mono text-[8.5px] font-semibold uppercase tracking-[1px]" style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 16%, transparent)" }}>
                          Draft
                        </span>
                      )}
                      {t.blocked && (
                        <span className="ml-1.5 rounded-[4px] px-1.5 py-[1px] font-mono text-[8.5px] font-semibold uppercase tracking-[1px]" style={{ color: "var(--bad)", background: "color-mix(in oklab, var(--bad) 16%, transparent)" }}>
                          Blocked
                        </span>
                      )}
                      {t.type === "Bug" && t.severity && (
                        <span className="ml-1.5 rounded-[4px] px-1.5 py-[1px] font-mono text-[8.5px] font-semibold uppercase tracking-[1px]" style={{ color: `var(${sevTok})`, background: `color-mix(in oklab, var(${sevTok}) 14%, transparent)` }}>
                          {t.severity}
                        </span>
                      )}
                      {aging && (
                        <span className="ml-1.5 rounded-[4px] px-1.5 py-[1px] font-mono text-[8.5px] font-semibold uppercase tracking-[1px]" style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 14%, transparent)" }}>
                          Stale
                        </span>
                      )}
                      {t.waitingOn.length > 0 && t.status !== "Completed" && (
                        <span
                          className="ml-1.5 rounded-[4px] px-1.5 py-[1px] font-mono text-[8.5px] font-semibold uppercase tracking-[1px]"
                          style={{ color: "var(--qinfo)", background: "color-mix(in oklab, var(--qinfo) 16%, transparent)" }}
                          title={`Waiting on ${t.waitingOn.join(", ")}`}
                        >
                          Waiting on {t.waitingOn.length}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10.5px] text-[var(--ink4)]">
                      {/* Exact state stays visible inside the coarse lane. */}
                      <span className="rounded-[4px] bg-[var(--wash2)] px-1.5 py-[1px] font-mono text-[9px] tracking-[0.5px] text-[var(--ink3)]">
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                      {t.taskKey && (
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard?.writeText(t.taskKey as string)}
                          title="Copy task key"
                          className="rounded-[4px] bg-[var(--wash2)] px-1.5 py-[1px] font-mono text-[9.5px] tracking-[0.5px] text-[var(--ink3)] transition-colors hover:text-brand"
                        >
                          {t.taskKey}
                        </button>
                      )}
                      {t.externalKey && (
                        <a
                          href={t.externalUrl ?? undefined}
                          target="_blank"
                          rel="noreferrer noopener"
                          title="Open in YouTrack — this issue is edited there"
                          className="flex items-center gap-0.5 rounded-[4px] bg-[var(--wash2)] px-1.5 py-[1px] font-mono text-[9.5px] tracking-[0.5px] text-[var(--ink3)] transition-colors hover:text-brand"
                        >
                          {t.externalKey}
                          <ExternalLink className="size-2.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setDiscussTask({ id: t.id, title: t.taskKey ?? t.title })}
                        title="Discuss this task"
                        aria-label="Discuss this task"
                        className="rounded-[4px] p-0.5 text-[var(--ink4)] transition-colors hover:text-brand"
                      >
                        <MessageSquare className="size-3" />
                      </button>
                      {t.commitCount > 0 && (
                        <span className="flex items-center gap-0.5 font-mono text-[9.5px] text-[var(--ink4)]" title={`${t.commitCount} linked commit${t.commitCount === 1 ? "" : "s"}`}>
                          <GitCommitHorizontal className="size-3" /> {t.commitCount}
                        </span>
                      )}
                      <span className="min-w-0 truncate">
                        {[t.type !== "Feature" ? t.type : null, t.phase, t.priority, t.assigneeName ?? t.externalAssigneeName].filter(Boolean).join(" · ") || "—"}
                        {t.dueDate && <span style={{ color: overdue ? "var(--bad)" : undefined }}> · due {new Date(t.dueDate).toLocaleDateString()}</span>}
                      </span>
                    </span>
                    {/* RAID stays human (docs/33 §0): flag/resolve blockers. */}
                    {canEdit && t.approvalStatus !== "Draft" && t.status !== "Completed" && (
                      t.blocked ? (
                        <button type="button" onClick={() => unflagBlocked(t.id)} className="self-start text-[10px] font-semibold text-[var(--bad)] hover:underline">
                          Resolve blocker
                        </button>
                      ) : flaggingId === t.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={flagReason}
                            onChange={(e) => setFlagReason(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void flagBlocked(t.id);
                              if (e.key === "Escape") {
                                setFlaggingId(null);
                                setFlagReason("");
                              }
                            }}
                            placeholder="Blocked by…"
                            autoFocus
                            className="h-6 min-w-0 flex-1 rounded-[5px] border border-ink-4 bg-background px-1.5 text-[10.5px] text-foreground outline-none focus:border-brand"
                          />
                          <button type="button" onClick={() => flagBlocked(t.id)} className="text-[10px] font-semibold text-[var(--bad)]" aria-label="Confirm blocked">
                            Flag
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setFlaggingId(t.id);
                            setFlagReason("");
                          }}
                          className="flex items-center gap-1 self-start text-[10px] text-[var(--ink5)] hover:text-[var(--bad)]"
                        >
                          <Flag className="size-2.5" /> Flag blocked
                        </button>
                      )
                    )}
                  </div>
                );
              })}

              {col.key === "todo" && items.length === 0 && (
                <p className="pt-1 text-[10.5px] leading-[1.5] text-[var(--ink5)]">
                  {badge.kind === "off"
                    ? "No YouTrack project linked — the board fills at the first sync after connecting."
                    : "Issues are raised in YouTrack and appear here at the next sync."}
                </p>
              )}
              {items.length === 0 && col.key !== "todo" && <p className="px-1 text-[11px] text-[var(--ink5)]">—</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
