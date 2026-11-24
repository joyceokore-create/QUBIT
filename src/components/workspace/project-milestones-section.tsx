"use client";

import { useCallback, useEffect, useState } from "react";
import { MilestoneFormSchema } from "@/lib/workspace-schema";
import { readApiError } from "@/lib/form-errors";
import { FieldError } from "@/components/ui/drawer";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { Check, Flag, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";

interface Milestone {
  id: string;
  name: string;
  dueDate: string | null;
  status: string;
  overdue: boolean;
}

/** PRD Module 8 — milestones on the workspace Deadlines tab. Read-only unless canEdit. */
export function ProjectMilestonesSection({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [items, setItems] = useState<Milestone[]>([]);
  const [name, setName] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // docs/08 § Errors: the name's problem shows on the field; Add stays enabled except while sending.
  const fe = useFieldErrors({ schema: MilestoneFormSchema, values: { name }, idPrefix: "milestone" });

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/milestones`).then((r) => r.json());
    setItems(d.data ?? []);
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setError(null);
    if (adding || !fe.validate()) return;
    setAdding(true);
    const res = await fetch(`/api/projects/${projectId}/milestones`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), dueDate: due ? new Date(due).toISOString() : null }),
    }).catch(() => null);
    setAdding(false);
    if (res?.ok) {
      setName("");
      setDue("");
      fe.reset();
      void load();
      return;
    }
    const { message, fields } = readApiError(await res?.json().catch(() => null), "Could not add the milestone. Try again.");
    if (fields.name) fe.setServerErrors({ name: fields.name });
    else setError(message);
  };
  const toggle = async (m: Milestone) => {
    const ok = await fetch(`/api/milestones/${m.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: m.status === "Done" ? "Pending" : "Done" }),
    }).then((r) => r.ok);
    if (ok) void load();
  };
  const remove = async (id: string) => {
    if (await fetch(`/api/milestones/${id}`, { method: "DELETE" }).then((r) => r.ok)) void load();
  };

  const upcoming = items.filter((m) => m.status !== "Done").length;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-[13px] rv:text-heading-xs font-semibold text-foreground">
        <Flag className="size-4 text-brand" /> Milestones {items.length > 0 && <span className="text-ink-3">· {upcoming} upcoming</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        {items.map((m) => {
          const done = m.status === "Done";
          return (
            <div key={m.id} className="group flex items-center gap-2.5 rounded-[8px] bg-background px-3 py-2 text-xs">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => toggle(m)}
                  aria-label={done ? "Mark pending" : "Mark done"}
                  className="flex size-4 flex-none items-center justify-center rounded-full border"
                  style={{ borderColor: done ? "var(--ok)" : "var(--w18)", background: done ? "var(--ok)" : "transparent" }}
                >
                  {done && <Check className="size-2.5 text-[var(--onbrand)]" />}
                </button>
              ) : (
                <span className="size-2 flex-none rounded-full" style={{ background: done ? "var(--ok)" : m.overdue ? "var(--bad)" : "var(--ink4)" }} />
              )}
              <span className={`min-w-0 flex-1 truncate ${done ? "text-ink-4 line-through" : "text-ink-2"}`}>{m.name}</span>
              {m.dueDate && (
                <span className="flex-none text-[11px]" style={{ color: m.overdue ? "var(--bad)" : "var(--ink4)" }}>
                  {new Date(m.dueDate).toLocaleDateString()}
                  {m.overdue && " · overdue"}
                </span>
              )}
              {canEdit && (
                <ConfirmDialog
                  trigger={
                    <button type="button" className="flex-none text-ink-3 opacity-0 hover:text-status-red group-hover:opacity-100" aria-label="Delete milestone">
                      <Trash2 className="size-3.5" />
                    </button>
                  }
                  title="Delete milestone?"
                  description={`“${m.name}” will be removed. This can’t be undone.`}
                  onConfirm={() => remove(m.id)}
                />
              )}
            </div>
          );
        })}
        {items.length === 0 && <p className="text-xs text-ink-3">No milestones yet.</p>}
      </div>

      {canEdit && (
        <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Input {...fe.bind("name")} aria-label="Milestone name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Milestone name…" className="h-8 text-xs" onKeyDown={(e) => e.key === "Enter" && add()} />
            {fe.errors.name && <FieldError id={`${fe.idOf("name")}-error`}>{fe.errors.name}</FieldError>}
          </div>
          <Input
            type="date"
            aria-label="Due date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="h-8 w-auto text-xs"
          />
          <button type="button" onClick={add} disabled={adding} className="flex items-center gap-1 rounded-[8px] bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] px-3 py-1.5 text-xs font-semibold text-brand disabled:opacity-60">
            <Plus className="size-3.5" /> Add
          </button>
        </div>
        {error && <p role="alert" className="text-[11.5px] text-[var(--bad)]">{error}</p>}
        </div>
      )}
    </div>
  );
}
