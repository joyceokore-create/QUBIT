"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banner, Panel } from "@/components/ui/panel";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { readApiError } from "@/lib/form-errors";
import { RetentionFormSchema } from "@/lib/retention-schema";
import { Field, FIELD_INPUT } from "@/components/ui/drawer";
import { RETENTION_DEFAULT_DAYS, RETENTION_MAX_DAYS, RETENTION_MIN_DAYS } from "@/lib/retention";
import { PRIMARY } from "@/lib/surface";

/** UX fidelity D-F3b — Settings › Access Requests: how long decided requests are kept. */
export function RetentionForm({ current, canEdit }: { current: number; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(String(current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = Number(value);
  // docs/08 § Errors: the problem shows on the field; Save stays enabled.
  const fe = useFieldErrors({ schema: RetentionFormSchema, values: { days: value }, idPrefix: "retention" });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fe.validate()) return;
    setBusy(true);
    const res = await fetch("/api/admin/settings/access-request-retention", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const { message, fields } = readApiError(res ? await res.json().catch(() => null) : null, "Couldn’t save. Try again.");
      const { _: root, ...onFields } = fields;
      if (Object.keys(onFields).length > 0) {
        fe.setServerErrors(onFields);
        if (root) setError(root);
      } else {
        setError(message);
      }
      return;
    }
    toast.success(`Decided requests are now kept for ${days} days.`);
    router.refresh();
  }

  return (
    <Panel title="Access Requests" className="max-w-[640px]">
      <p className="-mt-1.5 text-[13px] text-[var(--ds-ink3)]">
        Approved and declined requests are deleted this many days after the decision. Waiting requests are never deleted. The audit log keeps the decision, not the person&apos;s details.
      </p>
      <form onSubmit={save} className="flex flex-col gap-3" noValidate>
        {error && <Banner tone="bad">{error}</Banner>}
        <Field
          label="Keep Decided Requests For (Days)"
          htmlFor={fe.idOf("days")}
          error={fe.errors.days}
          hint={`Between ${RETENTION_MIN_DAYS} and ${RETENTION_MAX_DAYS} days. Default ${RETENTION_DEFAULT_DAYS}.${canEdit ? "" : " Only a Super Admin can change this."}`}
        >
          <input
            {...fe.bind("days")}
            type="number"
            inputMode="numeric"
            min={RETENTION_MIN_DAYS}
            max={RETENTION_MAX_DAYS}
            step={1}
            value={value}
            disabled={!canEdit}
            onChange={(e) => setValue(e.target.value)}
            className={`${FIELD_INPUT} max-w-[160px]`}
          />
        </Field>
        {canEdit && (
          <div>
            <button type="submit" disabled={busy} className={PRIMARY}>
              {busy ? "Saving…" : "Save Retention"}
            </button>
          </div>
        )}
      </form>
    </Panel>
  );
}
