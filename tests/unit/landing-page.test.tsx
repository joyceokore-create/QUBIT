import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "@/components/marketing/hero";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { TrustBand } from "@/components/marketing/trust-band";
import LandingPage from "@/app/page";

describe("Hero", () => {
  it("shows the headline", () => {
    render(<Hero />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("points Get started at the request-access route", () => {
    render(<Hero />);
    const cta = screen.getAllByRole("link", { name: /get started/i })[0];
    expect(cta).toHaveAttribute("href", "/request-access");
  });
});

describe("FeatureGrid", () => {
  it("renders four capability cards", () => {
    render(<FeatureGrid />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
  });
});

describe("HowItWorks", () => {
  it("renders the section heading", () => {
    render(<HowItWorks />);
    expect(screen.getByRole("heading", { name: /reminds\. organizes\. prioritizes\./i })).toBeInTheDocument();
  });
});

describe("TrustBand", () => {
  it("names both groups honestly and invents no statistics", () => {
    render(<TrustBand />);
    expect(screen.getByText(/riverbank group/i)).toBeInTheDocument();
    expect(screen.getByText(/kcb group/i)).toBeInTheDocument();
  });
});

describe("LandingPage", () => {
  it("assembles sections and contains no fabricated statistics or testimonials", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    // Fabricated markers from the Anchor Pario reference must NOT appear.
    for (const banned of ["$2.5B", "500+", "5K+", "98%", "Mary Kamau", "John Ochieng", "Verified Customer"]) {
      expect(text).not.toContain(banned);
    }
    // Honest trust band present.
    expect(screen.getByText(/built for riverbank group & kcb group/i)).toBeInTheDocument();
  });
});
