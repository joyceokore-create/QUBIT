import { Chip } from "@/components/ui/status-pill";
import { heatBucket, SEVERITY_TONE } from "@/components/raid/severity";

/** A risk's heat (probability × impact) as a design chip: "Critical · 4×5". */
export function HeatPill({ probability, impact, className }: { probability: number; impact: number; className?: string }) {
  const bucket = heatBucket(probability, impact);
  return (
    <Chip tone={SEVERITY_TONE[bucket]} className={className}>
      {bucket} · {probability}×{impact}
    </Chip>
  );
}
