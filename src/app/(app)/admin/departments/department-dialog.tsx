"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogTrigger } from "@/components/ui/dialog";
import { AdminFormDialog } from "@/components/admin/admin-form-dialog";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { buildIndentedDepartmentOptions } from "@/lib/department-tree";
import type { DepartmentSummary } from "@/server/departments";
import type { AdminUserSummary } from "@/server/users";

/**
 * One dialog for both create and edit (docs/21 M-O2b). The previous
 * `new-department-dialog` and `edit-department-dialog` were ~95% identical — the same four
 * fields, differing only in initial state and POST-vs-PATCH. Mode is now a prop, so the
 * field markup exists once and the two paths cannot drift.
 *
 * `mode: "create"` renders its own trigger button and self-manages `open`;
 * `mode: "edit"` is controlled by the row actions menu.
 */

type Mode = "create" | "edit";

interface Props {
  mode: Mode;
  /** Required when mode === "edit" — the row being changed. */
  department?: DepartmentSummary;
  departments: DepartmentSummary[];
  orgUnits: { id: string; name: string }[];
  users: AdminUserSummary[];
  /** Controlled open state (edit mode). Create mode manages its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DepartmentDialog({
  mode,
  department,
  departments,
  orgUnits,
  users,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: Props) {
  const { busy, error, setError, mutate } = useAdminMutation();
  const [selfOpen, setSelfOpen] = useState(false);
  const open = controlledOpen ?? selfOpen;
  const setOpen = controlledOnOpenChange ?? setSelfOpen;

  const [name, setName] = useState(department?.name ?? "");
  const [parentId, setParentId] = useState(department?.parentId ?? "none");
  const [orgUnitId, setOrgUnitId] = useState(department?.orgUnitId ?? "none");
  const [headUserId, setHeadUserId] = useState(department?.headUserId ?? "none");

  // Reset to the source of truth whenever the dialog opens: the row's values when editing,
  // empty when creating (so a second "New" doesn't inherit the last attempt).
  useEffect(() => {
    if (!open) return;
    setName(department?.name ?? "");
    setParentId(department?.parentId ?? "none");
    setOrgUnitId(department?.orgUnitId ?? "none");
    setHeadUserId(department?.headUserId ?? "none");
    setError(null);
  }, [open, department, setError]);

  // Editing excludes the department itself from the parent options (no self-parenting).
  const parentOptions = buildIndentedDepartmentOptions(departments, department?.id);

  async function submit() {
    if (!name.trim()) {
      setError("Enter a department name.");
      return;
    }
    await mutate(
      mode === "edit" ? `/api/admin/departments/${department!.id}` : "/api/admin/departments",
      mode === "edit" ? "PATCH" : "POST",
      {
        name: name.trim(),
        parentId: parentId === "none" ? null : parentId,
        orgUnitId: orgUnitId === "none" ? null : orgUnitId,
        headUserId: headUserId === "none" ? null : headUserId,
      },
      {
        fallback: mode === "edit" ? "Could not update department." : "Could not create department.",
        onSuccess: () => setOpen(false),
      },
    );
  }

  const fieldId = `${mode}-department-name`;

  return (
    <AdminFormDialog
      open={open}
      onOpenChange={setOpen}
      title={mode === "edit" ? "Edit department" : "New department"}
      description={
        mode === "edit"
          ? "Changes take effect immediately and are audited."
          : "Departments group people for reporting and approvals."
      }
      error={error}
      busy={busy}
      submitLabel={mode === "edit" ? "Save" : "Create"}
      busyLabel={mode === "edit" ? "Saving…" : "Creating…"}
      onSubmit={submit}
      trigger={
        mode === "create" ? (
          <DialogTrigger render={<Button className="rounded-full" />}>
            <Plus /> New department
          </DialogTrigger>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-sm font-medium text-ink-2">
          Name
        </label>
        <Input id={fieldId} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-2">Parent department</span>
        <Select
          value={parentId}
          onValueChange={(v) => setParentId(v ?? "none")}
          items={{ none: "None — top level", ...Object.fromEntries(parentOptions.map((o) => [o.id, o.label])) }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None — top level</SelectItem>
            {parentOptions.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-2">Org unit</span>
        <Select
          value={orgUnitId}
          onValueChange={(v) => setOrgUnitId(v ?? "none")}
          items={{ none: "None", ...Object.fromEntries(orgUnits.map((o) => [o.id, o.name])) }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {orgUnits.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-2">Head of department</span>
        <Select
          value={headUserId}
          onValueChange={(v) => setHeadUserId(v ?? "none")}
          items={{ none: "None", ...Object.fromEntries(users.map((u) => [u.id, u.name])) }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </AdminFormDialog>
  );
}
