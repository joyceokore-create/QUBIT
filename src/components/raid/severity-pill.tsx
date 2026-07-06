import { cn } from "@/lib/utils";
import { SEVERITY_CLASSES, type SeverityLevel } from "@/components/raid/severity";

export function SeverityPill({ severity, className }: { severity: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-[4px] px-2 py-0.5 text-[10px] font-semibold tracking-[0.4px] uppercase",
        SEVERITY_CLASSES[severity as SeverityLevel] ?? "bg-background text-ink-3",
        className,
      )}
    >
      {severity}
    </span>
  );
}
