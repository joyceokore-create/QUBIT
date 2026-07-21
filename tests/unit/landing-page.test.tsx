import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "@/components/marketing/hero";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { HowItWorks } from "@/components/marketing/how-it-works";

describe("Hero", () => {
  it("shows the headline and a CTA that links to /login", () => {
    render(<Hero />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    const ctas = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/login");
    expect(ctas.length).toBeGreaterThan(0);
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
