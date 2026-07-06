import { cn } from "@/lib/utils";
import { heatBucket, SEVERITY_CLASSES } from "@/components/raid/severity";

export function HeatPill({ probability, impact, className }: { probability: number; impact: number; className?: string }) {
  const bucket = heatBucket(probability, impact);
  return (
    <span
      className={cn(
        "inline-block rounded-[4px] px-2 py-0.5 text-[10px] font-semibold tracking-[0.4px] uppercase",
        SEVERITY_CLASSES[bucket],
        className,
      )}
    >
      {bucket} · {probability}×{impact}
    </span>
  );
}
