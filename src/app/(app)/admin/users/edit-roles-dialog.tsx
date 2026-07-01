"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROLE_PERMISSIONS } from "@/lib/rbac";
import type { AdminUserSummary } from "@/server/users";

const ROLE_KEYS = Object.keys(ROLE_PERMISSIONS);

interface EditRolesDialogProps {
  user: AdminUserSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditRolesDialog({ user, open, onOpenChange }: EditRolesDialogProps) {
  const router = useRouter();
  const [roles, setRoles] = useState<string[]>(user.roles);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setRoles(user.roles);
      setError(null);
    }
  }, [open, user.roles]);

  function toggleRole(role: string, checked: boolean) {
    setRoles((prev) => (checked ? [...prev, role] : prev.filter((r) => r !== role)));
  }

  async function handleSave() {
    if (roles.length === 0) {
      setError("Select at least one role.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/users/${user.id}/roles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles }),
    });
    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not update roles.");
      return;
    }

    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit roles — {user.name}</DialogTitle>
          <DialogDescription>Changes take effect immediately and are audited.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {ROLE_KEYS.map((role) => (
            <label key={role} className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={roles.includes(role)}
                onCheckedChange={(checked) => toggleRole(role, checked === true)}
              />
              {role}
            </label>
          ))}
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
