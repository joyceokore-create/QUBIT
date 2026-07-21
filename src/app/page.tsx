import { MarketingHeader } from "@/components/marketing/marketing-header";
import { Hero } from "@/components/marketing/hero";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { AudienceSplit } from "@/components/marketing/audience-split";
import { TrustBand } from "@/components/marketing/trust-band";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { SiteFooter } from "@/components/marketing/site-footer";

// Public marketing landing. Product-branded green in both themes — never
// tenant-branded. `/` is a public route (see middleware.ts).
export const metadata = {
  title: "QUBIT — Your entire portfolio. One command center. One copilot.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--qbg)]">
      <MarketingHeader />
      <main>
        <Hero />
        <FeatureGrid />
        <HowItWorks />
        <AudienceSplit />
        <TrustBand />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
