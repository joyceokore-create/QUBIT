"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/dates";
import { CARD, FOCUS, PRIMARY } from "@/lib/surface";
import { cn } from "@/lib/utils";

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
    <form onSubmit={save} className={cn(CARD, "flex max-w-[640px] flex-col gap-4 p-5")} style={{ background: "var(--cardbg)" }}>
      <div>
        <h2 className="text-[15px] font-semibold text-[var(--qink)]">Time zone</h2>
        <p className="mt-0.5 text-[13px] text-[var(--ink3)]">
          Used for &quot;today&quot;, &quot;overdue&quot;, due dates, the Daily Brief and the Friday 17:00 update deadline, for everyone in this organisation.
        </p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-[var(--qink)]">Time zone</span>
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`h-[var(--control-h)] w-full max-w-[360px] rounded-[var(--control-r)] border border-[var(--input)] bg-[var(--qcard)] px-3 text-[13px] text-[var(--qink)] ${FOCUS}`}
        >
          {options.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-[var(--ink3)]">It is {preview} there now.</span>
      </label>
      <div>
        <button type="submit" disabled={busy || value === current} className={PRIMARY}>
          {busy ? "Saving…" : "Save time zone"}
        </button>
      </div>
    </form>
  );
}
