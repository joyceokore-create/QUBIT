"use client";

import { useState } from "react";
import { Ban, Building2, Copy, KeyRound, LayoutDashboard, Mail, MoreHorizontal, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
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
import { EditGroupsDialog } from "./edit-groups-dialog";
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
  /** Only a Super Admin may grant the Super Admin role (mirrors the server guard, M-O1). */
  canGrantSuperAdmin?: boolean;
  /** users:reset — admin-initiated password reset links (M-O3). Super Admin only. */
  canResetPassword?: boolean;
}

export function UserRowActions({ user, currentUserId, departments, users, canManage, canGrantSuperAdmin = false, canResetPassword = false }: UserRowActionsProps) {
  const { busy, mutate } = useAdminMutation();
  const [editOpen, setEditOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // M-O3: the invite/reset result. When email isn't configured the server hands back a
  // one-time link for the admin to pass on — shown here rather than silently lost.
  const [linkResult, setLinkResult] = useState<{ title: string; emailed: boolean; acceptUrl?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const isSelf = user.id === currentUserId;

  if (user.status === "DELETED") {
    return <span className="text-xs text-ink-3">—</span>;
  }

  async function toggleSuspend() {
    const action = user.status === "ACTIVE" ? "suspend" : "reactivate";
    await mutate(`/api/admin/users/${user.id}/${action}`, "POST");
  }

  async function sendLink(kind: "resend" | "reset-password") {
    const title = kind === "resend" ? "Invite resent" : "Password reset sent";
    setCopied(false);
    await mutate(`/api/admin/users/${user.id}/${kind}`, "POST", undefined, {
      fallback: kind === "resend" ? "Could not resend the invite." : "Could not start the reset.",
      onSuccess: (data) => {
        const d = (data ?? {}) as { emailed?: boolean; acceptUrl?: string };
        setLinkResult({ title, emailed: Boolean(d.emailed), acceptUrl: d.acceptUrl });
      },
    });
  }

  async function confirmDelete() {
    await mutate(`/api/admin/users/${user.id}`, "DELETE", undefined, {
      onSuccess: () => setDeleteOpen(false),
    });
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
          {canManage && (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <ShieldCheck style={{ color: "var(--accent-indigo)" }} />
              Edit roles
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setDepartmentOpen(true)}>
            <Building2 style={{ color: "var(--pbrand)" }} />
            Edit department
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setGroupsOpen(true)}>
            <LayoutDashboard style={{ color: "var(--qinfo)" }} />
            Dashboard groups
          </DropdownMenuItem>
          {canManage && user.status === "INVITED" && (
            <DropdownMenuItem disabled={busy} onSelect={() => void sendLink("resend")}>
              <Mail style={{ color: "var(--qinfo)" }} />
              Resend invite
            </DropdownMenuItem>
          )}
          {canResetPassword && user.status === "ACTIVE" && (
            <DropdownMenuItem disabled={busy} onSelect={() => void sendLink("reset-password")}>
              <KeyRound style={{ color: "var(--warn)" }} />
              Send password reset
            </DropdownMenuItem>
          )}
          {canManage && (
            <DropdownMenuItem disabled={isSelf || busy} onSelect={toggleSuspend}>
              {user.status === "ACTIVE" ? <Ban style={{ color: "var(--warn)" }} /> : <RotateCcw style={{ color: "var(--ok)" }} />}
              {user.status === "ACTIVE" ? "Suspend" : "Reactivate"}
            </DropdownMenuItem>
          )}
          {canManage && (
            <DropdownMenuItem variant="destructive" disabled={isSelf} onSelect={() => setDeleteOpen(true)}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={linkResult !== null} onOpenChange={(o) => !o && setLinkResult(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{linkResult?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {linkResult?.emailed
                ? `An email is on its way to ${user.email}. The link expires in 72 hours and works once.`
                : `Email isn't configured on this deployment — send ${user.email} this one-time link yourself. It expires in 72 hours and works once.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {linkResult?.acceptUrl && (
            <div className="flex items-center gap-2 rounded-[10px] border border-ink-4 bg-background p-3">
              <code className="flex-1 truncate font-mono text-xs text-foreground">{linkResult.acceptUrl}</code>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard?.writeText(linkResult.acceptUrl!).catch(() => {});
                  setCopied(true);
                }}
              >
                <Copy className="size-4" /> {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setLinkResult(null)}>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditRolesDialog user={user} open={editOpen} onOpenChange={setEditOpen} canGrantSuperAdmin={canGrantSuperAdmin} />
      <EditGroupsDialog user={user} open={groupsOpen} onOpenChange={setGroupsOpen} />
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
