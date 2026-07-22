"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { EditDepartmentDialog } from "./edit-department-dialog";
import type { DepartmentSummary } from "@/server/departments";
import type { AdminUserSummary } from "@/server/users";

interface DepartmentRowActionsProps {
  department: DepartmentSummary;
  departments: DepartmentSummary[];
  orgUnits: { id: string; name: string }[];
  users: AdminUserSummary[];
}

export function DepartmentRowActions({ department, departments, orgUnits, users }: DepartmentRowActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    setBusy(true);
    setDeleteError(null);
    const res = await fetch(`/api/admin/departments/${department.id}`, { method: "DELETE" });
    setBusy(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setDeleteError(body?.error?.message ?? "Could not delete department.");
      return;
    }

    setDeleteOpen(false);
    router.refresh();
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
              setDeleteError(null);
              setDeleteOpen(true);
            }}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditDepartmentDialog
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
