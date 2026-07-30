import Link from "next/link";

// The DM1.20 scope toggle — a default filter, never a wall. One component for every
// scoped persona (PM since M1b; QA + Implementor since M1c, design proposal №10).

export function ScopeToggle({ persona, scope }: { persona: string; scope: "mine" | "all" }) {
  return (
    <div className="-mb-1.5 flex items-center justify-end">
      <span className="flex items-center gap-1 rounded-full border border-[var(--w07)] bg-[var(--wash)] p-0.5">
        {(["mine", "all"] as const).map((s) => (
          <Link
            key={s}
            href={`/dashboard?persona=${persona}&scope=${s}`}
            className={`rounded-full px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-[.8px] transition-colors ${
              scope === s ? "bg-[var(--brand)] text-[var(--onbrand)]" : "text-[var(--ink4)] hover:text-[var(--qink)]"
            }`}
          >
            {s === "mine" ? "My projects" : "All"}
          </Link>
        ))}
      </span>
    </div>
  );
}
