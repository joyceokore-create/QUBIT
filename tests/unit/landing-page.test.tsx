import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "@/components/marketing/hero";

describe("Hero", () => {
  it("shows the headline and a CTA that links to /login", () => {
    render(<Hero />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    const ctas = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/login");
    expect(ctas.length).toBeGreaterThan(0);
  });
});
