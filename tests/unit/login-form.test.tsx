import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ signIn: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

import { LoginForm } from "@/app/(auth)/login/login-form";

describe("LoginForm (restyled)", () => {
  it("keeps the sign-in fields, the MFA affordance, and both quick sign-ins", () => {
    render(<LoginForm callbackUrl="/dashboard" />);
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(document.querySelector("#email")).toBeTruthy();
    expect(document.querySelector("#password")).toBeTruthy();
    expect(screen.getByRole("button", { name: /enter authenticator code/i })).toBeInTheDocument();
    // M10 (DM1.46): Riverbank is the only real tenant — one quick sign-in card.
    expect(screen.getByRole("button", { name: /riverbank/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /kcb/i })).toBeNull();
  });

  it("quick sign-in fills the email field", () => {
    render(<LoginForm callbackUrl="/dashboard" />);
    fireEvent.click(screen.getByRole("button", { name: /riverbank/i }));
    expect((document.querySelector("#email") as HTMLInputElement).value).toContain("@");
  });
});
