"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, Plus, Sparkles } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GenerateDialog } from "@/components/panels/project-tasks-section";

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
  assigneeName: string | null;
  dueDate: string | null;
  blocked: boolean;
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
 *  the card's status menu) to update it; progress recomputes from completed/total. */
export function ProjectBoard({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [progress, setProgress] = useState<Progress>({ total: 0, completed: 0, blocked: 0, pct: 0 });
  const [genOpen, setGenOpen] = useState(false);
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

  return (
    <div className="flex flex-col gap-4">
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
        {canEdit && (
          <button
            type="button"
            onClick={() => setGenOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] px-3.5 py-2 text-[12px] font-semibold text-brand"
          >
            <Sparkles className="size-3.5" /> Generate from document
          </button>
        )}
        {canEdit && draftCount > 0 && (
          <button
            type="button"
            onClick={approveDrafts}
            className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold"
            style={{ color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 14%, transparent)" }}
          >
            Approve {draftCount} draft{draftCount === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {/* Columns */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.key);
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
                <span className="ml-auto text-[var(--ink5)]">{items.length}</span>
              </div>

              {items.map((t) => {
                const overdue = t.dueDate && t.status !== "Completed" && new Date(t.dueDate).getTime() < now;
                return (
                  <div
                    key={t.id}
                    draggable={canEdit}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", t.id);
                      setDragId(t.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    className="flex flex-col gap-1.5 rounded-[10px] border bg-[var(--qcard)] p-2.5 text-xs"
                    style={{
                      cursor: canEdit ? "grab" : "default",
                      opacity: dragId === t.id ? 0.5 : 1,
                      borderColor: t.blocked ? "color-mix(in oklab, var(--bad) 45%, transparent)" : "var(--w07)",
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
                    </span>
                    <span className="truncate text-[10.5px] text-[var(--ink4)]">
                      {[t.taskKey, t.type !== "Feature" ? t.type : null, t.phase, t.priority, t.assigneeName].filter(Boolean).join(" · ") || "—"}
                      {t.dueDate && (
                        <span style={{ color: overdue ? "var(--bad)" : undefined }}> · due {new Date(t.dueDate).toLocaleDateString()}</span>
                      )}
                    </span>
                    {canEdit && (
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

              {canEdit && col.key === "NotStarted" && (
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
