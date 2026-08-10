"use client";

import { useEffect, useState } from "react";
import { CalendarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogTrigger } from "@/components/ui/dialog";
import { AdminFormDialog } from "@/components/admin/admin-form-dialog";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { ABSENCE_TYPES, type AbsenceType } from "@/server/absence";

/**
 * DM1.73 (Wave D) — the missing half of every capacity warning. `POST /api/absences`
 * and the whole leave-aware capacity stack (effectivePct, on-leave badges, assignment
 * warnings) shipped in M6-A, but nothing in the UI could WRITE an absence — the maths
 * ran over a table nobody could populate. This dialog is the manual entry path
 * (docs/16 §5, source=manual); imports/ERP stay server-side jobs.
 *
 * Fields mirror CreateAbsenceInput (src/server/absence.ts) exactly: userId, type
 * (Leave/Sick/Training/Other), startDate/endDate as ISO datetimes, optional note ≤300.
 * Rendered only for viewers the route lets write (iam:manage or project:update) —
 * the page mirrors the API's own gate, this component just trusts its parent.
 */
export function RecordLeaveDialog({ people }: { people: { id: string; name: string }[] }) {
  const { busy, error, setError, mutate } = useAdminMutation();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [type, setType] = useState<AbsenceType>("Leave");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");

  // Reset on open so a second "Record leave" doesn't inherit the last attempt.
  useEffect(() => {
    if (!open) return;
    setUserId("");
    setType("Leave");
    setStart("");
    setEnd("");
    setNote("");
    setError(null);
  }, [open, setError]);

  async function submit() {
    if (!userId) {
      setError("Pick a person.");
      return;
    }
    if (!start || !end) {
      setError("Enter the first and last day away.");
      return;
    }
    if (new Date(end) < new Date(start)) {
      setError("The last day away cannot be before the first.");
      return;
    }
    await mutate(
      "/api/absences",
      "POST",
      {
        userId,
        type,
        // CreateAbsenceInput wants full ISO datetimes; date inputs give YYYY-MM-DD.
        startDate: new Date(start).toISOString(),
        endDate: new Date(end).toISOString(),
        note: note.trim() ? note.trim() : null,
      },
      {
        fallback: "Could not record the absence.",
        onSuccess: () => setOpen(false),
      },
    );
  }

  return (
    <AdminFormDialog
      open={open}
      onOpenChange={setOpen}
      title="Record leave"
      description="Capacity, badges and reminders all react to this one entry (imported/HR leave stays read-only)."
      error={error}
      busy={busy}
      submitLabel="Record"
      busyLabel="Recording…"
      onSubmit={submit}
      trigger={
        <DialogTrigger render={<Button size="sm" variant="outline" className="rounded-full" />}>
          <CalendarOff /> Record leave
        </DialogTrigger>
      }
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-2">Person</span>
        <Select
          value={userId || null}
          onValueChange={(v) => setUserId(v ?? "")}
          items={Object.fromEntries(people.map((p) => [p.id, p.name]))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Pick a person" />
          </SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-2">Type</span>
        <Select
          value={type}
          onValueChange={(v) => setType((v as AbsenceType) ?? "Leave")}
          items={Object.fromEntries(ABSENCE_TYPES.map((t) => [t, t]))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ABSENCE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="record-leave-start" className="text-sm font-medium text-ink-2">
            First day away
          </label>
          <Input id="record-leave-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="record-leave-end" className="text-sm font-medium text-ink-2">
            Last day away
          </label>
          <Input id="record-leave-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="record-leave-note" className="text-sm font-medium text-ink-2">
          Note <span className="font-normal text-[var(--ink4)]">(optional)</span>
        </label>
        <Input
          id="record-leave-note"
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Annual leave, back Monday"
        />
      </div>
    </AdminFormDialog>
  );
}
