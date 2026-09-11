import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ signIn: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

import { signIn } from "next-auth/react";
import { LoginForm } from "@/app/(auth)/login/login-form";

describe("LoginForm (SSO-era)", () => {
  it("keeps the credential fields and the quick sign-in, with no TOTP affordance", () => {
    render(<LoginForm callbackUrl="/dashboard" />);
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(document.querySelector("#email")).toBeTruthy();
    expect(document.querySelector("#password")).toBeTruthy();
    // TOTP was removed from login — Entra owns MFA when SSO is configured.
    expect(screen.queryByRole("button", { name: /authenticator code/i })).toBeNull();
    // M10 (DM1.46): Riverbank is the only real tenant — one quick sign-in card.
    expect(screen.getByRole("button", { name: /riverbank/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /kcb/i })).toBeNull();
  });

  it("hides the Microsoft button until SSO is configured", () => {
    render(<LoginForm callbackUrl="/dashboard" />);
    expect(screen.queryByRole("button", { name: /continue with microsoft/i })).toBeNull();
  });

  it("SSO configured → Microsoft-only: the password form and quick sign-in disappear", () => {
    render(<LoginForm callbackUrl="/dashboard" ssoEnabled />);
    const ms = screen.getByRole("button", { name: /continue with microsoft/i });
    expect(document.querySelector("#email")).toBeNull();
    expect(document.querySelector("#password")).toBeNull();
    expect(screen.queryByRole("button", { name: /riverbank/i })).toBeNull();
    fireEvent.click(ms);
    expect(signIn).toHaveBeenCalledWith("microsoft-entra-id", { redirectTo: "/dashboard" });
    // Loader state: the button disables and announces progress until the redirect navigates.
    expect(screen.getByRole("button", { name: /connecting to microsoft/i })).toBeDisabled();
  });

  it("renders an SSO callback error", () => {
    render(<LoginForm callbackUrl="/dashboard" ssoEnabled ssoError="We couldn't sign you in with Microsoft. If you believe you should have access, contact your administrator." />);
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't sign you in with microsoft/i);
  });

  it("quick sign-in fills the email field", () => {
    render(<LoginForm callbackUrl="/dashboard" />);
    fireEvent.click(screen.getByRole("button", { name: /riverbank/i }));
    expect((document.querySelector("#email") as HTMLInputElement).value).toContain("@");
  });
});
