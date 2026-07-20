"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
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
  assigneeName: string | null;
  dueDate: string | null;
}
interface Progress {
  total: number;
  completed: number;
  blocked: number;
  pct: number;
}

const COLUMNS = [
  { key: "NotStarted", label: "Not started", token: "--ink4" },
  { key: "InProgress", label: "In progress", token: "--qinfo" },
  { key: "Blocked", label: "Blocked", token: "--bad" },
  { key: "Completed", label: "Completed", token: "--ok" },
] as const;

/** Kanban board — the project's live tracking surface. Drag a card between columns (or use
 *  the card's status menu) to update it; progress recomputes from completed/total. */
export function ProjectBoard({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [progress, setProgress] = useState<Progress>({ total: 0, completed: 0, blocked: 0, pct: 0 });
  const [genOpen, setGenOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/tasks`).then((r) => r.json());
    setTasks(d.tasks ?? []);
    setProgress(d.progress ?? { total: 0, completed: 0, blocked: 0, pct: 0 });
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

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
      body: JSON.stringify({ tasks: [{ title: newTitle.trim() }] }),
    }).then((r) => r.ok);
    if (ok) {
      setNewTitle("");
      void load();
    }
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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                    className="flex flex-col gap-1.5 rounded-[10px] border border-[var(--w07)] bg-[var(--qcard)] p-2.5 text-xs"
                    style={{ cursor: canEdit ? "grab" : "default", opacity: dragId === t.id ? 0.5 : 1 }}
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
                    </span>
                    <span className="truncate text-[10.5px] text-[var(--ink4)]">
                      {[t.phase, t.priority, t.assigneeName].filter(Boolean).join(" · ") || "—"}
                      {t.dueDate && (
                        <span style={{ color: overdue ? "var(--bad)" : undefined }}> · due {new Date(t.dueDate).toLocaleDateString()}</span>
                      )}
                    </span>
                    {canEdit && (
                      <Select value={t.status} onValueChange={(v) => v && v !== t.status && move(t.id, v)}>
                        <SelectTrigger className="h-6 w-full text-[10.5px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COLUMNS.map((c) => (
                            <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}

              {canEdit && col.key === "NotStarted" && (
                <div className="flex items-center gap-1.5 pt-1">
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
