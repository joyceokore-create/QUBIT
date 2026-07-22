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
});
