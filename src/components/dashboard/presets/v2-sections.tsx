import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { DeltaFeed } from "@/server/delta";

// Shared preset chrome (CARD, Panel, Empty) + the "since you last looked" delta feed.
// The interim "three questions" layout that lived here retired with M1c — every
// persona now has a dedicated preset (docs/17 §8 complete).

export const CARD =
  "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";
export const SEV: Record<string, string> = { red: "--bad", amber: "--warn", info: "--qinfo", bad: "--bad", warn: "--warn", ok: "--ok" };

// DM1.73 (T8): `hint` hangs explainer copy off the header as a title attribute — the
// footer strips that spelled these out inside panels are gone; hover still reveals them.
export function Panel({ title, sub, hint, children }: { title: string; sub?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={CARD} style={{ background: "var(--cardbg)", animation: "rise .5s cubic-bezier(.22,1,.36,1) both" }}>
      <div className="flex items-baseline gap-2.5 border-b border-[var(--hair)] p-[12px_16px]" title={hint}>
        <span className="font-heading text-[13.5px] rv:text-heading-xs font-bold text-[var(--qink)]">{title}</span>
        {sub && <span className="font-mono rv:font-sans text-[9px] rv:text-overline tracking-[1.2px] text-[var(--ink4)]">{sub}</span>}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-[12px_16px] text-[12px] text-[var(--ink5)]">{children}</div>;
}

export function ChangedSection({ delta }: { delta: DeltaFeed }) {
  const since = delta.since.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <Panel title="Since you last looked" sub={`FROM ${since.toUpperCase()}`}>
      {delta.items.length ? (
        delta.items.map((it, i) => {
          const inner = (
            <>
              <span className="w-[3px] flex-none self-stretch rounded-[2px]" style={{ background: `var(${SEV[it.tone]})` }} />
              <span className="min-w-0 flex-1 text-[12.5px] leading-[1.5] text-[var(--ink2)]">{it.text}</span>
              {it.href && <ArrowRight className="mt-0.5 size-3 flex-none text-[var(--ink5)]" />}
            </>
          );
          const cls = "flex items-start gap-[11px] border-b border-[var(--hair2)] p-[9px_16px] last:border-0";
          return it.href ? (
            <Link key={i} href={it.href} className={`${cls} transition-colors hover:bg-[var(--wash)]`}>{inner}</Link>
          ) : (
            <div key={i} className={cls}>{inner}</div>
          );
        })
      ) : (
        <Empty>Nothing new since your last visit.</Empty>
      )}
    </Panel>
  );
}

