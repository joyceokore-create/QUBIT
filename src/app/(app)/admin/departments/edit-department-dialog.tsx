"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { buildIndentedDepartmentOptions } from "@/lib/department-tree";
import type { DepartmentSummary } from "@/server/departments";
import type { AdminUserSummary } from "@/server/users";

interface EditDepartmentDialogProps {
  department: DepartmentSummary;
  departments: DepartmentSummary[];
  orgUnits: { id: string; name: string }[];
  users: AdminUserSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditDepartmentDialog({
  department,
  departments,
  orgUnits,
  users,
  open,
  onOpenChange,
}: EditDepartmentDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(department.name);
  const [parentId, setParentId] = useState(department.parentId ?? "none");
  const [orgUnitId, setOrgUnitId] = useState(department.orgUnitId ?? "none");
  const [headUserId, setHeadUserId] = useState(department.headUserId ?? "none");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setName(department.name);
      setParentId(department.parentId ?? "none");
      setOrgUnitId(department.orgUnitId ?? "none");
      setHeadUserId(department.headUserId ?? "none");
      setError(null);
    }
  }, [open, department]);

  const parentOptions = buildIndentedDepartmentOptions(departments, department.id);

  async function handleSave() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/departments/${department.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        parentId: parentId === "none" ? null : parentId,
        orgUnitId: orgUnitId === "none" ? null : orgUnitId,
        headUserId: headUserId === "none" ? null : headUserId,
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not update department.");
      return;
    }

    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit department</DialogTitle>
          <DialogDescription>Changes take effect immediately and are audited.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-department-name" className="text-sm font-medium text-ink-2">
              Name
            </label>
            <Input id="edit-department-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-2">Parent department</span>
            <Select value={parentId} onValueChange={(v) => setParentId(v ?? "none")}>
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
            <Select value={orgUnitId} onValueChange={(v) => setOrgUnitId(v ?? "none")}>
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
            <Select value={headUserId} onValueChange={(v) => setHeadUserId(v ?? "none")}>
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
        </div>

        {error && (
          <p role="alert" className="text-sm text-status-red">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
