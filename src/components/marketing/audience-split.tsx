import Link from "next/link";
import { Check, Users, ClipboardList } from "lucide-react";

const EXEC = ["A single command center across every subsidiary", "RAG heatmaps from group down to one branch", "Steering packs drafted from live data", "Slippage surfaced before it turns red"];
const PM = ["One place for programmes, milestones and RAID", "Task priorities re-ranked with a “why”", "Deadline and stale-invite chasers handled by Q", "Every mutation captured in the audit trail"];

// Same focus recipe as hero.tsx / marketing-header.tsx, so keyboard focus reads
// consistently across every marketing CTA.
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--qbg)]";

function Panel({ icon: Icon, title, items, tint }: { icon: typeof Users; title: string; items: string[]; tint: string }) {
  return (
    // The column itself is NOT a card — each point is its own bordered card, so
    // there's no nested-card anti-pattern. flex column + flex-1 on the card stack
    // keeps both columns' "Sign in" buttons on a shared baseline.
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid size-11 flex-none place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${tint} 14%, transparent)` }}>
          <Icon className="size-6" style={{ color: tint }} aria-hidden />
        </span>
        <h3 className="text-[22px] font-bold text-[var(--qink)]">{title}</h3>
      </div>

      <div className="mb-8 flex flex-1 flex-col gap-3">
        {items.map((it) => (
          <div
            key={it}
            className="q-card-hover flex items-start gap-3 rounded-xl border border-[var(--w07)] bg-[var(--qcard)] p-4 shadow-[var(--cardsh)]"
          >
            <Check className="mt-0.5 size-5 flex-none" style={{ color: tint }} aria-hidden />
            <span className="text-pretty text-[14px] leading-[1.5] text-[var(--ink2)]">{it}</span>
          </div>
        ))}
      </div>

      <Link
        href="/login"
        className={`q-lift inline-flex self-start rounded-xl px-6 py-3 text-[14px] font-bold text-[var(--onbrand)] ${FOCUS_RING}`}
        style={{ background: tint }}
      >
        Sign in
      </Link>
    </div>
  );
}

export function AudienceSplit() {
  return (
    <section className="mx-auto max-w-[1180px] px-6 py-20 sm:py-24">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12">
        <Panel icon={Users} title="For executives" items={EXEC} tint="var(--pbrand)" />
        <Panel icon={ClipboardList} title="For programme managers" items={PM} tint="var(--blue)" />
      </div>
    </section>
  );
}
