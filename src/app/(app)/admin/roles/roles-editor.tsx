"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Checkbox } from "@/components/ui/checkbox";
import { Banner, Foot, Panel } from "@/components/ui/panel";
import { Chip } from "@/components/ui/status-pill";
import { Choice, Drawer, DrawerFooter, DrawerFrame, DrawerHeader, DrawerSection, DrawerText, Field, FIELD_INPUT, Kv } from "@/components/ui/drawer";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { DeactivateRoleFormSchema, NewRoleFormSchema, RenameRoleFormSchema } from "@/lib/role-schema";
import { groupPermissions } from "@/lib/permission-groups";
import { primaryRoleLabel } from "@/lib/rbac";
import { ROLE_MATRIX_ROWS, matrixCell } from "@/lib/role-matrix";
import { CATALOGUE_PERMISSIONS } from "@/lib/catalogue";
import { FOCUS, PRIMARY, QUIET, SECONDARY, THEAD, TROW } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { AdminHeader } from "../admin-header";

/**
 * UX fidelity Tier 3 — Roles & Permissions (design: a Permission × role matrix, "Edit Role"
 * opening a drawer). The matrix is read from each role's EFFECTIVE permission set (code default
 * + Riverbank's stored override), so it always shows what the server enforces. Editing goes
 * through the existing audited routes:
 *   PATCH /api/admin/roles/:role         replace a role's set ([] resets to the code default)
 *   POST  /api/admin/roles               create a custom role
 *   PATCH /api/admin/roles/custom/:id    rename / describe / deactivate / reactivate
 * Viewers without roles:manage (Heads) get the same matrix and a read-only drawer.
 */

// code → human action name, e.g. "dashboard:read" → "View dashboard".
const ACTION_NAME = new Map(CATALOGUE_PERMISSIONS.map((p) => [p.code, p.actionName]));
const actionLabel = (code: string) => ACTION_NAME.get(code) ?? code;

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

const roleName = (v: RoleView) => (v.custom ? v.role : primaryRoleLabel([v.role]));
const isLocked = (v: RoleView) => v.permissions.includes("*") || !v.editable;

export function RolesEditor({
  roles,
  catalogue,
  canManage,
  canManageIam,
}: {
  roles: RoleView[];
  catalogue: string[];
  canManage: boolean;
  canManageIam: boolean;
}) {
  const [openRole, setOpenRole] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  // "Edit Role" from the header opens the first role that can be edited.
  const firstEditable = roles.find((r) => !isLocked(r))?.role ?? roles[0]?.role ?? null;

  return (
    <>
      <AdminHeader
        canManageIam={canManageIam}
        title="Roles & Permissions"
        description="What each role can do. Changes apply at the person's next sign-in."
        action={
          canManage ? (
            <>
              <button type="button" className={SECONDARY} onClick={() => setNewOpen(true)}>
                New Role
              </button>
              <button type="button" className={PRIMARY} onClick={() => setOpenRole(firstEditable)}>
                Edit Role
              </button>
            </>
          ) : undefined
        }
      />

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-[12.5px]">
            <caption className="sr-only">Permissions for each role</caption>
            <thead className={THEAD}>
              <tr>
                <th scope="col">Permission</th>
                {roles.map((r) => (
                  <th key={r.role} scope="col" className="text-center!">
                    <button
                      type="button"
                      onClick={() => setOpenRole(r.role)}
                      className={cn("rounded-[4px] font-bold hover:text-[var(--ds-brand-ink)]", FOCUS)}
                      aria-label={`${canManage && !isLocked(r) ? "Edit" : "View"} ${roleName(r)}`}
                    >
                      {roleName(r)}
                    </button>
                    {(r.customised || r.custom) && (
                      <span className="block text-[10.5px] font-semibold text-[var(--ds-ink3)]">
                        {r.custom ? (r.custom.status === "Deactivated" ? "Deactivated" : "Custom") : "Customised"}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLE_MATRIX_ROWS.map((row) => (
                <tr key={row.label} className={TROW}>
                  <th scope="row" className="border-b border-dotted border-[var(--ds-line)] p-2.5 text-left text-[13px] font-semibold text-[var(--ds-ink)] [tr:last-child_&]:border-b-0">
                    {row.label}
                  </th>
                  {roles.map((r) => {
                    const cell = matrixCell(r.permissions, row);
                    return (
                      <td key={r.role} className="text-center">
                        {cell.kind === "yes" ? (
                          <>
                            <Check className="mx-auto size-4 text-[var(--ds-ok-text)]" aria-hidden />
                            <span className="sr-only">Yes</span>
                          </>
                        ) : cell.kind === "scoped" ? (
                          <Chip tone="muted">{cell.note}</Chip>
                        ) : (
                          <>
                            <span aria-hidden className="text-[var(--ds-ink4)]">—</span>
                            <span className="sr-only">No</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Foot>
          Defaults come from code; edits are stored for Riverbank and audited. Select a role to see everything it can do.
        </Foot>
      </Panel>

      <RoleDrawer
        key={openRole ?? "none"}
        roles={roles}
        initialRole={openRole}
        catalogue={catalogue}
        canManage={canManage}
        onClose={() => setOpenRole(null)}
      />
      <NewRoleDrawer open={newOpen} onClose={() => setNewOpen(false)} catalogue={catalogue} />
    </>
  );
}

/** Module-grouped checkbox picker with a per-group "All" toggle. */
function PermissionPicker({ catalogue, selected, onChange }: { catalogue: string[]; selected: Set<string>; onChange: (next: Set<string>) => void }) {
  function set(perms: string[], checked: boolean) {
    const next = new Set(selected);
    for (const p of perms) {
      if (checked) next.add(p);
      else next.delete(p);
    }
    onChange(next);
  }
  return (
    <div className="flex flex-col gap-3.5">
      {groupPermissions(catalogue).map((group) => {
        const all = group.permissions.every((p) => selected.has(p));
        return (
          <DrawerSection
            key={group.label}
            title={group.label}
            aside={
              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ds-ink3)]">
                <Checkbox checked={all} onCheckedChange={(c) => set(group.permissions, c === true)} />
                All
              </label>
            }
          >
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {group.permissions.map((perm) => (
                <label key={perm} className="flex items-start gap-2 text-[13px] text-[var(--ds-ink)]">
                  <Checkbox checked={selected.has(perm)} onCheckedChange={(c) => set([perm], c === true)} className="mt-0.5" />
                  <span className="flex flex-col leading-tight">
                    <span>{actionLabel(perm)}</span>
                    <span className="font-mono text-[10.5px] text-[var(--ds-ink3)]">{perm}</span>
                  </span>
                </label>
              ))}
            </div>
          </DrawerSection>
        );
      })}
    </div>
  );
}

/** Read-only grouped list of a role's permissions. */
function PermissionList({ permissions }: { permissions: string[] }) {
  if (permissions.length === 0) return <DrawerText hint>No permissions.</DrawerText>;
  return (
    <div className="flex flex-col gap-3.5">
      {groupPermissions(permissions).map((g) => (
        <DrawerSection key={g.label} title={g.label}>
          <div className="flex flex-wrap gap-1.5">
            {g.permissions.map((p) => (
              <span key={p} title={p} className="rounded-[6px] bg-[var(--ds-surface2)] px-2 py-1 text-[12px] text-[var(--ds-ink2)]">
                {actionLabel(p)}
              </span>
            ))}
          </div>
        </DrawerSection>
      ))}
    </div>
  );
}

function RoleDrawer({
  roles,
  initialRole,
  catalogue,
  canManage,
  onClose,
}: {
  roles: RoleView[];
  initialRole: string | null;
  catalogue: string[];
  canManage: boolean;
  onClose: () => void;
}) {
  const [roleKey, setRoleKey] = useState(initialRole);
  const view = roles.find((r) => r.role === roleKey) ?? null;
  return (
    <Drawer open={initialRole !== null} onClose={onClose} wide>
      {view && (
        <RoleDrawerBody
          key={view.role}
          view={view}
          roles={roles}
          onPick={setRoleKey}
          catalogue={catalogue}
          canManage={canManage}
          onClose={onClose}
        />
      )}
    </Drawer>
  );
}

function RoleDrawerBody({
  view,
  roles,
  onPick,
  catalogue,
  canManage,
  onClose,
}: {
  view: RoleView;
  roles: RoleView[];
  onPick: (role: string) => void;
  catalogue: string[];
  canManage: boolean;
  onClose: () => void;
}) {
  const { busy, error, mutate } = useAdminMutation();
  const [selected, setSelected] = useState<Set<string>>(new Set(view.permissions));
  const [saved, setSaved] = useState(false);
  const deactivated = view.custom?.status === "Deactivated";
  const editable = canManage && !isLocked(view) && !deactivated;

  async function save(perms: string[]) {
    setSaved(false);
    await mutate(`/api/admin/roles/${encodeURIComponent(view.role)}`, "PATCH", { permissions: perms }, {
      fallback: "Could not save the role.",
      onSuccess: () => setSaved(true),
    });
  }

  const status = view.custom
    ? `${deactivated ? "Deactivated" : "Custom"} · ${view.custom.assignedCount} ${view.custom.assignedCount === 1 ? "person" : "people"}`
    : isLocked(view)
      ? "Full access, fixed"
      : view.customised
        ? "Changed for Riverbank"
        : "Default from code";

  return (
    <DrawerFrame
      header={
        <DrawerHeader
          title={editable ? "Edit Role" : "Role Permissions"}
          subtitle={editable ? "Changes apply at each person's next sign-in and are audited." : "What this role can do."}
        />
      }
      footer={
        editable ? (
          <DrawerFooter note={saved ? "Saved. Applies at next sign-in." : undefined}>
            {!view.custom && view.customised && (
              <button type="button" className={QUIET} disabled={busy} onClick={() => save([])}>
                Reset to Default
              </button>
            )}
            <button type="button" className={PRIMARY} disabled={busy} onClick={() => save([...selected])}>
              {busy ? "Saving…" : "Save Role"}
            </button>
          </DrawerFooter>
        ) : (
          <DrawerFooter>
            <button type="button" className={SECONDARY} onClick={onClose}>
              Close
            </button>
          </DrawerFooter>
        )
      }
    >
      {error && <Banner tone="bad">{error}</Banner>}
      <Choice
        label="Role"
        value={view.role}
        options={roles.map((r) => ({ value: r.role, label: roleName(r) }))}
        onChange={onPick}
      />
      <Kv
        rows={[
          ["Role", roleName(view)],
          ["Status", status],
          ["Permissions", view.permissions.includes("*") ? "All" : String(view.permissions.length)],
          ["Applies", "Next sign-in"],
        ]}
      />
      {view.custom?.description && <DrawerText>{view.custom.description}</DrawerText>}
      {isLocked(view) && !view.custom && <Banner>Super Admin always has full access. It can&apos;t be changed.</Banner>}
      {deactivated && (
        <Banner tone="warn">
          Deactivated{view.custom?.deactivationReason ? `: ${view.custom.deactivationReason}` : ""}. People keep the role, but it grants nothing.
        </Banner>
      )}

      {editable ? (
        <PermissionPicker catalogue={catalogue} selected={selected} onChange={(s) => { setSelected(s); setSaved(false); }} />
      ) : (
        !view.permissions.includes("*") && <PermissionList permissions={view.permissions} />
      )}

      {canManage && view.custom && <CustomRoleSection view={view} />}
    </DrawerFrame>
  );
}

/** Rename, describe, deactivate or reactivate a custom role (inside the role drawer). */
function CustomRoleSection({ view }: { view: RoleView }) {
  const { busy, error, mutate } = useAdminMutation();
  const custom = view.custom!;
  const deactivated = custom.status === "Deactivated";
  const [name, setName] = useState(view.role);
  const [description, setDescription] = useState(custom.description ?? "");
  const [reason, setReason] = useState("");
  // docs/08 § Errors: rename and deactivate are two small forms; each shows its problem on its field.
  const renameFe = useFieldErrors({ schema: RenameRoleFormSchema, values: { name, description }, idPrefix: "role-rename" });
  const reasonFe = useFieldErrors({ schema: DeactivateRoleFormSchema, values: { reason }, idPrefix: "role-deactivate" });

  const patch = (body: Record<string, unknown>, fe?: { setServerErrors: (f: Record<string, string>, o?: string[]) => void }) =>
    mutate(`/api/admin/roles/custom/${custom.id}`, "PATCH", body, {
      fallback: "Could not update the role.",
      onFieldErrors: fe ? (fields) => fe.setServerErrors(fields) : undefined,
    });

  return (
    <DrawerSection title="Custom Role">
      {error && <Banner tone="bad">{error}</Banner>}
      {!deactivated && (
        <>
          <Field label="Name" htmlFor={renameFe.idOf("name")} error={renameFe.errors.name} hint="Renaming updates everyone who holds this role.">
            <input {...renameFe.bind("name")} className={FIELD_INPUT} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description (Optional)" htmlFor={renameFe.idOf("description")} error={renameFe.errors.description}>
            <input {...renameFe.bind("description")} className={FIELD_INPUT} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <button
              type="button"
              className={SECONDARY}
              disabled={busy}
              onClick={() => {
                if (renameFe.validate()) void patch({ name: name.trim(), description: description.trim() || null }, renameFe);
              }}
            >
              Save Name
            </button>
          </div>
          <Field label="Reason to Deactivate" htmlFor={reasonFe.idOf("reason")} error={reasonFe.errors.reason} hint={custom.assignedCount > 0 ? `${custom.assignedCount} ${custom.assignedCount === 1 ? "person keeps" : "people keep"} the role, but it grants nothing from their next sign-in.` : "The role keeps its permissions and can be reactivated later."}>
            <input {...reasonFe.bind("reason")} className={FIELD_INPUT} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it is no longer needed" />
          </Field>
          <div className="flex justify-end">
            <button type="button" className={cn(SECONDARY, "text-[var(--ds-bad-text)]")} disabled={busy} onClick={() => { if (reasonFe.validate()) void patch({ status: "Deactivated", reason: reason.trim() }, reasonFe); }}>
              Deactivate Role
            </button>
          </div>
        </>
      )}
      {deactivated && (
        <div className="flex justify-end">
          <button type="button" className={SECONDARY} disabled={busy} onClick={() => patch({ status: "Active" })}>
            Reactivate Role
          </button>
        </div>
      )}
    </DrawerSection>
  );
}

function NewRoleDrawer({ open, onClose, catalogue }: { open: boolean; onClose: () => void; catalogue: string[] }) {
  const { busy, error, setError, mutate } = useAdminMutation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fe = useFieldErrors({ schema: NewRoleFormSchema, values: { name, description }, idPrefix: "new-role" });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fe.validate()) return;
    await mutate("/api/admin/roles", "POST", { name: name.trim(), description: description.trim() || null, permissions: [...selected] }, {
      fallback: "Could not create the role.",
      onFieldErrors: (fields) => fe.setServerErrors(fields, ["name", "description"]),
      onSuccess: () => {
        fe.reset();
        setName("");
        setDescription("");
        setSelected(new Set());
        onClose();
      },
    });
  }

  return (
    <Drawer open={open} onClose={onClose} wide>
      <DrawerFrame
        onSubmit={create}
        header={<DrawerHeader title="New Role" subtitle="A named set of permissions you can give people from Users. Applies at their next sign-in." />}
        footer={
          <DrawerFooter>
            <button type="button" className={SECONDARY} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={PRIMARY} disabled={busy}>
              {busy ? "Creating…" : "Create Role"}
            </button>
          </DrawerFooter>
        }
      >
        {error && <Banner tone="bad">{error}</Banner>}
        <Field label="Name" htmlFor={fe.idOf("name")} error={fe.errors.name}>
          <input {...fe.bind("name")} className={FIELD_INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Finance Reviewer" />
        </Field>
        <Field label="Description (Optional)" htmlFor={fe.idOf("description")} error={fe.errors.description}>
          <input {...fe.bind("description")} className={FIELD_INPUT} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <PermissionPicker catalogue={catalogue} selected={selected} onChange={setSelected} />
      </DrawerFrame>
    </Drawer>
  );
}
