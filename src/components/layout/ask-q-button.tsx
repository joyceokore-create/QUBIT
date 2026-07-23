"use client";

import Image from "next/image";
import qubitIcon from "@/assets/qubit_white_icon.svg";
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
      <Image src={qubitIcon} alt="" aria-hidden width={16} height={16} unoptimized className="h-[15px] w-[15px]" />
      Ask Q
    </button>
  );
}
