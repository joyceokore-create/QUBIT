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
    // Landing-only type: repoint the --font-display/-body indirection vars to
    // Lufga (loaded globally as --font-lufga in layout.tsx). Scoped to this
    // wrapper, so login and the tenant app shells keep their own faces.
    // `font-sans` re-resolves body text against the overridden --font-body here;
    // headings pick up --font-display via the global h1–h6 rule.
    <div
      className="min-h-screen overflow-x-clip bg-[var(--qbg)] font-sans"
      style={
        {
          "--font-display": "var(--font-lufga)",
          "--font-body": "var(--font-lufga)",
        } as React.CSSProperties
      }
    >
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
