"use client";

import { useState } from "react";
import { MoreHorizontal, SquarePen, Trash2 } from "lucide-react";
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
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { DepartmentDialog } from "./department-dialog";
import type { DepartmentSummary } from "@/server/departments";
import type { AdminUserSummary } from "@/server/users";

interface DepartmentRowActionsProps {
  department: DepartmentSummary;
  departments: DepartmentSummary[];
  orgUnits: { id: string; name: string }[];
  users: AdminUserSummary[];
}

export function DepartmentRowActions({ department, departments, orgUnits, users }: DepartmentRowActionsProps) {
  // The delete guard's message (children / assigned members) comes from the server and is
  // surfaced through the hook's error — keep it visible, it's the useful half of the flow.
  const { busy, error: deleteError, setError, mutate } = useAdminMutation();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function confirmDelete() {
    await mutate(`/api/admin/departments/${department.id}`, "DELETE", undefined, {
      fallback: "Could not delete department.",
      onSuccess: () => setDeleteOpen(false),
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Department actions" />}
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <SquarePen style={{ color: "var(--blue)" }} />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              setError(null);
              setDeleteOpen(true);
            }}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DepartmentDialog
        mode="edit"
        department={department}
        departments={departments}
        orgUnits={orgUnits}
        users={users}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {department.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone. Child departments and members must be reassigned
              first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-status-red">
              {deleteError}
            </p>
          )}
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
