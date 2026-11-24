import { describe, expect, it } from "vitest";
import { newPassword, PASSWORD_ERROR_FIELD, SetPasswordFormSchema } from "@/lib/password-schema";
import { MfaCodeFormSchema } from "@/lib/mfa-schema";
import { fieldErrorsFromIssues } from "@/lib/form-errors";

const errorsOf = (v: { password: string; confirm: string }) => {
  const r = SetPasswordFormSchema.safeParse(v);
  return r.success ? {} : fieldErrorsFromIssues(r.error.issues);
};

describe("set-password schema", () => {
  it("asks for a password, then its length, on the password field", () => {
    expect(errorsOf({ password: "", confirm: "" }).password).toBe("Enter a new password.");
    expect(errorsOf({ password: "short", confirm: "short" }).password).toBe("Password must be at least 12 characters.");
  });
  it("puts a mismatch on the confirm field, and a blank confirm asks for it", () => {
    expect(errorsOf({ password: "a-long-enough-pass", confirm: "a-long-enough-pasz" }).confirm).toBe("Passwords don’t match.");
    expect(errorsOf({ password: "a-long-enough-pass", confirm: "" }).confirm).toBe("Confirm your password.");
  });
  it("passes a matching 12+ character password", () => {
    expect(errorsOf({ password: "a-long-enough-pass", confirm: "a-long-enough-pass" })).toEqual({});
    expect(newPassword.safeParse("a-long-enough-pass").success).toBe(true);
  });
  it("maps weak and reused rejections to the password field", () => {
    expect(PASSWORD_ERROR_FIELD).toEqual({ WEAK_PASSWORD: "password", REUSED: "password" });
  });
});

describe("mfa code schema", () => {
  it("accepts exactly six digits", () => {
    expect(MfaCodeFormSchema.safeParse({ token: "123456" }).success).toBe(true);
  });
  it("says what a code looks like for empty or short input", () => {
    for (const token of ["", "123", "12345a"]) {
      const r = MfaCodeFormSchema.safeParse({ token });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe("Enter the 6-digit code from your authenticator app.");
    }
  });
});
