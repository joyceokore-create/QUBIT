"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Checkbox } from "@/components/ui/checkbox";
import { Banner } from "@/components/ui/panel";
import { Chip } from "@/components/ui/status-pill";
import { Drawer, DrawerFooter, DrawerFrame, DrawerHeader, DrawerSection, DrawerText, Field, FieldError, FIELD_INPUT, Kv } from "@/components/ui/drawer";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ROLE_PERMISSIONS } from "@/lib/rbac";
import { readApiError } from "@/lib/form-errors";
import { MfaResetFormSchema, UserRolesFormSchema } from "@/lib/user-edit-schema";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { formatDate } from "@/lib/dates";
import { COMPACT, SECONDARY } from "@/lib/surface";
import type { AdminUserSummary } from "@/server/users";
import type { DepartmentSummary } from "@/server/departments";
import { EditGroupsDialog } from "./edit-groups-dialog";

/**
 * UX fidelity Tier 2 — Users › Edit (design: "Edit or Resend opens a drawer with roles, team,
 * department, suspend and reset MFA"). One drawer replaces the row menu's three dialogs; each
 * section saves on its own through the existing audited routes:
 *   roles      PATCH /api/admin/users/:id/roles        (users:roles — Super Admin)
 *   department PATCH /api/admin/users/:id/department   (admin:access + department rules)
 *   account    POST  …/resend · …/reset-password · …/suspend · …/reactivate · DELETE …/:id
 *   MFA        POST  /api/auth/mfa/reset               (users:reset; step-up code; no self)
 */
const ROLE_KEYS = Object.keys(ROLE_PERMISSIONS);
const SUPER_ADMIN_ROLE = "PlatformSuperAdmin";

export interface UserEditDrawerProps {
  user: AdminUserSummary | null;
  onClose: () => void;
  currentUserId: string;
  timeZone: string;
  departments: DepartmentSummary[];
  managerOptions: { id: string; name: string }[];
  roleLabel: (role: string) => string;
  canManage: boolean;
  canGrantSuperAdmin: boolean;
  canResetPassword: boolean;
  customRoles: string[];
  sso: boolean;
}

export function UserEditDrawer(props: UserEditDrawerProps) {
  return (
    <Drawer open={!!props.user} onClose={props.onClose} wide>
      {props.user && <Body key={props.user.id} {...props} user={props.user} />}
    </Drawer>
  );
}

function Body({ user, onClose, currentUserId, timeZone, departments, managerOptions, roleLabel, canManage, canGrantSuperAdmin, canResetPassword, customRoles, sso }: UserEditDrawerProps & { user: AdminUserSummary }) {
  const isSelf = user.id === currentUserId;
  const router = useRouter();
  const roles = useAdminMutation();
  const dept = useAdminMutation();
  const account = useAdminMutation();
  const [picked, setPicked] = useState<string[]>(user.roles);
  const [departmentId, setDepartmentId] = useState(user.departmentId ?? "none");
  const [managerId, setManagerId] = useState(user.managerId ?? "none");
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [link, setLink] = useState<{ title: string; emailed: boolean; acceptUrl?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  // docs/08 § Errors: each section is its own small form. Roles (a checkbox group) and the MFA
  // code show their problem on the control; the section's Save stays enabled. Network / 403 /
  // conflict problems sit in a banner at the top of the section.
  const rolesFe = useFieldErrors({ schema: UserRolesFormSchema, values: { roles: picked }, idPrefix: "user-roles" });
  const mfaFe = useFieldErrors({ schema: MfaResetFormSchema, values: { code: mfaCode }, idPrefix: "user-mfa" });

  useEffect(() => setPicked(user.roles), [user.roles]);

  const alreadySuper = user.roles.includes(SUPER_ADMIN_ROLE);
  const assignable = [...ROLE_KEYS, ...customRoles.filter((r) => !ROLE_KEYS.includes(r))];
  const held = user.roles.filter((r) => !assignable.includes(r));
  const visibleRoles = [...assignable, ...held].filter((r) => r !== SUPER_ADMIN_ROLE || canGrantSuperAdmin || alreadySuper);
  const inactive = new Set(held);

  const mfaChip = sso ? null : user.status === "INVITED" ? <Chip tone="info">Invite sent</Chip> : user.mfaEnabled ? <Chip tone="ok">On</Chip> : <Chip tone="bad">Off</Chip>;
  const statusWord = user.status === "ACTIVE" ? "Active" : user.status === "INVITED" ? "Invited" : user.status === "SUSPENDED" ? "Suspended" : user.status;

  async function saveRoles() {
    roles.setError(null);
    if (!rolesFe.validate()) return;
    await roles.mutate(`/api/admin/users/${user.id}/roles`, "PATCH", { roles: picked }, {
      fallback: "Could not update the roles.",
      onFieldErrors: (fields) => rolesFe.setServerErrors(fields, ["roles"]),
      onSuccess: () => toast.success("Roles saved."),
    });
  }

  async function saveDepartment() {
    await dept.mutate(
      `/api/admin/users/${user.id}/department`,
      "PATCH",
      { departmentId: departmentId === "none" ? null : departmentId, managerId: managerId === "none" ? null : managerId },
      { fallback: "Could not update the department.", onSuccess: () => toast.success("Department saved.") },
    );
  }

  async function sendLink(kind: "resend" | "reset-password") {
    setCopied(false);
    await account.mutate(`/api/admin/users/${user.id}/${kind}`, "POST", undefined, {
      fallback: kind === "resend" ? "Could not resend the invite." : "Could not start the reset.",
      onSuccess: (data) => {
        const d = (data ?? {}) as { emailed?: boolean; acceptUrl?: string };
        setLink({ title: kind === "resend" ? "Invite sent again" : "Password reset sent", emailed: Boolean(d.emailed), acceptUrl: d.acceptUrl });
      },
    });
  }

  async function toggleSuspend() {
    const action = user.status === "ACTIVE" ? "suspend" : "reactivate";
    await account.mutate(`/api/admin/users/${user.id}/${action}`, "POST", undefined, { onSuccess: () => toast.success(action === "suspend" ? "Account suspended." : "Account reactivated.") });
  }

  async function confirmDelete() {
    await account.mutate(`/api/admin/users/${user.id}`, "DELETE", undefined, {
      onSuccess: () => {
        setDeleteOpen(false);
        onClose();
      },
    });
  }

  async function resetMfa() {
    setMfaError(null);
    if (!mfaFe.validate()) return;
    setMfaBusy(true);
    const res = await fetch("/api/auth/mfa/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: user.id, ...(mfaCode ? { code: mfaCode } : {}) }) }).catch(() => null);
    setMfaBusy(false);
    const body = res ? await res.json().catch(() => null) : null;
    if (!res?.ok) {
      const { message, fields } = readApiError(body, "Could not reset MFA. Try again.");
      if (fields.code) mfaFe.setServerErrors({ code: fields.code });
      else setMfaError(message);
      return;
    }
    setMfaCode("");
    toast.success(`MFA reset for ${user.name}. They set it up again at their next sign-in, and they've been told.`);
    onClose();
    router.refresh();
  }

  return (
    <>
      <DrawerFrame
        header={<DrawerHeader step="User" title={user.name} subtitle={`${user.email} · ${statusWord}`} />}
        footer={
          <DrawerFooter note="Every change is audited.">
            <button type="button" onClick={onClose} className={SECONDARY}>
              Close
            </button>
          </DrawerFooter>
        }
      >
        <Kv
          rows={[
            ["Role", user.roles.map(roleLabel).join(", ") || "None"],
            ["Department", user.departmentName ?? "None"],
            ...(mfaChip ? ([["MFA", mfaChip]] as [string, React.ReactNode][]) : []),
            ["Last active", user.lastLoginAt ? formatDate(user.lastLoginAt, timeZone) : "Never signed in"],
            ["Teams and projects", `${user.teamCount} ${user.teamCount === 1 ? "team" : "teams"} · ${user.projectCount} ${user.projectCount === 1 ? "project" : "projects"}`],
            ["Manager", user.managerName ?? "None"],
          ]}
        />

        {canManage && (
          <DrawerSection title="Roles" aside={<button type="button" onClick={saveRoles} disabled={roles.busy} className={COMPACT}>{roles.busy ? "Saving…" : "Save Roles"}</button>}>
            {roles.error && <Banner tone="bad">{roles.error}</Banner>}
            <div {...rolesFe.bindGroup("roles")} aria-label="Roles" className="grid grid-cols-1 gap-2 rounded-[10px] border border-transparent p-1 outline-none data-[invalid]:border-[var(--ds-bad)] sm:grid-cols-2">
              {visibleRoles.map((role) => {
                const locked = role === SUPER_ADMIN_ROLE && !canGrantSuperAdmin;
                return (
                  <label key={role} className="flex items-center gap-2 text-[13px] text-[var(--ds-ink)] data-[locked=true]:opacity-60" data-locked={locked}>
                    <Checkbox checked={picked.includes(role)} disabled={locked} onCheckedChange={(c) => setPicked((p) => (c === true ? [...p, role] : p.filter((r) => r !== role)))} />
                    {roleLabel(role)}
                    {locked && <span className="text-[11.5px] text-[var(--ds-ink3)]">(Super Admin only)</span>}
                    {inactive.has(role) && <span className="text-[11.5px] text-[var(--ds-ink3)]">(deactivated)</span>}
                  </label>
                );
              })}
            </div>
            {rolesFe.errors.roles && <FieldError id={`${rolesFe.idOf("roles")}-error`}>{rolesFe.errors.roles}</FieldError>}
          </DrawerSection>
        )}

        <DrawerSection title="Department" aside={<button type="button" onClick={saveDepartment} disabled={dept.busy} className={COMPACT}>{dept.busy ? "Saving…" : "Save Department"}</button>}>
          {dept.error && <Banner tone="bad">{dept.error}</Banner>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Department">
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={FIELD_INPUT}>
                <option value="none">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Manager">
              <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className={FIELD_INPUT}>
                <option value="none">No manager</option>
                {managerOptions
                  .filter((m) => m.id !== user.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <DrawerText hint>Teams are managed in Administration › Teams.</DrawerText>
        </DrawerSection>

        <DrawerSection title="Account">
          {account.error && <Banner tone="bad">{account.error}</Banner>}
          <div className="flex flex-wrap gap-2">
            {user.status === "INVITED" && (
              <button type="button" disabled={account.busy} onClick={() => void sendLink("resend")} className={COMPACT}>
                Resend Invite
              </button>
            )}
            {canResetPassword && !sso && user.status !== "INVITED" && (
              <button type="button" disabled={account.busy} onClick={() => void sendLink("reset-password")} className={COMPACT}>
                Send Password Reset
              </button>
            )}
            {canManage && user.status !== "INVITED" && (
              <button type="button" disabled={account.busy || isSelf} onClick={toggleSuspend} className={COMPACT}>
                {user.status === "ACTIVE" ? "Suspend" : "Reactivate"}
              </button>
            )}
            <button type="button" onClick={() => setGroupsOpen(true)} className={COMPACT}>
              Dashboard Views
            </button>
            {canManage && (
              <button type="button" disabled={isSelf} onClick={() => setDeleteOpen(true)} className={`${COMPACT} text-[var(--ds-bad-text)]`}>
                Delete
              </button>
            )}
          </div>
          {link && (
            <Banner>
              <b>{link.title}.</b> {link.emailed ? `An email is on its way to ${user.email}.` : "Email isn't configured, so pass this one-time link on yourself:"}
              {link.acceptUrl && (
                <span className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-[12px]">{link.acceptUrl}</code>
                  <button
                    type="button"
                    className={COMPACT}
                    onClick={async () => {
                      await navigator.clipboard.writeText(link.acceptUrl!).catch(() => {});
                      setCopied(true);
                    }}
                  >
                    {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </span>
              )}
            </Banner>
          )}
        </DrawerSection>

        {canResetPassword && !sso && user.mfaEnabled && (
          <DrawerSection title="Reset MFA">
            {isSelf ? (
              <DrawerText hint>You can&apos;t reset your own MFA. Use a recovery code, or ask another administrator.</DrawerText>
            ) : (
              <>
                <DrawerText>Removes {user.name}&apos;s authenticator so they can set it up again at their next sign-in. They&apos;re told, and the change is audited.</DrawerText>
                {mfaError && <Banner tone="bad">{mfaError}</Banner>}
                <div className="flex flex-wrap items-start gap-2">
                  <Field label="Your Authenticator Code" htmlFor={mfaFe.idOf("code")} error={mfaFe.errors.code} hint="Confirms it's you. Needed when you use an authenticator.">
                    <input {...mfaFe.bind("code")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 digits" className={`${FIELD_INPUT} w-[140px]`} />
                  </Field>
                  <button type="button" disabled={mfaBusy} onClick={resetMfa} className={`${COMPACT} mt-[21px] h-[var(--ds-control-h)]`}>
                    {mfaBusy ? "Resetting…" : "Reset MFA"}
                  </button>
                </div>
              </>
            )}
          </DrawerSection>
        )}
      </DrawerFrame>

      <EditGroupsDialog user={user} open={groupsOpen} onOpenChange={setGroupsOpen} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {user.name}?</AlertDialogTitle>
            <AlertDialogDescription>They lose access straight away. Their work stays, credited to them. This is audited.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={account.busy} onClick={confirmDelete}>
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
