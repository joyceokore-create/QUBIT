"use client";

import { useRouter } from "next/navigation";

// Persona switcher (docs/17 §1.2) — shown only to multi-group users. A UI lens, never a
// security control: it reorders the dashboard, touches no permission. The choice is
// persisted (last-used wins next login).

const LABELS: Record<string, string> = {
  executive: "Executive",
  pm: "PM",
  developer: "Developer",
  qa: "QA",
  implementor: "Implementor",
};

export function PersonaSwitcher({ personas, active }: { personas: string[]; active: string }) {
  const router = useRouter();
  if (personas.length < 2) return null;

  const switchTo = (persona: string) => {
    // Persist first (fire-and-forget), then re-render the shell with the new lens.
    void fetch("/api/me/persona", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ persona }),
    }).catch(() => {});
    router.push(`/dashboard?persona=${persona}`);
  };

  return (
    <div className="flex items-center gap-1 rounded-full border border-[var(--w07)] bg-[var(--wash)] p-0.5" role="tablist" aria-label="Dashboard persona">
      {personas.map((p) => (
        <button
          key={p}
          type="button"
          role="tab"
          aria-selected={p === active}
          onClick={() => switchTo(p)}
          className={`rounded-full px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-[.8px] transition-colors ${
            p === active ? "bg-[var(--brand)] text-[var(--onbrand)]" : "text-[var(--ink4)] hover:text-[var(--qink)]"
          }`}
        >
          {LABELS[p] ?? p}
        </button>
      ))}
    </div>
  );
}
