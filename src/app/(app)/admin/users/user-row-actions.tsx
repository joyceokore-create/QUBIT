"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditRolesDialog } from "./edit-roles-dialog";
import { EditDepartmentDialog } from "./edit-department-dialog";
import type { AdminUserSummary } from "@/server/users";
import type { DepartmentSummary } from "@/server/departments";

interface UserRowActionsProps {
  user: AdminUserSummary;
  currentUserId: string;
  departments: DepartmentSummary[];
  users: AdminUserSummary[];
  /** Full CRUD (roles/suspend/delete) — PlatformSuperAdmin. Heads only get department membership. */
  canManage: boolean;
}

export function UserRowActions({ user, currentUserId, departments, users, canManage }: UserRowActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isSelf = user.id === currentUserId;

  if (user.status === "DELETED") {
    return <span className="text-xs text-ink-3">—</span>;
  }

  async function toggleSuspend() {
    setBusy(true);
    const action = user.status === "ACTIVE" ? "suspend" : "reactivate";
    await fetch(`/api/admin/users/${user.id}/${action}`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  async function confirmDelete() {
    setBusy(true);
    await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    setBusy(false);
    setDeleteOpen(false);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="User actions" />}
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canManage && <DropdownMenuItem onSelect={() => setEditOpen(true)}>Edit roles</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => setDepartmentOpen(true)}>Edit department</DropdownMenuItem>
          {canManage && (
            <DropdownMenuItem disabled={isSelf || busy} onSelect={toggleSuspend}>
              {user.status === "ACTIVE" ? "Suspend" : "Reactivate"}
            </DropdownMenuItem>
          )}
          {canManage && (
            <DropdownMenuItem variant="destructive" disabled={isSelf} onSelect={() => setDeleteOpen(true)}>
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditRolesDialog user={user} open={editOpen} onOpenChange={setEditOpen} />
      <EditDepartmentDialog
        user={user}
        departments={departments}
        users={users}
        open={departmentOpen}
        onOpenChange={setDepartmentOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {user.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This scrubs their name, email and password, revokes every role, and blocks
              sign-in. Historical records (audit log, risk/issue ownership) are preserved.
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
