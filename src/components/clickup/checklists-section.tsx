"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

interface Item {
  id: string;
  name: string;
  done: boolean;
  assigneeId: string | null;
}
interface Checklist {
  id: string;
  name: string;
  items: Item[];
}

async function jsonFetch(url: string, method: string, body?: unknown) {
  return fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Checklists on a task: named lists with items, per-checklist progress bar. */
export function ChecklistsSection({ taskId }: { taskId: string }) {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/tasks/${taskId}/checklists`);
    if (res.ok) setChecklists((await res.json()).data ?? []);
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addChecklist = async () => {
    const name = newName.trim();
    if (!name) return;
    const res = await jsonFetch(`/api/v1/tasks/${taskId}/checklists`, "POST", { name });
    if (res.ok) {
      setNewName("");
      void load();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] font-semibold uppercase tracking-[.5px] text-[var(--ink4)]">
        Checklists
      </div>

      {checklists.map((cl) => (
        <ChecklistCard key={cl.id} checklist={cl} onChange={load} />
      ))}

      <div className="flex items-center gap-2 px-1">
        <Plus className="size-3.5 flex-none text-[var(--ink4)]" />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addChecklist()}
          placeholder="Add checklist…"
          className="flex-1 bg-transparent text-[13px] text-[var(--qink)] outline-none placeholder:text-[var(--ink4)]"
        />
      </div>
    </div>
  );
}

function ChecklistCard({ checklist, onChange }: { checklist: Checklist; onChange: () => void }) {
  const [itemName, setItemName] = useState("");
  const done = checklist.items.filter((i) => i.done).length;
  const total = checklist.items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const addItem = async () => {
    const name = itemName.trim();
    if (!name) return;
    const res = await jsonFetch(`/api/v1/checklists/${checklist.id}/items`, "POST", { name });
    if (res.ok) {
      setItemName("");
      onChange();
    }
  };
  const toggle = async (item: Item) => {
    const res = await jsonFetch(`/api/v1/checklist-items/${item.id}`, "PATCH", { done: !item.done });
    if (res.ok) onChange();
  };
  const removeItem = async (id: string) => {
    const res = await jsonFetch(`/api/v1/checklist-items/${id}`, "DELETE");
    if (res.ok) onChange();
  };
  const removeChecklist = async () => {
    const res = await jsonFetch(`/api/v1/checklists/${checklist.id}`, "DELETE");
    if (res.ok) onChange();
  };

  return (
    <div className="rounded-[10px] border border-[var(--w07)] bg-[var(--card2)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex-1 text-[13px] font-semibold text-[var(--qink)]">{checklist.name}</span>
        <span className="text-[11px] text-[var(--ink4)]">
          {done}/{total}
        </span>
        <button
          type="button"
          onClick={removeChecklist}
          className="flex size-5 items-center justify-center rounded text-[var(--ink4)] hover:text-[var(--bad)]"
          aria-label="Delete checklist"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-[var(--w08)]">
        <div className="h-full rounded-full bg-[var(--brand)] transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ul className="flex flex-col">
        {checklist.items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => toggle(item)}
              className="size-3.5 flex-none accent-[var(--brand)]"
            />
            <span
              className={`min-w-0 flex-1 truncate text-[13px] ${item.done ? "text-[var(--ink5)] line-through" : "text-[var(--ink2)]"}`}
            >
              {item.name}
            </span>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="flex size-5 flex-none items-center justify-center rounded text-[var(--ink4)] opacity-0 hover:text-[var(--bad)] group-hover:opacity-100"
              aria-label="Delete item"
            >
              <X className="size-3" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center gap-2">
        <Plus className="size-3.5 flex-none text-[var(--ink4)]" />
        <input
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder="Add item…"
          className="flex-1 bg-transparent text-[12.5px] text-[var(--qink)] outline-none placeholder:text-[var(--ink4)]"
        />
      </div>
    </div>
  );
}
