"use client";

import { QubitLogo } from "@/components/brand/qubit-logo";
import { useQ } from "@/components/q/q-provider";

/** Opens the Q copilot drawer (MVP1 Phase C). */
export function AskQButton() {
  const { openQ } = useQ();
  return (
    <button
      type="button"
      onClick={openQ}
      className="flex flex-none items-center gap-2 rounded-full bg-[var(--brand)] px-[18px] py-[9px] text-[13px] font-bold text-[var(--onbrand)] transition-transform hover:-translate-y-px"
      style={{ boxShadow: "0 4px 20px color-mix(in oklab, var(--brand) var(--glowA), transparent)" }}
    >
      <QubitLogo square={5} gap={1.5} radius={1.5} color="var(--onbrand)" />
      Ask Q
    </button>
  );
}
