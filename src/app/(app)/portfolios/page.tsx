import { ComingSoon } from "@/components/coming-soon";

// Placeholder so the topbar's "Portfolios" pill resolves. The portfolio card
// grid + slide panel land in Phase 6 of the design handoff.
export default function PortfoliosPage() {
  return (
    <div className="flex flex-1 flex-col p-[26px]">
      <ComingSoon
        title="Portfolios"
        description="A card grid of every portfolio with a slide-in drill-down is on its way."
        milestone={6}
      />
    </div>
  );
}
