"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { effectiveGroups, landingPersona, USER_GROUPS, type UserGroup } from "@/lib/personas";
import { GroupPicker } from "./group-picker";
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
  // DM1.43: one declared group. Users saved under the old multi-select rule collapse to
  // their primary (or first declared) on next edit — nothing breaks meanwhile.
  const [declared, setDeclared] = useState<UserGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const valid = user.userGroups.filter((g): g is UserGroup => (USER_GROUPS as readonly string[]).includes(g));
      const primary = user.primaryGroup as UserGroup | null;
      setDeclared(primary && valid.includes(primary) ? primary : (valid[0] ?? null));
      setError(null);
    }
  }, [open, user.userGroups, user.primaryGroup]);

  const derived = user.derivedGroups.filter((g): g is UserGroup => (USER_GROUPS as readonly string[]).includes(g));
  const landing = landingPersona(effectiveGroups(declared ? [declared] : [], derived), declared, null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/users/${user.id}/groups`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userGroups: declared ? [declared] : [], primaryGroup: declared }),
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
            <GroupPicker value={declared} onChange={setDeclared} />
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
