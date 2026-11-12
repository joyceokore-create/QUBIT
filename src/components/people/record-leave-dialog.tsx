"use client";

import { useEffect, useState } from "react";
import { CalendarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/drawer";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { RecordLeaveFormSchema } from "@/lib/absence-schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogTrigger } from "@/components/ui/drawer-dialog";
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

  // docs/08 § Errors: Person, the two dates and the note show their problems on the field.
  const fe = useFieldErrors({ schema: RecordLeaveFormSchema, values: { userId, startDate: start, endDate: end, note }, idPrefix: "record-leave" });

  // Reset on open so a second "Record leave" doesn't inherit the last attempt.
  useEffect(() => {
    if (!open) return;
    setUserId("");
    setType("Leave");
    setStart("");
    setEnd("");
    setNote("");
    setError(null);
    fe.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  }, [open, setError]);

  async function submit() {
    setError(null);
    if (!fe.validate()) return;
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
        onFieldErrors: (fields) => fe.setServerErrors(fields, ["userId", "startDate", "endDate", "note"]),
        onSuccess: () => setOpen(false),
      },
    );
  }

  return (
    <AdminFormDialog
      open={open}
      onOpenChange={setOpen}
      title="Record Leave"
      description="Capacity, badges and reminders all react to this one entry (imported/HR leave stays read-only)."
      error={error}
      busy={busy}
      submitLabel="Record"
      busyLabel="Recording…"
      onSubmit={submit}
      trigger={
        <DialogTrigger render={<Button variant="outline" />}>
          <CalendarOff /> Record leave
        </DialogTrigger>
      }
    >
      <Field label="Person" error={fe.errors.userId}>
        <Select
          value={userId || null}
          onValueChange={(v) => setUserId(v ?? "")}
          items={Object.fromEntries(people.map((p) => [p.id, p.name]))}
        >
          <SelectTrigger {...fe.bind("userId")} className="w-full">
            <SelectValue placeholder="Choose a person" />
          </SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

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
        <Field label="First Day Away" htmlFor={fe.idOf("startDate")} error={fe.errors.startDate}>
          <Input {...fe.bind("startDate")} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Last Day Away" htmlFor={fe.idOf("endDate")} error={fe.errors.endDate}>
          <Input {...fe.bind("endDate")} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>

      <Field label="Note (Optional)" htmlFor={fe.idOf("note")} error={fe.errors.note}>
        <Input
          {...fe.bind("note")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Annual leave, back Monday"
        />
      </Field>
    </AdminFormDialog>
  );
}
