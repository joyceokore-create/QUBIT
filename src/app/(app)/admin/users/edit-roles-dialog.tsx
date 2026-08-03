"use client";

import { useEffect, useState } from "react";
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
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import type { AdminUserSummary } from "@/server/users";

const ROLE_KEYS = Object.keys(ROLE_PERMISSIONS);
const SUPER_ADMIN_ROLE = "PlatformSuperAdmin";

interface EditRolesDialogProps {
  user: AdminUserSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only a Super Admin may grant the Super Admin role (mirrors the server guard, M-O1). */
  canGrantSuperAdmin?: boolean;
}

export function EditRolesDialog({ user, open, onOpenChange, canGrantSuperAdmin = false }: EditRolesDialogProps) {
  const { busy, error, setError, mutate } = useAdminMutation();
  const [roles, setRoles] = useState<string[]>(user.roles);

  useEffect(() => {
    if (open) {
      setRoles(user.roles);
      setError(null);
    }
  }, [open, user.roles, setError]);

  // Hide Super Admin from anyone who can't grant it — unless the user already holds it, in
  // which case show it locked so its presence is visible but not editable.
  const alreadySuper = user.roles.includes(SUPER_ADMIN_ROLE);
  const visibleRoles = ROLE_KEYS.filter(
    (r) => r !== SUPER_ADMIN_ROLE || canGrantSuperAdmin || alreadySuper,
  );

  function toggleRole(role: string, checked: boolean) {
    setRoles((prev) => (checked ? [...prev, role] : prev.filter((r) => r !== role)));
  }

  async function handleSave() {
    if (roles.length === 0) {
      setError("Select at least one role.");
      return;
    }
    await mutate(`/api/admin/users/${user.id}/roles`, "PATCH", { roles }, {
      fallback: "Could not update roles.",
      onSuccess: () => onOpenChange(false),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit roles — {user.name}</DialogTitle>
          <DialogDescription>Changes take effect immediately and are audited.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {visibleRoles.map((role) => {
            const locked = role === SUPER_ADMIN_ROLE && !canGrantSuperAdmin;
            return (
              <label
                key={role}
                className="flex items-center gap-2 text-sm text-foreground data-[locked=true]:opacity-60"
                data-locked={locked}
              >
                <Checkbox
                  checked={roles.includes(role)}
                  disabled={locked}
                  onCheckedChange={(checked) => toggleRole(role, checked === true)}
                />
                {role}
                {locked && <span className="text-xs text-ink-3">(Super Admin only)</span>}
              </label>
            );
          })}
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
