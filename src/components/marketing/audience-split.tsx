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
    // flex column + flex-1 on the list keeps both panels' "Sign in" buttons on a
    // shared baseline even when the two bullet lists wrap to different heights.
    <div className="flex h-full flex-col rounded-2xl p-8" style={{ background: `color-mix(in oklab, ${tint} 8%, var(--qcard))`, border: "1px solid var(--w07)" }}>
      <div className="mb-6 flex items-center gap-3">
        <Icon className="size-8" style={{ color: tint }} aria-hidden />
        <h3 className="text-[22px] font-bold text-[var(--qink)]">{title}</h3>
      </div>
      <ul className="mb-8 flex-1 space-y-4">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-3 text-[14px] text-[var(--ink2)]">
            <Check className="mt-0.5 size-5 flex-none text-[var(--ok)]" aria-hidden />
            <span className="text-pretty">{it}</span>
          </li>
        ))}
      </ul>
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
    <section className="mx-auto max-w-[1180px] px-6 py-20">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Panel icon={Users} title="For executives" items={EXEC} tint="var(--pbrand)" />
        <Panel icon={ClipboardList} title="For programme managers" items={PM} tint="var(--blue)" />
      </div>
    </section>
  );
}
