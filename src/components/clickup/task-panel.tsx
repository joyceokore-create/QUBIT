"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTaskPanel } from "@/components/clickup/task-panel-context";
import { statusColor } from "@/components/clickup/status-color";
import { ChecklistsSection } from "@/components/clickup/checklists-section";
import { CommentsSection } from "@/components/clickup/comments-section";
import { PeopleTagsSection } from "@/components/clickup/people-tags-section";
import { CustomFieldsSection } from "@/components/clickup/custom-fields-section";
import { TaskTimeSection } from "@/components/clickup/task-time-section";

interface TaskStatus {
  id: string;
  name: string;
  colorToken: string;
  type: string;
}
interface RelatedTask {
  id: string;
  seq: number;
  name: string;
  statusId?: string;
  status?: { name: string; colorToken: string } | null;
}
interface Dependency {
  id: string;
  type: string;
  to?: RelatedTask;
  from?: RelatedTask;
}
interface TaskData {
  id: string;
  seq: number;
  name: string;
  listId: string;
  statusId: string;
  priority: string | null;
  dueDate: string | null;
  description: unknown;
  isMilestone: boolean;
  timeEstimate: number | null;
  children: RelatedTask[];
  dependencies: Dependency[]; // this task blocks →
  dependents: Dependency[]; // ← blocked by
  list: { spaceId: string } | null;
  assignees: { userId: string; user: { name: string } | null }[];
  watchers: { userId: string; user: { name: string } | null }[];
  tags: { tagId: string; tag: { name: string; colorToken: string } | null }[];
}
interface ActivityRow {
  id: string;
  verb: string;
  createdAt: string;
}

const PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"] as const;

export function TaskPanel() {
  const { openId, open, close } = useTaskPanel();
  const router = useRouter();
  const [task, setTask] = useState<TaskData | null>(null);
  const [statuses, setStatuses] = useState<TaskStatus[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string, keep: boolean) => {
    if (!keep) setTask(null);
    setError(null);
    const res = await fetch(`/api/v1/tasks/${id}`);
    if (!res.ok) {
      setError("Could not load this task.");
      return;
    }
    const { data } = await res.json();
    setTask(data);
    const [st, act] = await Promise.all([
      fetch(`/api/v1/lists/${data.listId}/statuses`).then((r) => r.json()),
      fetch(`/api/v1/tasks/${id}/activity`).then((r) => r.json()),
    ]);
    setStatuses(st.data ?? []);
    setActivity(act.data ?? []);
  }, []);

  useEffect(() => {
    if (!openId) {
      setTask(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      if (!cancelled) await load(openId, false);
    })();
    return () => {
      cancelled = true;
    };
  }, [openId, load]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      if (!openId) return;
      const res = await fetch(`/api/v1/tasks/${openId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const { data } = await res.json();
        setTask((prev) => (prev ? { ...prev, ...data } : prev));
        router.refresh();
      }
    },
    [openId, router],
  );

  const reload = useCallback(async () => {
    if (openId) await load(openId, true);
    router.refresh();
  }, [openId, load, router]);

  return (
    <Sheet open={!!openId} onOpenChange={(o) => !o && close()}>
      <SheetContent
        side="right"
        className="w-[640px] gap-0 overflow-y-auto border-[var(--w08)] bg-[var(--drawer)] p-0 sm:max-w-none"
      >
        <SheetTitle className="sr-only">Task details</SheetTitle>
        {error && <p className="p-6 text-[13px] text-[var(--bad)]">{error}</p>}
        {task && (
          <div className="flex flex-col gap-5 p-6">
            <div className="font-mono text-[11px] uppercase tracking-[1px] text-[var(--ink4)]">
              QBT-{task.seq}
              {task.isMilestone && <span className="ml-2 text-[var(--brand)]">◆ Milestone</span>}
            </div>

            <input
              defaultValue={task.name}
              key={task.id}
              onBlur={(e) => e.target.value.trim() && e.target.value !== task.name && patch({ name: e.target.value.trim() })}
              className="w-full border-0 bg-transparent text-[20px] font-bold text-[var(--qink)] outline-none"
            />

            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[.5px] text-[var(--ink4)]">
                Status
                <Select
                  value={task.statusId}
                  onValueChange={(v) => v && patch({ statusId: v })}
                  items={Object.fromEntries(statuses.map((s) => [s.id, s.name]))}
                >
                  <SelectTrigger
                    className="min-w-[150px] rounded-[8px] border-[var(--w10)] bg-[var(--elev)] px-3 text-[13px] font-semibold"
                    style={{ color: statusColor(statuses.find((s) => s.id === task.statusId)?.colorToken ?? "neutral") }}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s.id} value={s.id} style={{ color: "var(--qink)" }}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[.5px] text-[var(--ink4)]">
                Priority
                <Select
                  value={task.priority ?? "NONE"}
                  onValueChange={(v) => patch({ priority: v && v !== "NONE" ? v : null })}
                  items={{ NONE: "None", ...Object.fromEntries(PRIORITIES.map((p) => [p, p[0] + p.slice(1).toLowerCase()])) }}
                >
                  <SelectTrigger className="min-w-[120px] rounded-[8px] border-[var(--w10)] bg-[var(--elev)] px-3 text-[13px] font-medium text-[var(--qink)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None</SelectItem>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p[0] + p.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[.5px] text-[var(--ink4)]">
                Due date
                <input
                  type="date"
                  defaultValue={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                  onChange={(e) => patch({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  className="rounded-[8px] border border-[var(--w10)] bg-[var(--elev)] px-3 py-2 text-[13px] text-[var(--qink)] outline-none"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[.5px] text-[var(--ink4)]">
              Description
              <textarea
                key={`${task.id}-desc`}
                defaultValue={typeof task.description === "string" ? task.description : ""}
                onBlur={(e) => patch({ description: e.target.value })}
                rows={4}
                placeholder="Add a description…"
                className="resize-y rounded-[10px] border border-[var(--w10)] bg-[var(--card2)] px-3 py-2 text-[13px] leading-[1.5] text-[var(--ink2)] outline-none focus:border-brand"
              />
            </label>

            {task.list && (
              <PeopleTagsSection
                taskId={task.id}
                spaceId={task.list.spaceId}
                assignees={task.assignees}
                watchers={task.watchers}
                tags={task.tags}
                onReload={reload}
              />
            )}
            <CustomFieldsSection taskId={task.id} listId={task.listId} />
            <TaskTimeSection taskId={task.id} timeEstimate={task.timeEstimate} />
            <SubtasksSection task={task} onOpen={open} onReload={reload} />
            <DependenciesSection task={task} onOpen={open} onReload={reload} />
            <ChecklistsSection taskId={task.id} />
            <CommentsSection taskId={task.id} />

            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[.5px] text-[var(--ink4)]">
                Activity
              </div>
              <ul className="flex flex-col gap-1.5">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-[12px] text-[var(--ink3)]">
                    <span className="size-1.5 rounded-full bg-[var(--brand)]" />
                    <span className="font-mono text-[var(--ink4)]">{a.verb}</span>
                    <span className="text-[var(--ink5)]">{new Date(a.createdAt).toLocaleString()}</span>
                  </li>
                ))}
                {activity.length === 0 && (
                  <li className="text-[12px] text-[var(--ink5)]">No activity yet.</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[.5px] text-[var(--ink4)]">
      {children}
    </div>
  );
}

function SubtasksSection({
  task,
  onOpen,
  onReload,
}: {
  task: TaskData;
  onOpen: (id: string) => void;
  onReload: () => void;
}) {
  const [name, setName] = useState("");
  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/v1/tasks/${task.id}/subtasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      setName("");
      onReload();
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Subtasks {task.children.length > 0 && `(${task.children.length})`}</SectionLabel>
      <ul className="flex flex-col">
        {task.children.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onOpen(c.id)}
              className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-[13px] text-[var(--ink2)] hover:bg-[var(--w05)]"
            >
              <span
                className="size-2 flex-none rounded-full"
                style={{ background: statusColor(c.status?.colorToken ?? "neutral") }}
              />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="font-mono text-[10.5px] text-[var(--ink5)]">QBT-{c.seq}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 px-2">
        <Plus className="size-3.5 flex-none text-[var(--ink4)]" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add subtask…"
          className="flex-1 bg-transparent text-[13px] text-[var(--qink)] outline-none placeholder:text-[var(--ink4)]"
        />
      </div>
    </div>
  );
}

const DEP_LABEL: Record<string, string> = { BLOCKS: "blocks", WAITING_ON: "waiting on", LINKED: "linked" };

function DependenciesSection({
  task,
  onOpen,
  onReload,
}: {
  task: TaskData;
  onOpen: (id: string) => void;
  onReload: () => void;
}) {
  const [seq, setSeq] = useState("");
  const [type, setType] = useState("BLOCKS");
  const [err, setErr] = useState<string | null>(null);

  const add = async () => {
    setErr(null);
    const n = Number(seq);
    if (!Number.isInteger(n) || n <= 0) return;
    const lookup = await fetch(`/api/v1/tasks/seq/${n}`);
    if (!lookup.ok) {
      setErr(`No task QBT-${n}.`);
      return;
    }
    const { data } = await lookup.json();
    const res = await fetch(`/api/v1/tasks/${task.id}/dependencies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toId: data.id, type }),
    });
    if (res.ok) {
      setSeq("");
      onReload();
    } else {
      const body = await res.json().catch(() => null);
      setErr(body?.error?.message ?? "Could not add dependency.");
    }
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/v1/dependencies/${id}`, { method: "DELETE" });
    if (res.ok) onReload();
  };

  const Row = ({ dep, other, verb }: { dep: Dependency; other?: RelatedTask; verb: string }) => (
    <li className="group flex items-center gap-2 rounded-[7px] px-2 py-1.5 text-[13px] hover:bg-[var(--w05)]">
      <span className="text-[10.5px] font-semibold uppercase tracking-[.5px] text-[var(--ink5)]">{verb}</span>
      <button
        type="button"
        onClick={() => other && onOpen(other.id)}
        className="min-w-0 flex-1 truncate text-left text-[var(--ink2)] hover:text-[var(--qink)]"
      >
        {other ? `QBT-${other.seq} · ${other.name}` : "—"}
      </button>
      <ConfirmDialog
        trigger={
          <button
            type="button"
            className="flex size-5 flex-none items-center justify-center rounded text-[var(--ink4)] opacity-0 hover:text-[var(--bad)] group-hover:opacity-100"
            aria-label="Remove dependency"
          >
            <X className="size-3.5" />
          </button>
        }
        title="Remove dependency?"
        description="This dependency link will be removed."
        confirmLabel="Remove"
        onConfirm={() => remove(dep.id)}
      />
    </li>
  );

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Dependencies</SectionLabel>
      <ul className="flex flex-col">
        {task.dependencies.map((d) => (
          <Row key={d.id} dep={d} other={d.to} verb={DEP_LABEL[d.type] ?? d.type} />
        ))}
        {task.dependents.map((d) => (
          <Row key={d.id} dep={d} other={d.from} verb={d.type === "LINKED" ? "linked" : "blocked by"} />
        ))}
        {task.dependencies.length + task.dependents.length === 0 && (
          <li className="px-2 py-1 text-[12px] text-[var(--ink5)]">No dependencies.</li>
        )}
      </ul>
      <div className="flex items-center gap-2 px-2">
        <Select value={type} onValueChange={(v) => v && setType(v)} items={{ BLOCKS: "Blocks", WAITING_ON: "Waiting on", LINKED: "Linked" }}>
          <SelectTrigger className="rounded-[7px] border-[var(--w10)] bg-[var(--elev)] px-2 py-1.5 text-[12px] text-[var(--qink)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BLOCKS">Blocks</SelectItem>
            <SelectItem value="WAITING_ON">Waiting on</SelectItem>
            <SelectItem value="LINKED">Linked</SelectItem>
          </SelectContent>
        </Select>
        <input
          value={seq}
          onChange={(e) => setSeq(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="QBT-#"
          inputMode="numeric"
          className="w-24 rounded-[7px] border border-[var(--w10)] bg-[var(--card2)] px-2 py-1.5 text-[12px] text-[var(--qink)] outline-none placeholder:text-[var(--ink4)]"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-[7px] bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] px-3 py-1.5 text-[12px] font-semibold text-brand hover:bg-[color-mix(in_oklab,var(--brand)_22%,transparent)]"
        >
          Add
        </button>
      </div>
      {err && <p className="px-2 text-[12px] text-[var(--bad)]">{err}</p>}
    </div>
  );
}
