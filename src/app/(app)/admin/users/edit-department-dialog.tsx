"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import type { DepartmentSummary } from "@/server/departments";
import type { AdminUserSummary } from "@/server/users";

interface EditDepartmentDialogProps {
  user: AdminUserSummary;
  departments: DepartmentSummary[];
  users: AdminUserSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditDepartmentDialog({ user, departments, users, open, onOpenChange }: EditDepartmentDialogProps) {
  const { busy, error, setError, mutate } = useAdminMutation();
  const [departmentId, setDepartmentId] = useState(user.departmentId ?? "none");
  const [managerId, setManagerId] = useState(user.managerId ?? "none");

  useEffect(() => {
    if (open) {
      setDepartmentId(user.departmentId ?? "none");
      setManagerId(user.managerId ?? "none");
      setError(null);
    }
  }, [open, user, setError]);

  const managerOptions = users.filter((u) => u.id !== user.id);

  async function handleSave() {
    await mutate(
      `/api/admin/users/${user.id}/department`,
      "PATCH",
      {
        departmentId: departmentId === "none" ? null : departmentId,
        managerId: managerId === "none" ? null : managerId,
      },
      { fallback: "Could not update department.", onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit department — {user.name}</DialogTitle>
          <DialogDescription>Changes take effect immediately and are audited.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-2">Department</span>
            <Select
              value={departmentId}
              onValueChange={(v) => setDepartmentId(v ?? "none")}
              items={{ none: "None", ...Object.fromEntries(departments.map((d) => [d.id, d.name])) }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-2">Manager</span>
            <Select
              value={managerId}
              onValueChange={(v) => setManagerId(v ?? "none")}
              items={{ none: "None", ...Object.fromEntries(managerOptions.map((u) => [u.id, u.name])) }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {managerOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-status-red">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
