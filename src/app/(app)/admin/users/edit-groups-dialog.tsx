"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { effectiveGroups, landingPersona, USER_GROUPS, type UserGroup } from "@/lib/personas";
import type { AdminUserSummary } from "@/server/users";

// Edit DECLARED dashboard groups (docs/17 §1.3). Derived groups (from live memberships)
// are shown read-only and distinct — they merge in at login and can't be edited here.
// Presentation only: nothing in this dialog changes what the user may DO.

const LABELS: Record<UserGroup, string> = {
  executive: "Executive",
  pm: "PM",
  developer: "Developer",
  qa: "QA",
  implementor: "Implementor",
};

export function EditGroupsDialog({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUserSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [primary, setPrimary] = useState<UserGroup | "auto">("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setGroups(user.userGroups.filter((g): g is UserGroup => (USER_GROUPS as readonly string[]).includes(g)));
      setPrimary((user.primaryGroup as UserGroup | null) ?? "auto");
      setError(null);
    }
  }, [open, user.userGroups, user.primaryGroup]);

  const derived = user.derivedGroups.filter((g): g is UserGroup => (USER_GROUPS as readonly string[]).includes(g));
  const landing = landingPersona(effectiveGroups(groups, derived), primary === "auto" ? null : primary, null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/users/${user.id}/groups`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userGroups: groups, primaryGroup: primary === "auto" ? null : primary }),
    });
    setBusy(false);
    if (res.ok) {
      onOpenChange(false);
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not save groups.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Dashboard groups — {user.name}</DialogTitle>
          <DialogDescription>Groups pick the dashboard they land on. They never change permissions.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1.5 text-[11.5px] font-semibold text-ink-2">Declared</p>
            <div className="flex flex-wrap gap-1.5">
              {USER_GROUPS.map((g) => {
                const active = groups.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setGroups((prev) => (active ? prev.filter((x) => x !== g) : [...prev, g]));
                      if (active && primary === g) setPrimary("auto");
                    }}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
                    style={{
                      borderColor: active ? "var(--brand)" : "var(--w10)",
                      background: active ? "color-mix(in oklab, var(--brand) 10%, transparent)" : "transparent",
                      color: active ? "var(--brand)" : "var(--ink3)",
                    }}
                  >
                    {LABELS[g]}
                  </button>
                );
              })}
            </div>
          </div>

          {derived.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11.5px] font-semibold text-ink-2">Derived from memberships</p>
              <div className="flex flex-wrap gap-1.5">
                {derived.map((g) => (
                  <span key={g} className="rounded-full border border-dashed border-[var(--w10)] px-2.5 py-1 text-[11px] text-ink-3" title="Merged at login from project roles / tenant role — edit memberships to change">
                    {LABELS[g]}
                  </span>
                ))}
              </div>
            </div>
          )}

          {groups.length > 1 && (
            <Select value={primary} onValueChange={(v) => setPrimary((v as UserGroup | "auto") ?? "auto")}>
              <SelectTrigger><SelectValue placeholder="Primary group" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Primary: automatic</SelectItem>
                {groups.map((g) => <SelectItem key={g} value={g}>Primary: {LABELS[g]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
            Will land on:
            <span className="rounded-full bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] px-2 py-0.5 font-semibold text-[var(--brand)]">
              {LABELS[landing]} dashboard
            </span>
            <span className="text-ink-4">(next sign-in)</span>
          </p>

          {error && <p role="alert" className="text-sm text-status-red">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save groups"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
