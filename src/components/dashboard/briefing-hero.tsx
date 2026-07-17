import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HealthRing } from "@/components/command/health-ring";
import type { BriefingItem, BriefingSeverity } from "@/server/relevance";

// The personalized briefing hero (PROMPT §3–§4): greeting + the viewer's top "needs YOUR
// attention" items (from getBriefing) + a portfolio health ring. Shared across every role's
// dashboard, so the "3 things" are always personally relevant.

const SEV_TOKEN: Record<BriefingSeverity, string> = { red: "--bad", amber: "--warn", info: "--qinfo" };

export interface BriefingHeroProps {
  firstName: string;
  roleLabel: string;
  tenantName: string;
  items: BriefingItem[];
  health: number;
  distribution: { onTrack: number; needAttention: number; planning: number; total: number };
}

export function BriefingHero({ firstName, roleLabel, tenantName, items, health, distribution }: BriefingHeroProps) {
  const { onTrack, needAttention, planning, total } = distribution;
  return (
    <section
      className="relative overflow-hidden rounded-[18px] border border-[var(--cardbd)] p-[26px_28px] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25] [animation:rise_.55s_cubic-bezier(.22,1,.36,1)_.04s_both]"
      style={{ background: "var(--cardbg)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(900px 340px at 8% -50%, color-mix(in oklab, var(--brand) 14%, transparent), transparent 62%)" }}
      />
      <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
        {/* greeting */}
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-[9px]">
            <span className="size-[7px] rounded-full bg-[var(--brand)] [animation:pulseGlow_2.4s_infinite]" />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[2.2px] text-brand">
              {roleLabel} · {tenantName}
            </span>
          </div>
          <h1 className="mb-2.5 font-heading text-[34px] font-bold leading-[1.08] tracking-[-1.1px] text-[var(--qink)]">
            Good day, {firstName}.
          </h1>
          <p className="mb-[18px] max-w-[430px] text-[14.5px] leading-[1.55] text-[var(--ink3)]">
            {items.length > 0 ? (
              <>
                {items.length} {items.length === 1 ? "thing needs" : "things need"} your attention today.
              </>
            ) : (
              <>You&apos;re all clear — nothing needs your attention right now.</>
            )}
          </p>
        </div>

        {/* personalized attention list (getBriefing) */}
        <div className="flex min-w-0 flex-col border-t border-[var(--hair2)]">
          {items.length ? (
            items.map((item) => (
              <Link
                key={`${item.kind}:${item.id}`}
                href={item.href}
                className="flex items-start gap-[11px] border-b border-[var(--hair2)] p-[11px_4px] transition-[transform,background] duration-200 hover:translate-x-1 hover:bg-[var(--wash)]"
              >
                <span className="mt-[5px] h-[26px] w-[3px] flex-none rounded-[2px]" style={{ background: `var(${SEV_TOKEN[item.severity]})` }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-[var(--ink2)]">{item.title}</span>
                  <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[1.2px] text-[var(--ink4)]">{item.meta}</span>
                </span>
                <ArrowRight className="mt-2 size-3 flex-none text-[var(--ink5)]" />
              </Link>
            ))
          ) : (
            <div className="p-[11px_4px] text-[12.5px] text-[var(--ink4)]">Nothing needs your attention.</div>
          )}
        </div>

        {/* portfolio health */}
        <div className="flex flex-none flex-col items-center gap-3">
          <HealthRing score={health} />
          <div className="w-[150px]">
            <div className="flex h-[5px] gap-[2px] overflow-hidden rounded-full">
              <span style={{ width: `${total ? (onTrack / total) * 100 : 0}%`, background: "var(--ok)" }} />
              <span style={{ width: `${total ? (needAttention / total) * 100 : 0}%`, background: "var(--warn)" }} />
              <span style={{ width: `${total ? (planning / total) * 100 : 0}%`, background: "var(--qinfo)" }} />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[9px] tracking-[.6px]">
              <span className="text-[var(--ok)]">{onTrack} ON</span>
              <span className="text-[var(--warn)]">{needAttention} RISK</span>
              <span className="text-[var(--qinfo)]">{planning} PLAN</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
