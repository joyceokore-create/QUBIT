import { Chip } from "@/components/ui/status-pill";
import { SEVERITY_TONE, type SeverityLevel } from "@/components/raid/severity";

/** Severity as a design chip (Low green · Medium blue · High amber · Critical red). */
export function SeverityPill({ severity, className }: { severity: string; className?: string }) {
  return (
    <Chip tone={SEVERITY_TONE[severity as SeverityLevel] ?? "muted"} className={className}>
      {severity}
    </Chip>
  );
}
