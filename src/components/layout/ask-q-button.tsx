"use client";

import Image from "next/image";
import qubitIcon from "@/assets/qubit_white_icon.svg";
import qubitIconInk from "@/assets/qubit_icon.svg";
import { useQ } from "@/components/q/q-provider";
import { SECONDARY } from "@/lib/surface";

/** Opens the Q copilot drawer (MVP1 Phase C). `secondary` is the white top bar's version
 * (design spec v2: "Ask Q" sits beside the "+ New" primary as a secondary button). */
export function AskQButton({ variant = "brand" }: { variant?: "brand" | "secondary" }) {
  const { openQ } = useQ();
  if (variant === "secondary") {
    return (
      <button type="button" onClick={openQ} className={SECONDARY}>
        <Image src={qubitIconInk} alt="" aria-hidden width={16} height={16} unoptimized className="size-4" />
        <span className="max-sm:sr-only">Ask Q</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={openQ}
      className="flex flex-none items-center gap-2 rounded-full bg-[var(--brand)] px-[9px] py-[9px] sm:px-[18px] text-[13px] font-bold text-[var(--onbrand)] transition-transform hover:-translate-y-px"
      style={{ boxShadow: "0 4px 20px color-mix(in oklab, var(--brand) var(--glowA), transparent)" }}
    >
      <Image src={qubitIcon} alt="" aria-hidden width={20} height={20} unoptimized className="h-[20px] w-[20px]" />
      <span className="max-sm:sr-only">Ask Q</span>
    </button>
  );
}
