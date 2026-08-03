"use client";

import { useState } from "react";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const CARD =
  "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";

export interface RoleView {
  role: string;
  permissions: string[];
  customised: boolean;
  editable: boolean;
}

export function RolesEditor({
  roles,
  catalogue,
  canManage,
}: {
  roles: RoleView[];
  catalogue: string[];
  canManage: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.06s_both]">
      {roles.map((r) => (
        <RoleCard key={r.role} view={r} catalogue={catalogue} canManage={canManage} />
      ))}
    </div>
  );
}

function RoleCard({ view, catalogue, canManage }: { view: RoleView; catalogue: string[]; canManage: boolean }) {
  const { busy: saving, error, mutate } = useAdminMutation();
  const [selected, setSelected] = useState<Set<string>>(new Set(view.permissions));
  const [saved, setSaved] = useState(false);

  const wildcard = view.permissions.includes("*");
  // PlatformSuperAdmin (locked / full "*") is always read-only; editing needs roles:manage.
  const editable = canManage && view.editable && !wildcard;

  function toggle(perm: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(perm);
      else next.delete(perm);
      return next;
    });
    setSaved(false);
  }

  async function save(perms: string[]) {
    setSaved(false);
    await mutate(
      `/api/admin/roles/${encodeURIComponent(view.role)}`,
      "PATCH",
      { permissions: perms },
      { fallback: "Could not save.", onSuccess: () => setSaved(true) },
    );
  }

  return (
    <div className={`${CARD} p-[14px_16px]`} style={{ background: "var(--cardbg)" }}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">{view.role}</span>
        {view.customised && (
          <span className="rounded-[5px] bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[1px] text-brand">
            Customised
          </span>
        )}
        {!view.editable && (
          <span className="font-mono text-[9px] uppercase tracking-[1px] text-[var(--ink5)]">Locked · full access</span>
        )}
      </div>

      {editable ? (
        <>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {catalogue.map((perm) => (
              <label key={perm} className="flex items-center gap-2 text-[11.5px] text-[var(--ink2)]">
                <Checkbox checked={selected.has(perm)} onCheckedChange={(c) => toggle(perm, c === true)} />
                <span className="font-mono tracking-[.2px]">{perm}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <Button onClick={() => save([...selected])} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <button
              type="button"
              onClick={() => save([])}
              disabled={saving}
              className="text-[11.5px] font-semibold text-[var(--ink4)] transition-colors hover:text-brand disabled:opacity-60"
            >
              Reset to default
            </button>
            {saved && <span className="font-mono text-[9.5px] tracking-[.5px] text-[var(--ok)]">Saved · applies on next sign-in</span>}
            {error && <span role="alert" className="text-[11.5px] text-[var(--bad)]">{error}</span>}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {view.permissions.map((g) => (
            <span
              key={g}
              className="rounded-[5px] bg-[var(--wash2)] px-2 py-1 font-mono text-[9.5px] tracking-[.3px] text-[var(--ink3)]"
            >
              {g}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
