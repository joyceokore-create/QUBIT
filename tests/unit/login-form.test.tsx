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
    expect(screen.getByRole("button", { name: /riverbank super admin/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /kcb super admin/i })).toBeInTheDocument();
  });

  it("quick sign-in fills the email field", () => {
    render(<LoginForm callbackUrl="/dashboard" />);
    fireEvent.click(screen.getByRole("button", { name: /kcb super admin/i }));
    expect((document.querySelector("#email") as HTMLInputElement).value).toContain("@");
  });
});
