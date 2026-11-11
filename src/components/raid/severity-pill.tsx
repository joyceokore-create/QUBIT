import { cn } from "@/lib/utils";
import { SEVERITY_CLASSES, type SeverityLevel } from "@/components/raid/severity";

export function SeverityPill({ severity, className }: { severity: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-[1.5]",
        SEVERITY_CLASSES[severity as SeverityLevel] ?? "bg-background text-ink-3",
        className,
      )}
    >
      {severity}
    </span>
  );
}
