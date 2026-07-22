"use client";

import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  const router = useRouter();
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    const body = {
      name,
      description: description || null,
      leadUserId: leadUserId === "none" ? null : leadUserId,
      memberIds: [...memberIds],
    };
    const res = await fetch(isEdit ? `/api/admin/teams/${teamId}` : "/api/admin/teams", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      setError(b?.error?.message ?? "Could not save team.");
      return;
    }
    setOpen(false);
    if (!isEdit) reset();
    router.refresh();
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
          <DialogTitle>{isEdit ? "Edit team" : "New team"}</DialogTitle>
          <DialogDescription>
            Teams are cross-functional groups you assign to projects.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-2">Name</label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-2">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-2">Team lead</span>
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
          {error && (
            <p role="alert" className="text-sm text-status-red">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : isEdit ? "Save changes" : "Create team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
