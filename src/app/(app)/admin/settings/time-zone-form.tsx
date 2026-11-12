"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/dates";
import { PRIMARY } from "@/lib/surface";
import { Banner, Panel } from "@/components/ui/panel";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { readApiError } from "@/lib/form-errors";
import { TimeZoneBodySchema } from "@/lib/time-zone-schema";
import { Field, FIELD_INPUT } from "@/components/ui/drawer";

/** The IANA zones this browser knows (Africa/Nairobi first: Riverbank's default). */
function zones(current: string): string[] {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [...new Set(["Africa/Nairobi", current, ...all])];
}

export function TimeZoneForm({ current }: { current: string }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // docs/08 § Errors: the problem shows on the field; Save stays enabled.
  const fe = useFieldErrors({ schema: TimeZoneBodySchema, values: { timeZone: value }, idPrefix: "tenant" });
  const options = useMemo(() => zones(current), [current]);
  const preview = formatDateTime(new Date(), value);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fe.validate()) return;
    setBusy(true);
    const res = await fetch("/api/admin/settings/time-zone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timeZone: value }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const { message, fields } = readApiError(res ? await res.json().catch(() => null) : null, "Couldn’t save the time zone. Try again.");
      const { _: root, ...onFields } = fields;
      if (Object.keys(onFields).length > 0) {
        fe.setServerErrors(onFields);
        if (root) setError(root);
      } else {
        setError(message);
      }
      return;
    }
    toast.success(`Time zone set to ${value}.`);
    router.refresh();
  }

  return (
    <Panel title="Time Zone" className="max-w-[640px]">
      <p className="-mt-1.5 text-[13px] text-[var(--ds-ink3)]">
        Used for &quot;today&quot;, &quot;overdue&quot;, due dates, the Daily Brief and the Friday 17:00 update deadline, for everyone in this organisation.
      </p>
      <form onSubmit={save} className="flex flex-col gap-3" noValidate>
        {error && <Banner tone="bad">{error}</Banner>}
        <Field label="Time Zone" htmlFor={fe.idOf("timeZone")} error={fe.errors.timeZone} hint={`It is ${preview} there now.`}>
          <select {...fe.bind("timeZone")} value={value} onChange={(e) => setValue(e.target.value)} className={`${FIELD_INPUT} max-w-[360px]`}>
            {options.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? "Saving…" : "Save Time Zone"}
          </button>
        </div>
      </form>
    </Panel>
  );
}
