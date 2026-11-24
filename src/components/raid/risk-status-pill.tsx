import { Chip, type ChipTone } from "@/components/ui/status-pill";

const STATUS_TONE: Record<string, ChipTone> = {
  Open: "info",
  Monitoring: "warn",
  Mitigated: "ok",
  Closed: "muted",
};

// A risk closed via materialise is distinguished from one closed by resolution — the
// underlying status string is "Closed" either way (see src/server/risks.ts) so nav.ts's
// open-count filter keeps working; this pill is the only place the distinction is visible.
export function RiskStatusPill({ status, materialised }: { status: string; materialised: boolean }) {
  if (materialised) return <Chip tone="vio">Materialised</Chip>;
  return <Chip tone={STATUS_TONE[status] ?? "muted"}>{status}</Chip>;
}
