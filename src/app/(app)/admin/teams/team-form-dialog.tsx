"use client";

import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/drawer";
import { Banner } from "@/components/ui/panel";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { TeamFormSchema } from "@/lib/team-schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/drawer-dialog";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import type { AdminUserSummary } from "@/server/users";

interface TeamFormDialogProps {
  users: AdminUserSummary[];
  teamId?: string; // present → edit mode
  /** Optional trigger. Omit when driving the dialog with `open`/`onOpenChange`. */
  trigger?: ReactElement;
  /** Controlled open state (e.g. when opened from a menu) — decouples the
   *  dialog from any dropdown so the two portals don't fight and flicker. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Create/edit a team: name, description, lead, and member selection. */
export function TeamFormDialog({ users, teamId, trigger, open: openProp, onOpenChange }: TeamFormDialogProps) {
  const { busy, error, setError, mutate } = useAdminMutation();
  const isEdit = Boolean(teamId);
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leadUserId, setLeadUserId] = useState("none");
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());

  // docs/08 § Errors: Name (and Description length) show their problems on the field.
  const fe = useFieldErrors({ schema: TeamFormSchema, values: { name, description }, idPrefix: "team" });

  // Load current values when editing.
  useEffect(() => {
    if (!open || !teamId) return;
    fetch(`/api/admin/teams/${teamId}`)
      .then((r) => r.json())
      .then((body) => {
        const t = body.data;
        if (!t) return;
        setName(t.name);
        setDescription(t.description ?? "");
        setLeadUserId(t.leadUserId ?? "none");
        setMemberIds(new Set(t.members.map((m: { userId: string }) => m.userId)));
      })
      .catch(() => {});
  }, [open, teamId]);

  function reset() {
    setName("");
    setDescription("");
    setLeadUserId("none");
    setMemberIds(new Set());
    setError(null);
    fe.reset();
  }

  const toggleMember = (id: string) =>
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fe.validate()) return;
    await mutate(
      isEdit ? `/api/admin/teams/${teamId}` : "/api/admin/teams",
      isEdit ? "PATCH" : "POST",
      {
        name,
        description: description || null,
        leadUserId: leadUserId === "none" ? null : leadUserId,
        memberIds: [...memberIds],
      },
      {
        fallback: "Could not save the team.",
        onFieldErrors: (fields) => fe.setServerErrors(fields, ["name", "description"]),
        onSuccess: () => {
          setOpen(false);
          if (!isEdit) reset();
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && !isEdit) reset();
      }}
    >
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Team" : "New Team"}</DialogTitle>
          <DialogDescription>
            Teams are cross-functional groups you assign to projects.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error && <Banner tone="bad">{error}</Banner>}
          <Field label="Name" htmlFor={fe.idOf("name")} error={fe.errors.name}>
            <Input {...fe.bind("name")} required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor={fe.idOf("description")} error={fe.errors.description}>
            <Input {...fe.bind("description")} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-2">Team Lead</span>
            <Select
              value={leadUserId}
              onValueChange={(v) => setLeadUserId(v ?? "none")}
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
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-2">Members ({memberIds.size})</span>
            <div className="max-h-48 overflow-y-auto rounded-[8px] border border-ink-4 p-2">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 py-1 text-sm text-ink-2">
                  <input
                    type="checkbox"
                    checked={memberIds.has(u.id)}
                    onChange={() => toggleMember(u.id)}
                    className="size-4 accent-[var(--brand)]"
                  />
                  {u.name} <span className="text-ink-3">· {u.email}</span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : isEdit ? "Save Changes" : "Create Team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
