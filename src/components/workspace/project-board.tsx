"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Flag, MessageSquare, Plus, Sparkles, TriangleAlert } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConversationDrawer } from "@/components/conversation/conversation-drawer";
import { GenerateDialog } from "@/components/panels/project-tasks-section";
import { BugDialog } from "@/components/workspace/bug-dialog";
import { defaultLens, isAging, isTriageBug, lensFilter, wipOverloads, LENS_LABELS, type BoardLens } from "@/lib/board-lens";
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
  /** M7-A — keys of the incomplete tasks this one waits on. */
  waitingOn: string[];
  /** M7-C — set when the card mirrors a YouTrack issue (read-only, links out). */
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
interface MemberOpt {
  userId: string;
  name: string;
  role: string;
}

const TYPES = ["Feature", "Bug", "Chore", "Spike", "Improvement"] as const;

// Five statuses since Phase 6.1 (docs/15). "Blocked" is a flag on the card, not a column —
// a blocked task keeps showing WHERE it stalled.
const COLUMNS = [
  { key: "NotStarted", label: "Not started", token: "--ink4" },
  { key: "InProgress", label: "In progress", token: "--qinfo" },
  { key: "InReview", label: "In review", token: "--warn" },
  { key: "InQA", label: "In QA", token: "--brand" },
  { key: "Completed", label: "Completed", token: "--ok" },
] as const;

/** Kanban board — the project's live tracking surface. Drag a card between columns (or use
 *  the card's status menu) to update it; progress recomputes from completed/total.
 *  Phase 6.2: role lenses (All / Dev / QA) filter ONE task list — never separate boards —
 *  with a pinned Triage group for unassigned bugs on the QA lens. */
export function ProjectBoard({
  projectId,
  canEdit,
  canPublish = canEdit,
  viewerCategory = "Stakeholder",
  viewerId,
  focusTaskId = null,
  initialLens = null,
}: {
  projectId: string;
  canEdit: boolean;
  canPublish?: boolean;
  viewerCategory?: ProjectRoleCategory;
  viewerId?: string;
  /** Deep link (?task=): scroll to and pulse this card once tasks load. */
  focusTaskId?: string | null;
  /** Deep link (?lens=): overrides the role-default lens. */
  initialLens?: BoardLens | null;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [progress, setProgress] = useState<Progress>({ total: 0, completed: 0, blocked: 0, pct: 0 });
  // M7-C: YouTrack owns this project's work — the board becomes a read-only mirror plus
  // QUBIT's own governance layer (blockers, dependencies, comments).
  const [mirrored, setMirrored] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [lens, setLens] = useState<BoardLens>(() => initialLens ?? defaultLens(viewerCategory));
  // "Mine" filter (per Joyce: filtering of mine everywhere). Focus by default for makers,
  // whole board by default for PM/stakeholders. A filter the user controls — never a wall.
  const [mine, setMine] = useState<boolean>(() => !!viewerId && (viewerCategory === "Dev" || viewerCategory === "QA"));
  const [discussTask, setDiscussTask] = useState<{ id: string; title: string } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberOpt[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<string>("Feature");
  const [newAssignee, setNewAssignee] = useState<string>("none");
  const [newStatus, setNewStatus] = useState<string>("NotStarted");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState("");

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/tasks`).then((r) => r.json());
    setTasks(d.tasks ?? []);
    setProgress(d.progress ?? { total: 0, completed: 0, blocked: 0, pct: 0 });
    setMirrored(Boolean(d.mirrored));
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!canEdit) return;
    fetch(`/api/projects/${projectId}/members`)
      .then((r) => r.json())
      .then((d) => setMembers(d.data ?? []))
      .catch(() => {});
  }, [canEdit, projectId]);

  // Deep-linked card (?task=): make sure it's visible (lens + Mine can't hide it),
  // scroll it into view, and pulse it briefly.
  useEffect(() => {
    if (!focusTaskId || tasks.length === 0) return;
    const target = tasks.find((t) => t.id === focusTaskId);
    if (!target) return;
    if (!lensFilter(lens, target)) setLens("all");
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

  const move = async (id: string, status: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t))); // optimistic
    const ok = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }).then((r) => r.ok);
    void load();
    if (!ok) void load();
  };
  const addTask = async () => {
    if (!newTitle.trim()) return;
    const ok = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tasks: [
          {
            title: newTitle.trim(),
            type: newType,
            status: newStatus,
            assigneeId: newAssignee === "none" ? null : newAssignee,
          },
        ],
      }),
    }).then((r) => r.ok);
    if (ok) {
      setNewTitle("");
      setNewType("Feature");
      setNewAssignee("none");
      setNewStatus("NotStarted");
      void load();
    }
  };
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
  const assign = async (id: string, userId: string | null) => {
    const ok = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assigneeId: userId }),
    }).then((r) => r.ok);
    if (ok) void load();
  };

  const now = Date.now();
  const draftCount = tasks.filter((t) => t.approvalStatus === "Draft").length;
  const approveDrafts = async () => {
    const ok = await fetch(`/api/projects/${projectId}/tasks/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).then((r) => r.ok);
    if (ok) void load();
  };

  // One task list, three lenses (6.2). On the QA lens, unassigned bugs are pinned in the
  // Triage strip instead of sitting in a column. The Mine chip narrows to the viewer's
  // assignments; the triage strip is exempt (unassigned bugs are nobody's — yet).
  const triage = useMemo(() => (lens === "qa" ? tasks.filter(isTriageBug) : []), [lens, tasks]);
  const visible = useMemo(
    () =>
      tasks.filter(
        (t) =>
          lensFilter(lens, t) &&
          !(lens === "qa" && isTriageBug(t)) &&
          (!mine || t.assigneeId === viewerId),
      ),
    [lens, tasks, mine, viewerId],
  );
  const overloads = useMemo(() => wipOverloads(tasks), [tasks]);
  const lensCount = (l: BoardLens) => tasks.filter((t) => lensFilter(l, t)).length;
  const mineCount = useMemo(() => tasks.filter((t) => t.assigneeId === viewerId).length, [tasks, viewerId]);
  const bugAssignees = members.length ? members : [];

  return (
    <div className="flex flex-col gap-4">
      <ConversationDrawer
        open={!!discussTask}
        onOpenChange={(o) => !o && setDiscussTask(null)}
        title={discussTask?.title ?? ""}
        entityType="project_task"
        entityId={discussTask?.id ?? null}
        viewerId={viewerId ?? ""}
        canPromote={canPublish}
      />
      {/* Header: progress + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] flex-1">
          <div className="h-[6px] overflow-hidden rounded-full bg-[var(--w08)]">
            <div className="h-full rounded-full bg-[var(--ok)]" style={{ width: `${progress.pct}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-[var(--ink4)]">
            {progress.completed}/{progress.total} done · {progress.pct}%
            {progress.blocked > 0 && <span className="text-[var(--bad)]"> · {progress.blocked} blocked</span>}
          </div>
        </div>
        {canEdit && !mirrored && (
          <BugDialog
            projectId={projectId}
            members={bugAssignees}
            tasks={tasks.filter((t) => t.approvalStatus !== "Draft" && t.type !== "Bug").map((t) => ({ id: t.id, title: t.title, taskKey: t.taskKey }))}
            onAdded={() => void load()}
          />
        )}
        {canEdit && !mirrored && (
          <button
            type="button"
            onClick={() => setGenOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] px-3.5 py-2 text-[12px] font-semibold text-brand"
          >
            <Sparkles className="size-3.5" /> Generate from document
          </button>
        )}
        {canPublish && draftCount > 0 && (
          <button
            type="button"
            onClick={approveDrafts}
            className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold"
            style={{ color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 14%, transparent)" }}
          >
            Approve {draftCount} draft{draftCount === 1 ? "" : "s"}
          </button>
        )}
        {!canPublish && draftCount > 0 && (
          <span className="rounded-full px-3 py-1.5 text-[11px] font-semibold" style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 12%, transparent)" }}>
            {draftCount} draft{draftCount === 1 ? "" : "s"} awaiting PM approval
          </span>
        )}
      </div>

      {/* Lens tabs (6.2): filters over one list — never separate boards. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(LENS_LABELS) as BoardLens[]).map((l) => {
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
            <button
              type="button"
              onClick={() => setMine((m) => !m)}
              className="rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors"
              title="Show only tasks assigned to you"
              style={{
                borderColor: mine ? "var(--brand)" : "var(--hair)",
                background: mine ? "color-mix(in oklab, var(--brand) 10%, transparent)" : "transparent",
                color: mine ? "var(--brand)" : "var(--ink4)",
              }}
            >
              Mine <span className="font-mono text-[9.5px] opacity-70">{mineCount}</span>
            </button>
          </>
        )}
      </div>

      {/* QA triage strip: unassigned bugs, pinned until someone owns them. */}
      {lens === "qa" && triage.length > 0 && (
        <div
          className="flex flex-col gap-2 rounded-[14px] border p-3"
          style={{ borderColor: "color-mix(in oklab, var(--bad) 40%, transparent)", background: "color-mix(in oklab, var(--bad) 5%, transparent)" }}
        >
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--bad)]">
            <TriangleAlert className="size-3" /> Triage — unassigned bugs
            <span className="text-[var(--ink4)]">{triage.length}</span>
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
                <span className="truncate text-[10.5px] text-[var(--ink4)]">{t.taskKey ?? "—"}</span>
                {canEdit && (
                  <Select
                    value="none"
                    onValueChange={(v) => v && v !== "none" && assign(t.id, v)}
                    items={{ none: "Assign to…", ...Object.fromEntries(members.map((m) => [m.userId, `${m.name} · ${m.role}`])) }}
                  >
                    <SelectTrigger className="h-6 w-full text-[10.5px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Assign to…</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.userId} value={m.userId}>{m.name} · {m.role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Columns */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const items = visible.filter((t) => t.status === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setDropCol(col.key);
              }}
              onDragLeave={() => setDropCol((c) => (c === col.key ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setDropCol(null);
                const id = e.dataTransfer.getData("text/plain") || dragId;
                if (id) void move(id, col.key);
              }}
              className="flex min-h-[120px] flex-col gap-2 rounded-[14px] border p-2.5 transition-colors"
              style={{
                borderColor: dropCol === col.key ? "var(--brand)" : "var(--w07)",
                background: dropCol === col.key ? "color-mix(in oklab, var(--brand) 6%, transparent)" : "var(--w02)",
              }}
            >
              <div className="flex items-center gap-2 px-1 py-0.5 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: `var(${col.token})` }}>
                <span className="size-2 rounded-full" style={{ background: `var(${col.token})` }} />
                {col.label}
                {col.key === "InProgress" && overloads.length > 0 && (
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
                    draggable={canEdit && !t.sourceSystem}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", t.id);
                      setDragId(t.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    className="flex flex-col gap-1.5 rounded-[10px] border bg-[var(--qcard)] p-2.5 text-xs transition-shadow duration-500"
                    title={aging ? "No activity for over 5 business days" : undefined}
                    style={{
                      cursor: canEdit && !t.sourceSystem ? "grab" : "default",
                      opacity: dragId === t.id ? 0.5 : 1,
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
                        <span
                          className="ml-1.5 rounded-[4px] px-1.5 py-[1px] font-mono text-[8.5px] font-semibold uppercase tracking-[1px]"
                          style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 16%, transparent)" }}
                        >
                          Draft
                        </span>
                      )}
                      {t.blocked && (
                        <span
                          className="ml-1.5 rounded-[4px] px-1.5 py-[1px] font-mono text-[8.5px] font-semibold uppercase tracking-[1px]"
                          style={{ color: "var(--bad)", background: "color-mix(in oklab, var(--bad) 16%, transparent)" }}
                        >
                          Blocked
                        </span>
                      )}
                      {t.type === "Bug" && t.severity && (
                        <span
                          className="ml-1.5 rounded-[4px] px-1.5 py-[1px] font-mono text-[8.5px] font-semibold uppercase tracking-[1px]"
                          style={{ color: `var(${sevTok})`, background: `color-mix(in oklab, var(${sevTok}) 14%, transparent)` }}
                        >
                          {t.severity}
                        </span>
                      )}
                      {aging && (
                        <span
                          className="ml-1.5 rounded-[4px] px-1.5 py-[1px] font-mono text-[8.5px] font-semibold uppercase tracking-[1px]"
                          style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 14%, transparent)" }}
                        >
                          Stale
                        </span>
                      )}
                      {/* M7-A: nobody should start work that cannot move — the chip names
                          what it waits on, so the answer isn't a click away. */}
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
                      {/* M7-C: a mirrored issue shows its YouTrack key and links straight
                          out — that is where it is edited, so make the trip one click. */}
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
                      <span className="min-w-0 truncate">
                        {[t.type !== "Feature" ? t.type : null, t.phase, t.priority, t.assigneeName ?? t.externalAssigneeName].filter(Boolean).join(" · ") || "—"}
                        {t.dueDate && (
                          <span style={{ color: overdue ? "var(--bad)" : undefined }}> · due {new Date(t.dueDate).toLocaleDateString()}</span>
                        )}
                      </span>
                    </span>
                    {canEdit && t.sourceSystem && (
                      <span className="text-[10px] italic text-[var(--ink5)]">Status is set in YouTrack</span>
                    )}
                    {canEdit && !t.sourceSystem && (
                      <Select
                        value={t.status}
                        onValueChange={(v) => v && v !== t.status && move(t.id, v)}
                        items={Object.fromEntries(COLUMNS.map((c) => [c.key, c.label]))}
                      >
                        <SelectTrigger className="h-6 w-full text-[10.5px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COLUMNS.map((c) => (
                            <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {canEdit && t.approvalStatus !== "Draft" && t.status !== "Completed" && (
                      t.blocked ? (
                        <button
                          type="button"
                          onClick={() => unflagBlocked(t.id)}
                          className="self-start text-[10px] font-semibold text-[var(--bad)] hover:underline"
                        >
                          Resolve blocker
                        </button>
                      ) : flaggingId === t.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={flagReason}
                            onChange={(e) => setFlagReason(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void flagBlocked(t.id);
                              if (e.key === "Escape") { setFlaggingId(null); setFlagReason(""); }
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
                          onClick={() => { setFlaggingId(t.id); setFlagReason(""); }}
                          className="flex items-center gap-1 self-start text-[10px] text-[var(--ink5)] hover:text-[var(--bad)]"
                        >
                          <Flag className="size-2.5" /> Flag blocked
                        </button>
                      )
                    )}
                  </div>
                );
              })}

              {canEdit && mirrored && col.key === "NotStarted" && (
                <p className="pt-1 text-[10.5px] leading-[1.5] text-[var(--ink5)]">
                  Issues are raised in YouTrack and appear here at the next sync.
                </p>
              )}
              {canEdit && !mirrored && col.key === "NotStarted" && (
                <div className="flex flex-col gap-1.5 pt-1">
                  <div className="flex items-center gap-1.5">
                    <input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addTask()}
                      placeholder="Add a task…"
                      className="h-7 flex-1 rounded-[6px] border border-ink-4 bg-background px-2 text-[11px] text-foreground outline-none focus:border-brand"
                    />
                    <button type="button" onClick={addTask} className="flex size-7 items-center justify-center rounded-[6px] bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] text-brand" aria-label="Add task">
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  {/* Assign + place at creation (per Joyce): type, developer/tester, column. */}
                  {newTitle.trim() && (
                    <div className="flex flex-col gap-1.5">
                      <Select value={newType} onValueChange={(v) => v && setNewType(v)} items={Object.fromEntries(TYPES.map((t) => [t, t]))}>
                        <SelectTrigger className="h-6 w-full text-[10.5px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select
                        value={newAssignee}
                        onValueChange={(v) => v && setNewAssignee(v)}
                        items={{ none: "Unassigned", ...Object.fromEntries(members.map((m) => [m.userId, `${m.name} · ${m.role}`])) }}
                      >
                        <SelectTrigger className="h-6 w-full text-[10.5px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {members.map((m) => (
                            <SelectItem key={m.userId} value={m.userId}>{m.name} · {m.role}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={newStatus}
                        onValueChange={(v) => v && setNewStatus(v)}
                        items={Object.fromEntries(COLUMNS.map((c) => [c.key, c.label]))}
                      >
                        <SelectTrigger className="h-6 w-full text-[10.5px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COLUMNS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
              {items.length === 0 && col.key !== "NotStarted" && <p className="px-1 text-[11px] text-[var(--ink5)]">—</p>}
            </div>
          );
        })}
      </div>

      {genOpen && <GenerateDialog projectId={projectId} onClose={() => setGenOpen(false)} onAdded={() => { setGenOpen(false); void load(); }} />}
    </div>
  );
}
