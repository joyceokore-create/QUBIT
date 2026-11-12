"use client";

import Image from "next/image";
import qubitIcon from "@/assets/qubit_white_icon.svg";
import { useQ } from "@/components/q/q-provider";
import { FOCUS } from "@/lib/surface";
import { cn } from "@/lib/utils";

/** Opens the Q copilot drawer (MVP1 Phase C). `secondary` is the white top bar's version
 * (gradient "AI" button beside the ink "+ New"); `brand` is the classic shell's pill. */
export function AskQButton({ variant = "brand" }: { variant?: "brand" | "secondary" }) {
  const { openQ } = useQ();
  if (variant === "secondary") {
    // Designer, 12 Nov 2026: Ask Q is AI, so it gets its own look — a Riverbank red gradient
    // (deep red → brand red → warm red-orange; the label sits over the deep/brand red, 8.3–4.4:1)
    // with a soft red glow; hover brightens
    // and lifts it. Same 36px height and radius as the other top-bar buttons.
    return (
      <button
        type="button"
        onClick={openQ}
        className={cn(
          "inline-flex h-[var(--ds-control-h)] items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--ds-radius-control)] px-3.5 text-[12.5px] font-semibold text-white",
          "bg-[linear-gradient(100deg,#9e1017_0%,#ed1c24_55%,#f0533a_100%)] shadow-[0_2px_10px_-2px_rgba(237,28,36,0.45)]",
          "transition-[filter,box-shadow,transform] duration-200 hover:-translate-y-px hover:brightness-110 hover:shadow-[0_4px_14px_-2px_rgba(240,83,58,0.5)] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          FOCUS,
        )}
      >
        <Image src={qubitIcon} alt="" aria-hidden width={16} height={16} unoptimized className="size-4" />
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
