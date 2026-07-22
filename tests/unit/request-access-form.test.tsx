import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RequestAccessForm } from "@/app/(auth)/request-access/request-access-form";

// The form's "back to home" logo button uses next/navigation's useRouter, which requires an
// app router context that jsdom/RTL doesn't provide — mock it the same way login-form.test.tsx does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

beforeEach(() => {
  vi.spyOn(global, "fetch").mockImplementation((url: string | URL | Request) => {
    const href = typeof url === "string" ? url : url.toString();
    if (href.includes("/api/auth/resolve-org")) {
      return Promise.resolve(new Response(JSON.stringify({ found: false }), { status: 404 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 201 }));
  });
});
afterEach(() => vi.restoreAllMocks());

describe("RequestAccessForm", () => {
  it("shows a validation error when required fields are empty", async () => {
    render(<RequestAccessForm />);
    fireEvent.click(screen.getByRole("button", { name: /request access/i }));
    expect(await screen.findByText(/enter your full name/i)).toBeInTheDocument();
  });

  it("submits and shows the confirmation state", async () => {
    render(<RequestAccessForm />);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Ada K." } });
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "ada@acme.example" } });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: /request access/i }));
    expect(await screen.findByText(/request received/i)).toBeInTheDocument();
    expect(screen.getByText(/ada@acme.example/i)).toBeInTheDocument();
  });

  it("nudges to sign in when the email domain is a known tenant", async () => {
    (global.fetch as unknown as Mock).mockImplementation((url: string) => {
      if (String(url).includes("/api/auth/resolve-org")) {
        return Promise.resolve(new Response(JSON.stringify({ found: true, tenantName: "KCB Group", tenantSlug: "kcb" }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 201 }));
    });
    render(<RequestAccessForm />);
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "sam@kcb.example.invalid" } });
    expect(await screen.findByText(/already uses qubit/i)).toBeInTheDocument();
  });
});
