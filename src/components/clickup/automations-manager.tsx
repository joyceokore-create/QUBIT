"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Zap } from "lucide-react";

interface StatusOpt {
  id: string;
  name: string;
}
interface Automation {
  id: string;
  name: string;
  active: boolean;
  runCount: number;
  trigger: { type: string; params?: { to?: string[] } };
  actions: { type: string; params: Record<string, string> }[];
}

const PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"];

function triggerLabel(a: Automation, statuses: StatusOpt[]): string {
  if (a.trigger.type === "task.created") return "when a task is created";
  const to = (a.trigger.params?.to ?? []).map((id) => statuses.find((s) => s.id === id)?.name ?? "?");
  return to.length ? `when status → ${to.join(", ")}` : "when status changes";
}
function actionLabel(act: Automation["actions"][number], statuses: StatusOpt[]): string {
  switch (act.type) {
    case "task.set_status":
      return `set status → ${statuses.find((s) => s.id === act.params.statusId)?.name ?? "?"}`;
    case "task.set_priority":
      return `set priority → ${act.params.priority}`;
    case "task.add_comment":
      return `comment "${act.params.text}"`;
    case "task.set_assignee":
      return "assign user";
    default:
      return act.type;
  }
}

export function AutomationsManager({
  spaceId,
  statuses,
  automations,
}: {
  spaceId: string;
  statuses: StatusOpt[];
  automations: Automation[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("task.status_changed");
  const [toStatus, setToStatus] = useState(statuses[0]?.id ?? "");
  const [actionType, setActionType] = useState("task.set_status");
  const [actionStatus, setActionStatus] = useState(statuses[statuses.length - 1]?.id ?? "");
  const [actionPriority, setActionPriority] = useState("HIGH");
  const [actionText, setActionText] = useState("");

  const create = async () => {
    if (!name.trim()) return;
    const params: Record<string, string> =
      actionType === "task.set_status"
        ? { statusId: actionStatus }
        : actionType === "task.set_priority"
          ? { priority: actionPriority }
          : { text: actionText };
    const res = await fetch(`/api/v1/locations/space/${spaceId}/automations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        trigger:
          triggerType === "task.created"
            ? { type: "task.created" }
            : { type: "task.status_changed", params: { to: [toStatus] } },
        actions: [{ type: actionType, params }],
      }),
    });
    if (res.ok) {
      setName("");
      setAdding(false);
      router.refresh();
    }
  };

  const toggle = async (a: Automation) => {
    await fetch(`/api/v1/automations/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !a.active }),
    });
    router.refresh();
  };
  const remove = async (id: string) => {
    if (!window.confirm("Delete automation?")) return;
    await fetch(`/api/v1/automations/${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-[12px] border border-[var(--w07)] bg-[var(--qcard)]">
        {automations.map((a) => (
          <div key={a.id} className="group flex items-center gap-3 border-b border-[var(--w05)] px-4 py-3">
            <span
              className="grid size-8 flex-none place-items-center rounded-[9px]"
              style={{ background: "color-mix(in oklab, var(--brand) 14%, transparent)" }}
            >
              <Zap className="size-4 text-brand" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-[var(--qink)]">{a.name}</div>
              <div className="truncate text-[12px] text-[var(--ink4)]">
                {triggerLabel(a, statuses)} → {a.actions.map((act) => actionLabel(act, statuses)).join("; ")}
              </div>
            </div>
            <span className="text-[11px] text-[var(--ink5)]">{a.runCount} runs</span>
            <button
              type="button"
              onClick={() => toggle(a)}
              className={
                a.active
                  ? "rounded-full bg-[color-mix(in_oklab,var(--ok)_16%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ok)]"
                  : "rounded-full border border-[var(--w10)] px-2.5 py-1 text-[11px] text-[var(--ink4)]"
              }
            >
              {a.active ? "Active" : "Paused"}
            </button>
            <button
              type="button"
              onClick={() => remove(a.id)}
              className="text-[var(--ink4)] opacity-0 hover:text-[var(--bad)] group-hover:opacity-100"
              aria-label="Delete"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {automations.length === 0 && (
          <p className="px-4 py-6 text-center text-[12px] text-[var(--ink5)]">No automations yet.</p>
        )}
      </div>

      {adding ? (
        <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--w08)] bg-[var(--card2)] p-4">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Automation name"
            className="rounded-[8px] border border-[var(--w10)] bg-[var(--elev)] px-3 py-2 text-[13px] text-[var(--qink)] outline-none focus:border-brand"
          />
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink3)]">
            <span className="font-semibold uppercase tracking-[.5px] text-[var(--ink4)]">When</span>
            <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className={SELECT}>
              <option value="task.status_changed">status changes to</option>
              <option value="task.created">task created</option>
            </select>
            {triggerType === "task.status_changed" && (
              <select value={toStatus} onChange={(e) => setToStatus(e.target.value)} className={SELECT}>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink3)]">
            <span className="font-semibold uppercase tracking-[.5px] text-[var(--ink4)]">Then</span>
            <select value={actionType} onChange={(e) => setActionType(e.target.value)} className={SELECT}>
              <option value="task.set_status">set status</option>
              <option value="task.set_priority">set priority</option>
              <option value="task.add_comment">add comment</option>
            </select>
            {actionType === "task.set_status" && (
              <select value={actionStatus} onChange={(e) => setActionStatus(e.target.value)} className={SELECT}>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            {actionType === "task.set_priority" && (
              <select value={actionPriority} onChange={(e) => setActionPriority(e.target.value)} className={SELECT}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
            {actionType === "task.add_comment" && (
              <input
                value={actionText}
                onChange={(e) => setActionText(e.target.value)}
                placeholder="Comment text"
                className="flex-1 rounded-[8px] border border-[var(--w10)] bg-[var(--elev)] px-2 py-1.5 text-[12px] text-[var(--qink)] outline-none"
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={create} className="rounded-[8px] bg-[var(--brand)] px-3 py-1.5 text-[12px] font-bold text-[var(--onbrand)]">
              Create
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-[12px] text-[var(--ink4)] hover:text-[var(--qink)]">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-fit items-center gap-1.5 rounded-[8px] bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] px-3 py-2 text-[12.5px] font-semibold text-brand"
        >
          <Zap className="size-3.5" /> New automation
        </button>
      )}
    </div>
  );
}

const SELECT =
  "rounded-[8px] border border-[var(--w10)] bg-[var(--elev)] px-2 py-1.5 text-[12px] text-[var(--qink)] outline-none";
