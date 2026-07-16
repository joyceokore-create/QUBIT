"use client";

import { QubitLogo } from "@/components/brand/qubit-logo";
import { useQ, type QPending } from "@/components/q/q-provider";

/**
 * "Ask Q about this project / portfolio" entry point — placed inside each panel per the
 * design. Opens the Q drawer straight into a grounded report for this entity.
 */
export function AskQAbout({ type, targetId, label }: QPending & { label: string }) {
  const { openQWith } = useQ();
  return (
    <button
      type="button"
      onClick={() => openQWith({ type, targetId, label })}
      className="flex w-full items-center justify-center gap-2 rounded-[11px] bg-[var(--brand)] px-4 py-3 text-[13px] font-bold text-[var(--onbrand)] transition-transform hover:-translate-y-px"
      style={{ boxShadow: "0 4px 20px color-mix(in oklab, var(--brand) var(--glowA), transparent)" }}
    >
      <QubitLogo square={5} gap={1.5} radius={1.5} color="var(--onbrand)" />
      {label}
    </button>
  );
}
