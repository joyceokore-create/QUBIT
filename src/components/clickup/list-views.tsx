"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Columns3, Download, LayoutList, Table2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTaskPanel } from "@/components/clickup/task-panel-context";
import { statusColor } from "@/components/clickup/status-color";

interface Status {
  id: string;
  name: string;
  colorToken: string;
}
interface User {
  id: string;
  name: string;
}
export interface ViewTask {
  id: string;
  seq: number;
  name: string;
  statusId: string;
  priority: string | null;
  dueDate: string | null;
  isMilestone: boolean;
  status: { name: string; colorToken: string } | null;
  assignees: { userId: string; name: string }[];
  tags: { name: string; colorToken: string }[];
}
interface SavedView {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  isPinned: boolean;
}

type ViewType = "LIST" | "BOARD" | "TABLE";
type GroupBy = "none" | "status" | "priority" | "assignee";
type SortField = "orderIndex" | "dueDate" | "priority" | "name" | "createdAt";

interface Config {
  viewType: ViewType;
  filters: {
    statusIds: string[];
    priorities: string[];
    assigneeIds: string[];
    search: string;
    due: "any" | "overdue" | "today" | "week" | "none";
  };
  sort: { field: SortField; dir: "asc" | "desc" };
  groupBy: GroupBy;
  meMode: boolean;
}

const DEFAULT_CONFIG: Config = {
  viewType: "LIST",
  filters: { statusIds: [], priorities: [], assigneeIds: [], search: "", due: "any" },
  sort: { field: "orderIndex", dir: "asc" },
  groupBy: "none",
  meMode: false,
};

const PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"];
const PRIORITY_COLOR = (p: string) =>
  statusColor(p === "URGENT" ? "bad" : p === "HIGH" ? "warn" : p === "LOW" ? "neutral" : "info");

export function ListViews({
  listId,
  initialTasks,
  statuses,
  users,
  currentUserId,
  savedViews,
}: {
  listId: string;
  initialTasks: ViewTask[];
  statuses: Status[];
  users: User[];
  currentUserId: string;
  savedViews: SavedView[];
}) {
  const router = useRouter();
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [tasks, setTasks] = useState<ViewTask[]>(initialTasks);
  const firstRun = useRef(true);

  const fetchTasks = useCallback(async () => {
    const assigneeIds = config.meMode
      ? [...new Set([...config.filters.assigneeIds, currentUserId])]
      : config.filters.assigneeIds;
    const res = await fetch(`/api/v1/lists/${listId}/tasks/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filters: {
          ...(config.filters.statusIds.length && { statusIds: config.filters.statusIds }),
          ...(config.filters.priorities.length && { priorities: config.filters.priorities }),
          ...(assigneeIds.length && { assigneeIds }),
          ...(config.filters.search && { search: config.filters.search }),
          ...(config.filters.due !== "any" && { due: config.filters.due }),
        },
        sort: config.sort,
        limit: 100,
      }),
    });
    if (res.ok) setTasks((await res.json()).data ?? []);
  }, [listId, config, currentUserId]);

  // Refetch when filters/sort change (skip the initial render — we have SSR data).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    void fetchTasks();
  }, [fetchTasks]);

  const setFilters = (patch: Partial<Config["filters"]>) =>
    setConfig((c) => ({ ...c, filters: { ...c.filters, ...patch } }));

  const loadView = (v: SavedView) => {
    const merged = { ...DEFAULT_CONFIG, ...(v.config as Partial<Config>) } as Config;
    merged.viewType = (["LIST", "BOARD", "TABLE"].includes(v.type) ? v.type : "LIST") as ViewType;
    merged.filters = { ...DEFAULT_CONFIG.filters, ...(merged.filters ?? {}) };
    setConfig(merged);
  };

  const saveView = async () => {
    const name = window.prompt("Save view as")?.trim();
    if (!name) return;
    const res = await fetch(`/api/v1/locations/list/${listId}/views`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: config.viewType, name, config, isPinned: true }),
    });
    if (res.ok) router.refresh();
  };

  const grouped = useMemo(() => groupTasks(tasks, config.groupBy, statuses), [tasks, config.groupBy, statuses]);

  return (
    <div className="flex flex-col gap-3">
      <ViewBar
        config={config}
        setConfig={setConfig}
        setFilters={setFilters}
        statuses={statuses}
        users={users}
        savedViews={savedViews}
        onLoadView={loadView}
        onSaveView={saveView}
        tasks={tasks}
      />

      {config.viewType === "LIST" && <ListView listId={listId} groups={grouped} onRefresh={fetchTasks} />}
      {config.viewType === "BOARD" && <BoardView tasks={tasks} statuses={statuses} onMoved={fetchTasks} />}
      {config.viewType === "TABLE" && <TableView groups={grouped} />}
    </div>
  );
}

// ── Grouping ─────────────────────────────────────────────────────────────────

interface Group {
  key: string;
  label: string;
  color: string;
  tasks: ViewTask[];
}

function groupTasks(tasks: ViewTask[], groupBy: GroupBy, statuses: Status[]): Group[] {
  if (groupBy === "none") return [{ key: "all", label: "", color: "var(--ink4)", tasks }];
  const map = new Map<string, ViewTask[]>();
  const meta = new Map<string, { label: string; color: string }>();

  for (const t of tasks) {
    let key: string;
    let label: string;
    let color = "var(--ink4)";
    if (groupBy === "status") {
      key = t.statusId;
      label = t.status?.name ?? "No status";
      color = statusColor(t.status?.colorToken ?? "neutral");
    } else if (groupBy === "priority") {
      key = t.priority ?? "none";
      label = t.priority ? t.priority[0] + t.priority.slice(1).toLowerCase() : "No priority";
      color = t.priority ? PRIORITY_COLOR(t.priority) : "var(--ink4)";
    } else {
      key = t.assignees[0]?.userId ?? "none";
      label = t.assignees[0]?.name ?? "Unassigned";
    }
    if (!map.has(key)) {
      map.set(key, []);
      meta.set(key, { label, color });
    }
    map.get(key)!.push(t);
  }

  // Stable status ordering when grouping by status.
  const keys = [...map.keys()];
  if (groupBy === "status") keys.sort((a, b) => statuses.findIndex((s) => s.id === a) - statuses.findIndex((s) => s.id === b));
  return keys.map((key) => ({ key, ...meta.get(key)!, tasks: map.get(key)! }));
}

// ── View bar ─────────────────────────────────────────────────────────────────

function ViewBar({
  config,
  setConfig,
  setFilters,
  statuses,
  users,
  savedViews,
  onLoadView,
  onSaveView,
  tasks,
}: {
  config: Config;
  setConfig: React.Dispatch<React.SetStateAction<Config>>;
  setFilters: (patch: Partial<Config["filters"]>) => void;
  statuses: Status[];
  users: User[];
  savedViews: SavedView[];
  onLoadView: (v: SavedView) => void;
  onSaveView: () => void;
  tasks: ViewTask[];
}) {
  const tabs: { t: ViewType; icon: React.ReactNode; label: string }[] = [
    { t: "LIST", icon: <LayoutList className="size-3.5" />, label: "List" },
    { t: "BOARD", icon: <Columns3 className="size-3.5" />, label: "Board" },
    { t: "TABLE", icon: <Table2 className="size-3.5" />, label: "Table" },
  ];
  const activeFilterCount =
    config.filters.statusIds.length +
    config.filters.priorities.length +
    config.filters.assigneeIds.length +
    (config.filters.due !== "any" ? 1 : 0);

  return (
    <div className="flex flex-col gap-2">
      {/* View tabs + saved views */}
      <div className="flex flex-wrap items-center gap-1">
        {tabs.map(({ t, icon, label }) => (
          <button
            key={t}
            type="button"
            onClick={() => setConfig((c) => ({ ...c, viewType: t }))}
            className={
              config.viewType === t
                ? "flex items-center gap-1.5 rounded-[8px] bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] px-3 py-1.5 text-[12.5px] font-semibold text-brand"
                : "flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium text-[var(--ink4)] hover:text-[var(--qink)]"
            }
          >
            {icon}
            {label}
          </button>
        ))}
        <div className="mx-1 h-4 w-px bg-[var(--w10)]" />
        {savedViews.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onLoadView(v)}
            className="rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium text-[var(--ink3)] hover:text-brand"
          >
            {v.name}
          </button>
        ))}
        <button
          type="button"
          onClick={onSaveView}
          className="rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium text-[var(--ink4)] hover:text-brand"
        >
          + Save view
        </button>
      </div>

      {/* Filters / sort / group */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={config.filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          placeholder="Search tasks…"
          className="w-48 rounded-[8px] border border-[var(--w10)] bg-[var(--card2)] px-2.5 py-1.5 text-[12.5px] text-[var(--qink)] outline-none focus:border-brand"
        />

        <MultiFilter
          label={`Status${config.filters.statusIds.length ? ` (${config.filters.statusIds.length})` : ""}`}
          options={statuses.map((s) => ({ id: s.id, label: s.name, color: statusColor(s.colorToken) }))}
          selected={config.filters.statusIds}
          onToggle={(id, on) =>
            setFilters({ statusIds: on ? [...config.filters.statusIds, id] : config.filters.statusIds.filter((x) => x !== id) })
          }
        />
        <MultiFilter
          label={`Priority${config.filters.priorities.length ? ` (${config.filters.priorities.length})` : ""}`}
          options={PRIORITIES.map((p) => ({ id: p, label: p[0] + p.slice(1).toLowerCase(), color: PRIORITY_COLOR(p) }))}
          selected={config.filters.priorities}
          onToggle={(id, on) =>
            setFilters({ priorities: on ? [...config.filters.priorities, id] : config.filters.priorities.filter((x) => x !== id) })
          }
        />
        <MultiFilter
          label={`Assignee${config.filters.assigneeIds.length ? ` (${config.filters.assigneeIds.length})` : ""}`}
          options={users.map((u) => ({ id: u.id, label: u.name }))}
          selected={config.filters.assigneeIds}
          onToggle={(id, on) =>
            setFilters({ assigneeIds: on ? [...config.filters.assigneeIds, id] : config.filters.assigneeIds.filter((x) => x !== id) })
          }
        />

        <select
          value={config.filters.due}
          onChange={(e) => setFilters({ due: e.target.value as Config["filters"]["due"] })}
          className="rounded-[8px] border border-[var(--w10)] bg-[var(--elev)] px-2 py-1.5 text-[12px] text-[var(--qink)] outline-none"
        >
          <option value="any">Any due</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="week">Due this week</option>
          <option value="none">No due date</option>
        </select>

        <button
          type="button"
          onClick={() => setConfig((c) => ({ ...c, meMode: !c.meMode }))}
          className={
            config.meMode
              ? "rounded-full bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] px-3 py-1.5 text-[12px] font-semibold text-brand"
              : "rounded-full border border-[var(--w10)] px-3 py-1.5 text-[12px] text-[var(--ink4)] hover:border-brand hover:text-brand"
          }
        >
          Me mode
        </button>

        <div className="mx-1 h-4 w-px bg-[var(--w10)]" />

        <select
          value={config.groupBy}
          onChange={(e) => setConfig((c) => ({ ...c, groupBy: e.target.value as GroupBy }))}
          className="rounded-[8px] border border-[var(--w10)] bg-[var(--elev)] px-2 py-1.5 text-[12px] text-[var(--qink)] outline-none"
          title="Group by"
        >
          <option value="none">No grouping</option>
          <option value="status">Group: Status</option>
          <option value="priority">Group: Priority</option>
          <option value="assignee">Group: Assignee</option>
        </select>

        <select
          value={`${config.sort.field}:${config.sort.dir}`}
          onChange={(e) => {
            const [field, dir] = e.target.value.split(":") as [SortField, "asc" | "desc"];
            setConfig((c) => ({ ...c, sort: { field, dir } }));
          }}
          className="rounded-[8px] border border-[var(--w10)] bg-[var(--elev)] px-2 py-1.5 text-[12px] text-[var(--qink)] outline-none"
          title="Sort"
        >
          <option value="orderIndex:asc">Manual order</option>
          <option value="dueDate:asc">Due ↑</option>
          <option value="dueDate:desc">Due ↓</option>
          <option value="priority:asc">Priority</option>
          <option value="name:asc">Name A–Z</option>
          <option value="createdAt:desc">Newest</option>
        </select>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_CONFIG.filters)}
            className="text-[12px] text-[var(--ink4)] hover:text-brand"
          >
            Clear
          </button>
        )}

        {config.viewType === "TABLE" && (
          <button
            type="button"
            onClick={() => exportCsv(tasks)}
            className="ml-auto flex items-center gap-1.5 rounded-[8px] border border-[var(--w10)] px-3 py-1.5 text-[12px] text-[var(--ink3)] hover:border-brand hover:text-brand"
          >
            <Download className="size-3.5" /> CSV
          </button>
        )}
      </div>
    </div>
  );
}

function MultiFilter({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { id: string; label: string; color?: string }[];
  selected: string[];
  onToggle: (id: string, on: boolean) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-[8px] border border-[var(--w10)] bg-[var(--elev)] px-2.5 py-1.5 text-[12px] text-[var(--ink3)] hover:border-brand hover:text-[var(--qink)]">
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[300px] overflow-y-auto">
        <DropdownMenuLabel>Filter</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.id}
            checked={selected.includes(o.id)}
            onCheckedChange={(on) => onToggle(o.id, on)}
          >
            {o.color && <span style={{ color: o.color }}>●</span>} {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        {options.length === 0 && <DropdownMenuLabel>No options</DropdownMenuLabel>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Views ────────────────────────────────────────────────────────────────────

function GroupHeader({ group }: { group: Group }) {
  if (!group.label) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-[.5px]">
      <span className="size-2 rounded-full" style={{ background: group.color }} />
      <span style={{ color: group.color }}>{group.label}</span>
      <span className="text-[var(--ink5)]">{group.tasks.length}</span>
    </div>
  );
}

function ListView({ listId, groups, onRefresh }: { listId: string; groups: Group[]; onRefresh: () => void }) {
  const { open } = useTaskPanel();
  const [name, setName] = useState("");
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  const addTask = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/v1/lists/${listId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      setName("");
      onRefresh();
    }
  };
  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--w07)] bg-[var(--qcard)]">
      {groups.map((g) => (
        <div key={g.key}>
          <GroupHeader group={g} />
          {g.tasks.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => open(t.id)}
              className="flex w-full items-center gap-3 border-t border-[var(--w05)] px-3 py-[10px] text-left transition-colors hover:bg-[var(--w04)]"
            >
              <span className="size-2.5 flex-none rounded-full" style={{ background: statusColor(t.status?.colorToken ?? "neutral") }} title={t.status?.name} />
              {t.isMilestone && <span className="text-[var(--brand)]">◆</span>}
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--qink)]">{t.name}</span>
              {t.tags.map((tag) => (
                <span key={tag.name} className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: statusColor(tag.colorToken), background: `color-mix(in oklab, ${statusColor(tag.colorToken)} 14%, transparent)` }}>
                  {tag.name}
                </span>
              ))}
              {t.priority && <span className="text-[10.5px] font-bold uppercase" style={{ color: PRIORITY_COLOR(t.priority) }}>{t.priority}</span>}
              {t.dueDate && <span className="font-mono text-[11px] text-[var(--ink4)]">{new Date(t.dueDate).toLocaleDateString()}</span>}
              <span className="font-mono text-[10.5px] text-[var(--ink5)]">QBT-{t.seq}</span>
            </button>
          ))}
        </div>
      ))}
      {total === 0 && <p className="px-3 py-6 text-center text-[12px] text-[var(--ink5)]">No tasks match these filters.</p>}
      <div className="flex items-center gap-2 border-t border-[var(--w05)] px-3 py-2">
        <span className="text-[var(--ink4)]">+</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="Add task, press Enter…"
          className="flex-1 bg-transparent text-[13px] text-[var(--qink)] outline-none placeholder:text-[var(--ink4)]"
        />
      </div>
    </div>
  );
}

function BoardView({ tasks, statuses, onMoved }: { tasks: ViewTask[]; statuses: Status[]; onMoved: () => void }) {
  const { open } = useTaskPanel();
  const [dragId, setDragId] = useState<string | null>(null);
  const move = async (taskId: string, statusId: string) => {
    const res = await fetch(`/api/v1/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ statusId }),
    });
    if (res.ok) onMoved();
  };
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {statuses.map((status) => {
        const col = tasks.filter((t) => t.statusId === status.id);
        const color = statusColor(status.colorToken);
        return (
          <div
            key={status.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = dragId ?? e.dataTransfer.getData("text/plain");
              if (id) void move(id, status.id);
              setDragId(null);
            }}
            className="flex w-[280px] flex-none flex-col gap-2 rounded-[12px] border border-[var(--w07)] bg-[var(--qcard)] p-2"
          >
            <div className="flex items-center gap-2 px-1 py-1">
              <span className="size-2 rounded-full" style={{ background: color }} />
              <span className="text-[12px] font-semibold" style={{ color }}>{status.name}</span>
              <span className="ml-auto text-[11px] text-[var(--ink5)]">{col.length}</span>
            </div>
            <div className="flex min-h-[40px] flex-col gap-2">
              {col.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    setDragId(task.id);
                    e.dataTransfer.setData("text/plain", task.id);
                  }}
                  onDragEnd={() => setDragId(null)}
                  onClick={() => open(task.id)}
                  className="flex flex-col gap-1.5 rounded-[10px] border border-[var(--w07)] bg-[var(--card2)] p-3 text-left hover:border-[color-mix(in_oklab,var(--brand)_50%,transparent)]"
                >
                  <span className="flex items-center gap-1.5 text-[13px] text-[var(--qink)]">
                    {task.isMilestone && <span className="text-[var(--brand)]">◆</span>}
                    {task.name}
                  </span>
                  <span className="flex items-center gap-2">
                    {task.priority && <span className="text-[10px] font-bold uppercase" style={{ color: PRIORITY_COLOR(task.priority) }}>{task.priority}</span>}
                    <span className="ml-auto font-mono text-[10px] text-[var(--ink5)]">QBT-{task.seq}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TableView({ groups }: { groups: Group[] }) {
  const { open } = useTaskPanel();
  return (
    <div className="overflow-x-auto rounded-[12px] border border-[var(--w07)] bg-[var(--qcard)]">
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[var(--w07)] text-left text-[11px] font-bold uppercase tracking-[.5px] text-[var(--ink4)]">
            <th className="px-3 py-2 font-bold">Task</th>
            <th className="px-3 py-2 font-bold">Status</th>
            <th className="px-3 py-2 font-bold">Priority</th>
            <th className="px-3 py-2 font-bold">Assignees</th>
            <th className="px-3 py-2 font-bold">Due</th>
            <th className="px-3 py-2 font-bold">ID</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) =>
            g.tasks.map((t) => (
              <tr
                key={t.id}
                onClick={() => open(t.id)}
                className="cursor-pointer border-b border-[var(--w05)] hover:bg-[var(--w04)]"
              >
                <td className="px-3 py-2 text-[var(--qink)]">
                  {t.isMilestone && <span className="mr-1 text-[var(--brand)]">◆</span>}
                  {t.name}
                </td>
                <td className="px-3 py-2">
                  <span style={{ color: statusColor(t.status?.colorToken ?? "neutral") }}>● {t.status?.name}</span>
                </td>
                <td className="px-3 py-2" style={{ color: t.priority ? PRIORITY_COLOR(t.priority) : "var(--ink5)" }}>
                  {t.priority ?? "—"}
                </td>
                <td className="px-3 py-2 text-[var(--ink3)]">{t.assignees.map((a) => a.name).join(", ") || "—"}</td>
                <td className="px-3 py-2 font-mono text-[12px] text-[var(--ink4)]">
                  {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-[var(--ink5)]">QBT-{t.seq}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

function exportCsv(tasks: ViewTask[]) {
  const header = ["ID", "Name", "Status", "Priority", "Assignees", "Due"];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = tasks.map((t) =>
    [
      `QBT-${t.seq}`,
      t.name,
      t.status?.name ?? "",
      t.priority ?? "",
      t.assignees.map((a) => a.name).join("; "),
      t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : "",
    ]
      .map((c) => esc(String(c)))
      .join(","),
  );
  const csv = [header.map(esc).join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tasks.csv";
  a.click();
  URL.revokeObjectURL(url);
}
