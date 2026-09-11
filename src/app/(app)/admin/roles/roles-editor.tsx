"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { groupPermissions } from "@/lib/permission-groups";
import { primaryRoleLabel } from "@/lib/rbac";
import { CATALOGUE_PERMISSIONS } from "@/lib/catalogue";

// code → human action name, e.g. "dashboard:read" → "View dashboard".
const ACTION_NAME = new Map(CATALOGUE_PERMISSIONS.map((p) => [p.code, p.actionName]));
const actionLabel = (code: string) => ACTION_NAME.get(code) ?? code;

const CARD =
  "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";

export interface RoleView {
  role: string;
  permissions: string[];
  customised: boolean;
  editable: boolean;
  custom?: {
    id: string;
    status: string;
    description: string | null;
    deactivationReason: string | null;
    assignedCount: number;
  };
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
  const canonical = roles.filter((r) => !r.custom);
  const custom = roles.filter((r) => r.custom);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4 [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.06s_both]">
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {canonical.map((r) => (
          <RoleCard key={r.role} view={r} catalogue={catalogue} canManage={canManage} />
        ))}
      </div>

      <div className="mt-1.5 flex items-center justify-between">
        <div className="flex items-baseline gap-2.5">
          <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">Custom roles</span>
          <span className="text-[11px] text-[var(--ink4)]">
            Named permission bundles for this organisation — deactivate rather than delete.
          </span>
        </div>
        {canManage && <Button onClick={() => setNewOpen(true)}>New role</Button>}
      </div>

      {custom.length === 0 ? (
        <p className="rounded-[12px] border border-dashed border-[var(--hair)] px-4 py-3 text-[12px] text-[var(--ink4)]">
          No custom roles yet{canManage ? " — create one to grant a tailored permission set." : "."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {custom.map((r) => (
            <RoleCard key={r.role} view={r} catalogue={catalogue} canManage={canManage} />
          ))}
        </div>
      )}

      <NewRoleDialog open={newOpen} onOpenChange={setNewOpen} catalogue={catalogue} />
    </div>
  );
}

/** Module-grouped checkbox picker with a per-group "all" toggle (tuma's permissions modal). */
function PermissionPicker({
  catalogue,
  selected,
  onToggle,
  onToggleGroup,
}: {
  catalogue: string[];
  selected: Set<string>;
  onToggle: (perm: string, checked: boolean) => void;
  onToggleGroup: (perms: string[], checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {groupPermissions(catalogue).map((group) => {
        const allChecked = group.permissions.every((p) => selected.has(p));
        return (
          <div key={group.label}>
            <label className="mb-1 flex items-center gap-2">
              <Checkbox checked={allChecked} onCheckedChange={(c) => onToggleGroup(group.permissions, c === true)} />
              <span className="font-heading text-[11px] font-bold uppercase tracking-[1px] text-[var(--ink3)]">
                {group.label}
              </span>
            </label>
            <div className="grid grid-cols-1 gap-1 pl-6 sm:grid-cols-2">
              {group.permissions.map((perm) => (
                <label key={perm} className="flex items-start gap-2 text-[11.5px] text-[var(--ink2)]">
                  <Checkbox checked={selected.has(perm)} onCheckedChange={(c) => onToggle(perm, c === true)} className="mt-0.5" />
                  <span className="flex flex-col leading-tight">
                    <span className="text-[12.5px] text-[var(--ink2)]">{actionLabel(perm)}</span>
                    <span className="font-mono text-[9.5px] tracking-[.2px] text-[var(--ink4)]">{perm}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RoleCard({ view, catalogue, canManage }: { view: RoleView; catalogue: string[]; canManage: boolean }) {
  const { busy: saving, error, mutate } = useAdminMutation();
  const [selected, setSelected] = useState<Set<string>>(new Set(view.permissions));
  const [saved, setSaved] = useState(false);

  const wildcard = view.permissions.includes("*");
  const deactivated = view.custom?.status === "Deactivated";
  // PlatformSuperAdmin (locked / full "*") is always read-only; editing needs roles:manage.
  const editable = canManage && view.editable && !wildcard && !deactivated;

  function toggle(perm: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(perm);
      else next.delete(perm);
      return next;
    });
    setSaved(false);
  }

  function toggleGroup(perms: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (checked) next.add(p);
        else next.delete(p);
      }
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
    <div className={`${CARD} p-[14px_16px] ${deactivated ? "opacity-70" : ""}`} style={{ background: "var(--cardbg)" }}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">{primaryRoleLabel([view.role])}</span>
        {view.custom ? (
          <>
            <span className="rounded-[5px] bg-[var(--wash2)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[1px] text-[var(--ink3)]">
              Custom
            </span>
            {deactivated && (
              <span className="rounded-[5px] bg-[color-mix(in_oklab,var(--bad)_14%,transparent)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[1px] text-[var(--bad)]">
                Deactivated
              </span>
            )}
            <span className="ml-auto font-mono text-[9px] tracking-[.5px] text-[var(--ink4)]">
              {view.custom.assignedCount} user{view.custom.assignedCount === 1 ? "" : "s"}
            </span>
          </>
        ) : (
          <>
            {view.customised && (
              <span className="rounded-[5px] bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[1px] text-brand">
                Customised
              </span>
            )}
            {!view.editable && (
              <span className="font-mono text-[9px] uppercase tracking-[1px] text-[var(--ink5)]">Locked · full access</span>
            )}
          </>
        )}
      </div>

      {view.custom?.description && <p className="mb-2 text-[11.5px] text-[var(--ink3)]">{view.custom.description}</p>}
      {deactivated && view.custom?.deactivationReason && (
        <p className="mb-2 text-[11px] italic text-[var(--ink4)]">
          Deactivated: {view.custom.deactivationReason} — holders keep the role but it grants nothing.
        </p>
      )}

      {editable ? (
        <>
          <PermissionPicker catalogue={catalogue} selected={selected} onToggle={toggle} onToggleGroup={toggleGroup} />
          <div className="mt-3 flex items-center gap-2.5">
            <Button onClick={() => save([...selected])} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            {!view.custom && (
              <button
                type="button"
                onClick={() => save([])}
                disabled={saving}
                className="text-[11.5px] font-semibold text-[var(--ink4)] transition-colors hover:text-brand disabled:opacity-60"
              >
                Reset to default
              </button>
            )}
            {saved && <span className="font-mono text-[9.5px] tracking-[.5px] text-[var(--ok)]">Saved · applies on next sign-in</span>}
            {error && <span role="alert" className="text-[11.5px] text-[var(--bad)]">{error}</span>}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {view.permissions.length === 0 ? (
            <span className="text-[11px] text-[var(--ink4)]">No permissions{deactivated ? " while deactivated" : ""}.</span>
          ) : (
            view.permissions.map((g) => (
              <span
                key={g}
                title={g}
                className="rounded-[5px] bg-[var(--wash2)] px-2 py-1 text-[10.5px] tracking-[.2px] text-[var(--ink3)]"
              >
                {actionLabel(g)}
              </span>
            ))
          )}
        </div>
      )}

      {canManage && view.custom && <CustomRoleActions view={view} />}
    </div>
  );
}

function CustomRoleActions({ view }: { view: RoleView }) {
  const router = useRouter();
  const { busy, error, setError, mutate } = useAdminMutation();
  const custom = view.custom!;
  const deactivated = custom.status === "Deactivated";
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(view.role);
  const [description, setDescription] = useState(custom.description ?? "");
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function patch(body: Record<string, unknown>, close: () => void) {
    await mutate(`/api/admin/roles/custom/${custom.id}`, "PATCH", body, {
      fallback: "Could not update the role.",
      onSuccess: () => {
        close();
        router.refresh();
      },
    });
  }

  return (
    <div className="mt-3 flex items-center gap-3 border-t border-[var(--hair)] pt-2.5">
      {!deactivated && (
        <button
          type="button"
          onClick={() => { setError(null); setEditOpen(true); }}
          className="text-[11.5px] font-semibold text-[var(--ink4)] transition-colors hover:text-brand"
        >
          Rename / describe
        </button>
      )}
      {deactivated ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => patch({ status: "Active" }, () => {})}
          className="text-[11.5px] font-semibold text-[var(--ink4)] transition-colors hover:text-brand disabled:opacity-60"
        >
          Reactivate
        </button>
      ) : (
        <button
          type="button"
          onClick={() => { setError(null); setReason(""); setDeactivateOpen(true); }}
          className="text-[11.5px] font-semibold text-[var(--bad)] transition-colors hover:opacity-80"
        >
          Deactivate
        </button>
      )}
      {error && <span role="alert" className="text-[11px] text-[var(--bad)]">{error}</span>}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit role — {view.role}</DialogTitle>
            <DialogDescription>Renaming updates every user currently holding this role.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2.5">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Role name" maxLength={64} />
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" maxLength={500} />
          </div>
          {error && <p role="alert" className="text-sm text-status-red">{error}</p>}
          <DialogFooter>
            <Button
              disabled={busy || name.trim().length < 2}
              onClick={() => patch({ name: name.trim(), description: description.trim() || null }, () => setEditOpen(false))}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate — {view.role}</DialogTitle>
            <DialogDescription>
              {custom.assignedCount > 0
                ? `${custom.assignedCount} user${custom.assignedCount === 1 ? " still holds" : "s still hold"} this role — they keep it, but it grants nothing from their next sign-in.`
                : "The role keeps its saved permissions and can be reactivated later."}
            </DialogDescription>
          </DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" maxLength={500} />
          {error && <p role="alert" className="text-sm text-status-red">{error}</p>}
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={busy || !reason.trim()}
              onClick={() => patch({ status: "Deactivated", reason: reason.trim() }, () => setDeactivateOpen(false))}
            >
              {busy ? "Deactivating…" : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewRoleDialog({
  open,
  onOpenChange,
  catalogue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogue: string[];
}) {
  const router = useRouter();
  const { busy, error, setError, mutate } = useAdminMutation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(perm: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(perm);
      else next.delete(perm);
      return next;
    });
  }

  function toggleGroup(perms: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (checked) next.add(p);
        else next.delete(p);
      }
      return next;
    });
  }

  async function handleCreate() {
    setError(null);
    await mutate(
      "/api/admin/roles",
      "POST",
      { name: name.trim(), description: description.trim() || null, permissions: [...selected] },
      {
        fallback: "Could not create the role.",
        onSuccess: () => {
          onOpenChange(false);
          setName("");
          setDescription("");
          setSelected(new Set());
          router.refresh();
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>New custom role</DialogTitle>
          <DialogDescription>
            A named permission bundle you can assign from Admin → Users. Applies on each holder&apos;s next sign-in.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Role name (e.g. Finance Reviewer)" maxLength={64} />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" maxLength={500} />
          <PermissionPicker catalogue={catalogue} selected={selected} onToggle={toggle} onToggleGroup={toggleGroup} />
        </div>
        {error && <p role="alert" className="text-sm text-status-red">{error}</p>}
        <DialogFooter>
          <Button disabled={busy || name.trim().length < 2} onClick={handleCreate}>
            {busy ? "Creating…" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
