import { Check, Users, ClipboardList } from "lucide-react";

const EXEC = ["A single command center across every subsidiary", "Portfolio health rollups from group down to one project", "Steering packs drafted from live data", "Slippage surfaced before it turns red"];
const PM = ["One place for programmes, milestones and RAID", "Task priorities re-ranked with a “why”", "Deadline and stale-invite chasers handled by Q", "Every mutation captured in the audit trail"];

// Clean checklist: no per-item cards, no CTA — each column is a light check + text
// list. Audience colour lives only in the icon badge + check marks.
function Panel({ icon: Icon, title, items, tint }: { icon: typeof Users; title: string; items: string[]; tint: string }) {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="grid size-11 flex-none place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${tint} 14%, transparent)` }}>
          <Icon className="size-6" style={{ color: tint }} aria-hidden />
        </span>
        <h3 className="text-[22px] font-bold text-[var(--qink)]">{title}</h3>
      </div>

      <ul className="flex flex-col gap-4">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-3">
            <Check className="mt-0.5 size-5 flex-none" style={{ color: tint }} aria-hidden />
            <span className="text-pretty text-[15px] leading-[1.5] text-[var(--ink2)]">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AudienceSplit() {
  return (
    <section className="mx-auto max-w-[1180px] px-6 py-20 sm:py-24">
      <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 sm:gap-16">
        <Panel icon={Users} title="For executives" items={EXEC} tint="var(--pbrand)" />
        <Panel icon={ClipboardList} title="For programme managers" items={PM} tint="var(--kcb-blue)" />
      </div>
    </section>
  );
}
