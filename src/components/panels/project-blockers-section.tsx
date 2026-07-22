"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Blocker {
  id: string;
  description: string;
  severity: string;
  status: string;
  ownerName: string | null;
}

const SEVERITIES = ["Low", "Medium", "Critical"] as const;
const SEV_TOKEN: Record<string, string> = { Low: "--ink4", Medium: "--warn", Critical: "--bad" };

/** PRD Module 10 — Blocker Register on a project. Read-only unless canEdit. */
export function ProjectBlockersSection({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [desc, setDesc] = useState("");
  const [severity, setSeverity] = useState<string>("Medium");

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/blockers`).then((r) => r.json());
    setBlockers(d.data ?? []);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!desc.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/blockers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: desc.trim(), severity }),
    });
    if (res.ok) {
      setDesc("");
      setSeverity("Medium");
      void load();
    }
  };
  const resolve = async (id: string) => {
    if (await fetch(`/api/blockers/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "Resolved" }) }).then((r) => r.ok)) void load();
  };
  const remove = async (id: string) => {
    if (await fetch(`/api/blockers/${id}`, { method: "DELETE" }).then((r) => r.ok)) void load();
  };

  const open = blockers.filter((b) => b.status === "Open");

  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-[13px] font-semibold text-foreground">
        Blockers {open.length > 0 && <span className="text-[var(--bad)]">· {open.length} open</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        {blockers.map((b) => {
          const resolved = b.status === "Resolved";
          return (
            <div key={b.id} className="group flex items-center gap-2 rounded-[6px] bg-background px-3 py-2 text-xs">
              <span
                className="rounded-full px-2 py-0.5 text-[9.5px] font-bold"
                style={{ color: `var(${SEV_TOKEN[b.severity] ?? "--ink4"})`, background: `color-mix(in oklab, var(${SEV_TOKEN[b.severity] ?? "--ink4"}) 14%, transparent)` }}
              >
                {b.severity}
              </span>
              <span className={`min-w-0 flex-1 truncate ${resolved ? "text-ink-4 line-through" : "text-ink-2"}`}>
                {b.description}
                {b.ownerName && <span className="text-ink-4"> · {b.ownerName}</span>}
              </span>
              {resolved ? (
                <span className="text-[10px] font-semibold text-[var(--ok)]">Resolved</span>
              ) : (
                canEdit && (
                  <button type="button" onClick={() => resolve(b.id)} className="flex items-center gap-1 text-[10.5px] font-semibold text-ink-3 hover:text-[var(--ok)]" title="Mark resolved">
                    <Check className="size-3.5" /> Resolve
                  </button>
                )
              )}
              {canEdit && (
                <ConfirmDialog
                  trigger={
                    <button type="button" className="text-ink-3 opacity-0 hover:text-status-red group-hover:opacity-100" aria-label="Remove blocker">
                      <Trash2 className="size-3.5" />
                    </button>
                  }
                  title="Remove blocker?"
                  description="This blocker will be removed from the project."
                  confirmLabel="Remove"
                  onConfirm={() => remove(b.id)}
                />
              )}
            </div>
          );
        })}
        {blockers.length === 0 && <p className="text-xs text-ink-3">No blockers.</p>}
      </div>

      {canEdit && (
        <div className="flex items-center gap-2">
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Raise a blocker…" className="h-8 flex-1 text-xs" onKeyDown={(e) => e.key === "Enter" && add()} />
          <Select value={severity} onValueChange={(v) => v && setSeverity(v)}>
            <SelectTrigger className="h-8 w-[110px] text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <button type="button" onClick={add} className="flex items-center gap-1 rounded-[8px] bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] px-3 py-1.5 text-xs font-semibold text-brand">
            <Plus className="size-3.5" /> Add
          </button>
        </div>
      )}
    </div>
  );
}
