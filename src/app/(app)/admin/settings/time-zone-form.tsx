"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/dates";
import { PRIMARY } from "@/lib/surface";
import { Panel } from "@/components/ui/panel";
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
  const options = useMemo(() => zones(current), [current]);
  const preview = formatDateTime(new Date(), value);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/admin/settings/time-zone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timeZone: value }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      toast.error(body?.error?.message ?? "Couldn't save the time zone. Try again.");
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
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Time Zone" htmlFor="tenant-time-zone" hint={`It is ${preview} there now.`}>
          <select id="tenant-time-zone" value={value} onChange={(e) => setValue(e.target.value)} className={`${FIELD_INPUT} max-w-[360px]`}>
            {options.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <button type="submit" disabled={busy || value === current} className={PRIMARY}>
            {busy ? "Saving…" : "Save Time Zone"}
          </button>
        </div>
      </form>
    </Panel>
  );
}
