import { describe, expect, it } from "vitest";
import { accessRequestSchema } from "@/lib/access-request-schema";

const base = { fullName: "Ada K.", email: "ada@acme.example", company: "Acme" };

describe("accessRequestSchema", () => {
  it("accepts a valid minimal payload and drops empty jobTitle to undefined", () => {
    const r = accessRequestSchema.parse({ ...base, jobTitle: "" });
    expect(r.jobTitle).toBeUndefined();
  });

  it("trims and lowercases the email", () => {
    const r = accessRequestSchema.parse({ ...base, email: "  ADA@Acme.Example  " });
    expect(r.email).toBe("ada@acme.example");
  });

  it("rejects an invalid email", () => {
    expect(accessRequestSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(accessRequestSchema.safeParse({ email: "ada@acme.example" }).success).toBe(false);
  });

  it("rejects an over-long full name", () => {
    expect(accessRequestSchema.safeParse({ ...base, fullName: "x".repeat(121) }).success).toBe(false);
  });

  it("keeps the honeypot field optional", () => {
    const r = accessRequestSchema.parse({ ...base, companyUrl: "http://bot.example" });
    expect(r.companyUrl).toBe("http://bot.example");
  });

  // UX fidelity D-F3: optional requested role (never Super Admin) and a short reason.
  it("accepts a requestable role and a short reason; drops blanks to undefined", () => {
    const base = { fullName: "user_001", email: "test@example.invalid", company: "Northwind" };
    expect(accessRequestSchema.parse({ ...base, requestedRole: "ProjectManager", reason: "Joining Payments Hub" })).toMatchObject({ requestedRole: "ProjectManager", reason: "Joining Payments Hub" });
    const blank = accessRequestSchema.parse({ ...base, requestedRole: "", reason: "" });
    expect(blank.requestedRole).toBeUndefined();
    expect(blank.reason).toBeUndefined();
  });

  it("refuses Super Admin, unknown roles and a reason over 300 characters", () => {
    const base = { fullName: "user_001", email: "test@example.invalid", company: "Northwind" };
    expect(accessRequestSchema.safeParse({ ...base, requestedRole: "PlatformSuperAdmin" }).success).toBe(false);
    expect(accessRequestSchema.safeParse({ ...base, requestedRole: "Owner" }).success).toBe(false);
    expect(accessRequestSchema.safeParse({ ...base, reason: "x".repeat(301) }).success).toBe(false);
  });
});
