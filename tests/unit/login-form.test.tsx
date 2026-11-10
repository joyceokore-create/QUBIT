import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ signIn: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

import { signIn } from "next-auth/react";
import { LoginForm, type DemoAccount } from "@/app/(auth)/login/login-form";

const DEMO: DemoAccount[] = [
  { name: "Demo Org B", email: "demo.admin@demo-b.example.invalid", password: "pw-demo", initial: "B", brand: "#1b7a3e" },
];

/** Step 1 → step 2: type a work email and press Continue. */
function continueWith(email: string) {
  fireEvent.change(document.querySelector("#email")!, { target: { value: email } });
  fireEvent.submit(document.querySelector("form")!);
}

describe("LoginForm (two-panel, one step per screen — UX plan D8c)", () => {
  beforeEach(() => vi.mocked(signIn).mockClear());

  it("starts on the work-email step with a visible label and placeholder", () => {
    render(<LoginForm callbackUrl="/dashboard" />);
    expect(screen.getByRole("heading", { name: /sign in to qubit/i })).toBeInTheDocument();
    const email = screen.getByLabelText("Work email") as HTMLInputElement;
    expect(email.placeholder).toBe("name@company.com");
    expect(document.querySelector("#password")).toBeNull();
    expect(screen.getByRole("link", { name: /request access/i })).toHaveAttribute("href", "/request-access");
  });

  it("refuses to continue without a complete email domain", () => {
    render(<LoginForm callbackUrl="/dashboard" />);
    continueWith("user@");
    expect(screen.getByRole("alert").textContent).toMatch(/full work email/i);
    expect(document.querySelector("#password")).toBeNull();
  });

  it("email → password signs in with the credentials", async () => {
    render(<LoginForm callbackUrl="/dashboard" />);
    continueWith("user@example.invalid");
    expect(screen.getByText("user@example.invalid")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    await act(async () => fireEvent.submit(document.querySelector("form")!));
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "user@example.invalid", password: "pw", totpCode: undefined, redirect: false });
  });

  it("the authenticator step submits the code with the credentials", async () => {
    render(<LoginForm callbackUrl="/dashboard" />);
    continueWith("user@example.invalid");
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: /enter your code/i }));
    const code = screen.getByLabelText("Authenticator code") as HTMLInputElement;
    // Digits only, six at most.
    fireEvent.change(code, { target: { value: "12a34567" } });
    expect(code.value).toBe("123456");
    await act(async () => fireEvent.submit(document.querySelector("form")!));
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "user@example.invalid", password: "pw", totpCode: "123456", redirect: false });
  });

  it("a failed sign-in gives one generic message, never which part was wrong", async () => {
    vi.mocked(signIn).mockResolvedValueOnce({ error: "CredentialsSignin" } as never);
    render(<LoginForm callbackUrl="/dashboard" />);
    continueWith("user@example.invalid");
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    await act(async () => fireEvent.submit(document.querySelector("form")!));
    expect(screen.getByRole("alert").textContent).toMatch(/invalid email or password/i);
  });

  it("SSO configured → Microsoft-only: no email/password form and no quick sign-in", () => {
    render(<LoginForm callbackUrl="/dashboard" ssoEnabled demoAccounts={DEMO} />);
    const ms = screen.getByRole("button", { name: /sign in with microsoft/i });
    expect(document.querySelector("#email")).toBeNull();
    expect(document.querySelector("#password")).toBeNull();
    expect(screen.queryByRole("button", { name: /demo org b/i })).toBeNull();
    fireEvent.click(ms);
    expect(signIn).toHaveBeenCalledWith("microsoft-entra-id", { redirectTo: "/dashboard" });
    // Loader state: the button disables and announces progress until the redirect navigates.
    expect(screen.getByRole("button", { name: /connecting to microsoft/i })).toBeDisabled();
  });

  it("hides the Microsoft button until SSO is configured", () => {
    render(<LoginForm callbackUrl="/dashboard" />);
    expect(screen.queryByRole("button", { name: /microsoft/i })).toBeNull();
  });

  it("renders an SSO callback error", () => {
    render(<LoginForm callbackUrl="/dashboard" ssoEnabled ssoError="We couldn't sign you in with Microsoft. If you believe you should have access, contact your administrator." />);
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't sign you in with microsoft/i);
  });

  it("quick sign-in uses a synthetic identity and goes straight to the password step", () => {
    render(<LoginForm callbackUrl="/dashboard" demoAccounts={DEMO} />);
    fireEvent.click(screen.getByRole("button", { name: /demo org b/i }));
    expect(screen.getByText("demo.admin@demo-b.example.invalid")).toBeInTheDocument();
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("pw-demo");
  });

  it("shows no quick sign-in when the server sends none (production)", () => {
    render(<LoginForm callbackUrl="/dashboard" />);
    expect(screen.queryByText(/demo quick sign-in/i)).toBeNull();
  });
});
